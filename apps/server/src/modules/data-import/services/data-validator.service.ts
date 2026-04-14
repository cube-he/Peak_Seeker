import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ValidationCheck {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

export interface ValidationResult {
  checks: ValidationCheck[];
  canProceed: boolean;
}

@Injectable()
export class DataValidatorService {
  private readonly logger = new Logger(DataValidatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all 6 validation checks against the current database state
   * and (optionally) incoming data rows.
   */
  async validate(incoming?: {
    rows?: Record<string, any>[];
    target?: string;
    year?: number;
  }): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];

    checks.push(await this.checkUniversityCount());
    checks.push(await this.checkPerYearVolume());
    checks.push(await this.checkRandomSample());
    checks.push(this.checkAbnormalRanks(incoming?.rows));
    checks.push(this.checkCodeUniqueness(incoming?.rows));
    checks.push(await this.checkDiffFromLastImport(incoming?.target));

    const canProceed = checks.every((c) => c.status !== 'FAIL');

    this.logger.log(
      `Validation complete: ${checks.filter((c) => c.status === 'PASS').length} PASS, ` +
        `${checks.filter((c) => c.status === 'WARN').length} WARN, ` +
        `${checks.filter((c) => c.status === 'FAIL').length} FAIL — canProceed=${canProceed}`,
    );

    return { checks, canProceed };
  }

  // ---- Check 1: University count should be 2000~3000 ----

  private async checkUniversityCount(): Promise<ValidationCheck> {
    const count = await this.prisma.university.count();
    if (count >= 2000 && count <= 3000) {
      return {
        name: '院校数量检查',
        status: 'PASS',
        detail: `当前院校数 ${count}，在 2000~3000 范围内`,
      };
    }
    if (count === 0) {
      return {
        name: '院校数量检查',
        status: 'WARN',
        detail: `当前院校数为 0（首次导入无历史数据可比较）`,
      };
    }
    return {
      name: '院校数量检查',
      status: 'WARN',
      detail: `当前院校数 ${count}，不在 2000~3000 范围内`,
    };
  }

  // ---- Check 2: Each year should have >10000 records ----

  private async checkPerYearVolume(): Promise<ValidationCheck> {
    const yearCounts = await this.prisma.admissionRecord.groupBy({
      by: ['year'],
      _count: { id: true },
    });

    if (yearCounts.length === 0) {
      return {
        name: '各年数据量检查',
        status: 'WARN',
        detail: '暂无录取数据（首次导入前检查跳过）',
      };
    }

    const low = yearCounts.filter((y) => y._count.id < 10000);
    if (low.length === 0) {
      return {
        name: '各年数据量检查',
        status: 'PASS',
        detail: `所有年份数据量均 > 10000（共 ${yearCounts.length} 年）`,
      };
    }
    const lowDetail = low
      .map((y) => `${y.year}年: ${y._count.id}条`)
      .join(', ');
    return {
      name: '各年数据量检查',
      status: 'WARN',
      detail: `部分年份数据不足 10000: ${lowDetail}`,
    };
  }

  // ---- Check 3: Random sample 10 rows for manual review ----

  private async checkRandomSample(): Promise<ValidationCheck> {
    const total = await this.prisma.admissionRecord.count();
    if (total === 0) {
      return {
        name: '随机抽样检查',
        status: 'WARN',
        detail: '暂无数据可抽样',
      };
    }

    // Fetch 10 random records (MySQL-compatible random sampling)
    const samples = await this.prisma.admissionRecord.findMany({
      take: 10,
      skip: Math.max(0, Math.floor(Math.random() * (total - 10))),
      include: {
        university: { select: { name: true, code: true } },
        major: { select: { name: true, code: true } },
      },
    });

    const sampleSummary = samples
      .map(
        (s) =>
          `${s.university.name}(${s.university.code}) - ${s.major.name} ${s.year}年 最低${s.majorMinScore ?? '?'}分`,
      )
      .join(' | ');

    return {
      name: '随机抽样检查',
      status: 'PASS',
      detail: `抽样 ${samples.length} 条供人工审核: ${sampleSummary}`,
    };
  }

  // ---- Check 4: No abnormal ranks (<0 or >300000) ----

  private checkAbnormalRanks(rows?: Record<string, any>[]): ValidationCheck {
    if (!rows || rows.length === 0) {
      return {
        name: '异常位次检查',
        status: 'PASS',
        detail: '无导入数据需检查（仅数据库校验）',
      };
    }

    // Check common rank-related fields
    const rankFields = [
      'majorMinRank',
      'majorAvgRank',
      'majorMaxRank',
      'major_min_rank',
      'major_avg_rank',
      'major_max_rank',
      'rank',
      'min_rank',
    ];
    const abnormal: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      for (const field of rankFields) {
        const val = rows[i][field];
        if (val !== null && val !== undefined && val !== '') {
          const num = Number(val);
          if (!isNaN(num) && (num < 0 || num > 300000)) {
            abnormal.push(`行 ${i + 1}: ${field}=${val}`);
          }
        }
      }
    }

    if (abnormal.length === 0) {
      return {
        name: '异常位次检查',
        status: 'PASS',
        detail: `所有 ${rows.length} 行位次数据正常`,
      };
    }
    return {
      name: '异常位次检查',
      status: 'FAIL',
      detail: `发现 ${abnormal.length} 处异常: ${abnormal.slice(0, 5).join(', ')}${abnormal.length > 5 ? '...' : ''}`,
    };
  }

  // ---- Check 5: No duplicate codes ----

  private checkCodeUniqueness(rows?: Record<string, any>[]): ValidationCheck {
    if (!rows || rows.length === 0) {
      return {
        name: '编码唯一性检查',
        status: 'PASS',
        detail: '无导入数据需检查',
      };
    }

    // Check code field for duplicates
    const codeField =
      rows[0].code !== undefined
        ? 'code'
        : rows[0].university_code !== undefined
          ? 'university_code'
          : null;

    if (!codeField) {
      return {
        name: '编码唯一性检查',
        status: 'PASS',
        detail: '数据中无编码字段，跳过此检查',
      };
    }

    const codes = rows.map((r) => r[codeField]).filter(Boolean);
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const c of codes) {
      const key = String(c);
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    if (duplicates.length === 0) {
      return {
        name: '编码唯一性检查',
        status: 'PASS',
        detail: `${codes.length} 个编码均唯一`,
      };
    }
    return {
      name: '编码唯一性检查',
      status: 'FAIL',
      detail: `发现 ${duplicates.length} 个重复编码: ${[...new Set(duplicates)].slice(0, 10).join(', ')}`,
    };
  }

  // ---- Check 6: Diff from last import (delete >100 → WARN) ----

  private async checkDiffFromLastImport(
    target?: string,
  ): Promise<ValidationCheck> {
    if (!target) {
      return {
        name: '数据变化量检查',
        status: 'PASS',
        detail: '未指定导入目标，跳过差异检查',
      };
    }

    // Count existing records per table to estimate diff after import
    let currentCount = 0;
    switch (target) {
      case 'University':
        currentCount = await this.prisma.university.count();
        break;
      case 'Major':
        currentCount = await this.prisma.major.count();
        break;
      case 'EnrollmentPlan':
        currentCount = await this.prisma.enrollmentPlan.count();
        break;
      case 'AdmissionRecord':
        currentCount = await this.prisma.admissionRecord.count();
        break;
      case 'ScoreSegment':
        currentCount = await this.prisma.scoreSegment.count();
        break;
      default:
        return {
          name: '数据变化量检查',
          status: 'PASS',
          detail: `不支持的目标表 "${target}"，跳过`,
        };
    }

    // Retrieve last import log for this target
    const lastImport = await this.prisma.auditLog.findFirst({
      where: {
        action: 'DATA_IMPORT',
        entityType: target,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastImport) {
      return {
        name: '数据变化量检查',
        status: 'PASS',
        detail: `"${target}" 无历史导入记录（首次导入）`,
      };
    }

    const lastCount = (lastImport.newValue as any)?.totalRecords ?? 0;
    const diff = currentCount - lastCount;

    if (diff < -100) {
      return {
        name: '数据变化量检查',
        status: 'WARN',
        detail: `"${target}" 当前 ${currentCount} 条，上次导入后有 ${lastCount} 条，减少了 ${Math.abs(diff)} 条（超过 100 阈值）`,
      };
    }

    return {
      name: '数据变化量检查',
      status: 'PASS',
      detail: `"${target}" 当前 ${currentCount} 条，变化量 ${diff >= 0 ? '+' : ''}${diff}，在正常范围`,
    };
  }
}
