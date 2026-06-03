import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { judgeBatchEligibility } from '../batch-eligibility/batch-eligibility';
import type {
  BatchEligibilityResult,
  EligibilityRulesJson,
} from '../batch-eligibility/types';

export interface BatchPickerOption {
  /** 批次名（同时也是 value，多省份扩展友好） */
  code: string;
  name: string;
  /** 录取顺序，前端按此排序 */
  order: number;
}

export interface EligibleBatchForStudent extends BatchEligibilityResult {
  batchName: string;        // 兼容前端老字段, 等于 batch
  maxGroupCount: number;
  maxMajorPerGroup: number;
  volunteerMode: string;
  admissionOrder: number;
}

@Injectable()
export class BatchConfigService {
  constructor(private prisma: PrismaService) {}

  async getPickerOptions(year: number, province: string): Promise<BatchPickerOption[]> {
    const rows = await this.prisma.batchConfig.findMany({
      where: { year, province },
      select: { batch: true, admissionOrder: true },
    });
    // 同一 batch 在物理 / 历史下可能各有一行，按 batch 名去重；
    // 若两行 admissionOrder 不一致（schema 未强制相等），取较小者（更早录取）
    const map = new Map<string, BatchPickerOption>();
    for (const r of rows) {
      const existing = map.get(r.batch);
      if (!existing) {
        map.set(r.batch, { code: r.batch, name: r.batch, order: r.admissionOrder });
      } else if (r.admissionOrder < existing.order) {
        existing.order = r.admissionOrder;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }

  async listEligibleForStudent(
    studentId: number,
    user?: {
      role: string;
      studentProfileId?: number | null;
      teacherProfileId?: number | null;
      isSupervisor?: boolean;
    },
  ): Promise<EligibleBatchForStudent[]> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { user: { select: { birthDate: true } } },
    });
    if (!student) throw new NotFoundException('学生不存在');
    if (
      user &&
      user.role !== 'ADMIN' &&
      !user.isSupervisor &&
      user.studentProfileId !== studentId &&
      student.teacherId !== user.teacherProfileId
    ) {
      throw new ForbiddenException('无权查看该学生可填批次');
    }
    const examTypeMap: Record<string, string> = {
      PHYSICS: '物理',
      HISTORY: '历史',
      COMPREHENSIVE_LIBERAL: '文科',
      COMPREHENSIVE_SCIENCE: '理科',
    };
    const examTypeLabel = examTypeMap[student.examType ?? 'PHYSICS'] || '物理';
    const planYear = student.examYear ?? 2026;
    const province = student.province ?? '四川';

    const list = await this.prisma.batchConfig.findMany({
      where: {
        year: planYear,
        province,
        examType: examTypeLabel,
      },
      orderBy: { admissionOrder: 'asc' },
    });

    // 拉所有该省该年分数线 (本届实际线 = examYear, 而非 planYear)
    const examYear = student.examYear ?? planYear;
    const allLines = await this.prisma.batchLine.findMany({
      where: { year: examYear, province },
    });
    // 选科别名: 数据源中可能是 "物理" 或 "物理类"
    const examTypeAliases = examTypeLabel === '物理' ? ['物理', '物理类'] : ['历史', '历史类'];
    const lineFor = (type: 'BATCH_LINE' | 'SPECIAL_LINE' | 'ZHUANKE_LINE') => {
      const batchAliases: string[] = (() => {
        switch (type) {
          case 'BATCH_LINE':
            return ['本科批次', '本科批', '本科'];
          case 'SPECIAL_LINE':
            return ['特殊类型招生录取控制分数线', '特殊类型控制线', '特殊类型'];
          case 'ZHUANKE_LINE':
            return ['高职（专科）批次', '专科批次', '专科批', '专科'];
        }
      })();
      const row = allLines.find(
        (r) => batchAliases.includes(r.batch) && examTypeAliases.includes(r.examType),
      );
      return row ? { score: row.score } : null;
    };

    return list.map((b) => {
      const rules = b.eligibilityRules as EligibilityRulesJson | null;
      const line = rules?.scoreFloor ? lineFor(rules.scoreFloor.type) : null;
      const verdict = judgeBatchEligibility(
        {
          examType: student.examType,
          totalScore: student.totalScore,
          isRural: student.isRural,
          county: student.county,
          politicalStatus: student.politicalStatus as unknown as string | null,
          birthDate: student.user?.birthDate ?? null,
        },
        {
          id: b.id,
          batch: b.batch,
          examType: b.examType,
          eligibilityRules: rules,
        },
        line,
      );
      return {
        ...verdict,
        batchName: b.batch,
        maxGroupCount: b.maxGroupCount,
        maxMajorPerGroup: b.maxMajorPerGroup,
        volunteerMode: b.volunteerMode,
        admissionOrder: b.admissionOrder,
      };
    });
  }
}
