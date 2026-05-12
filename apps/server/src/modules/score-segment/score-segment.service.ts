import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExamType, mapExamType } from './exam-type.helper';

export interface LookupResult {
  year: number;
  examType: ExamType;
  score: number;
  rank: number;
  /**
   * 位次百分比 = rank / totalCount（0..1，越小越靠前）。
   * 不是分数百分位（score percentile），而是该位次在全省考生总数中的相对排名。
   */
  percentile: number;
}

export interface EquivalentResult {
  base: LookupResult;
  equivalents: LookupResult[];
}

export interface RushSafeStableConfig {
  rush: { min: number; max: number };
  safe: { min: number; max: number };
  stable: { min: number; max: number };
}

@Injectable()
export class ScoreSegmentService {
  private readonly PROVINCE = '四川';
  private readonly SUPPORTED_YEARS = [2022, 2023, 2024, 2025];

  constructor(private readonly prisma: PrismaService) {}

  /** 分数 → 位次（找 score ≤ 输入 的最高分对应的累计位次） */
  async scoreToRank(year: number, examType: ExamType, score: number): Promise<LookupResult> {
    if (score < 0 || score > 750) throw new BadRequestException('分数需在 0..750');

    const totalCount = await this.getTotalCount(year, examType);
    if (totalCount <= 0) {
      throw new BadRequestException(`${year} ${examType} score segment data not found`);
    }

    const row = await this.prisma.scoreSegment.findFirst({
      where: { year, province: this.PROVINCE, examType, score: { lte: score } },
      orderBy: { score: 'desc' },
    });

    // 高于最高分 → rank=1
    if (!row) {
      return { year, examType, score, rank: 1, percentile: 1 / Math.max(totalCount, 1) };
    }
    return {
      year,
      examType,
      score: row.score,
      rank: row.cumulativeCount,
      percentile: row.cumulativeCount / Math.max(totalCount, 1),
    };
  }

  /** 位次 → 分数（找 cumulativeCount ≥ 输入位次 的最高分） */
  async rankToScore(year: number, examType: ExamType, rank: number): Promise<LookupResult> {
    if (rank < 1) throw new BadRequestException('位次需 ≥ 1');

    const totalCount = await this.getTotalCount(year, examType);

    const row = await this.prisma.scoreSegment.findFirst({
      where: {
        year,
        province: this.PROVINCE,
        examType,
        cumulativeCount: { gte: rank },
      },
      orderBy: { score: 'desc' },
    });

    if (row) {
      return {
        year,
        examType,
        score: row.score,
        rank,
        percentile: rank / Math.max(totalCount, 1),
      };
    }

    // 位次超过总人数 → 返回最低分
    const lowest = await this.prisma.scoreSegment.findFirst({
      where: { year, province: this.PROVINCE, examType },
      orderBy: { score: 'asc' },
    });
    return {
      year,
      examType,
      score: lowest?.score ?? 0,
      rank,
      percentile: 1,
    };
  }

  /** 总人数 = 该年该科类 cumulativeCount 最大值 */
  private async getTotalCount(year: number, examType: ExamType): Promise<number> {
    const row = await this.prisma.scoreSegment.findFirst({
      where: { year, province: this.PROVINCE, examType },
      orderBy: { cumulativeCount: 'desc' },
    });
    return row?.cumulativeCount ?? 0;
  }

  /**
   * 跨年等位换算（线性比例法）
   * p = R / N_baseYear
   * 对每个目标年 y: examType_y = mapExamType(K, y); R_y = round(p × N_y); 查 rankToScore
   */
  async equivalent(
    baseYear: number,
    examType: ExamType,
    rank: number,
  ): Promise<EquivalentResult> {
    const baseTotal = await this.getTotalCount(baseYear, examType);
    if (baseTotal === 0) {
      throw new BadRequestException(`${baseYear} 年 ${examType} 无数据`);
    }
    const baseScore = await this.rankToScore(baseYear, examType, rank);
    const p = rank / baseTotal;

    const targetYears = this.SUPPORTED_YEARS.filter((y) => y !== baseYear);
    const equivalents: LookupResult[] = [];
    for (const y of targetYears) {
      const yExamType = mapExamType(examType, y);
      const yTotal = await this.getTotalCount(y, yExamType);
      if (yTotal === 0) continue; // 目标年缺数据，跳过
      const Ry = Math.max(1, Math.round(p * yTotal));
      const yScore = await this.rankToScore(y, yExamType, Ry);
      equivalents.push(yScore);
    }

    return {
      base: { ...baseScore, rank, percentile: p },
      equivalents,
    };
  }

  /**
   * 冲稳保判定。ratio = 院校历史最低位次 / 学生位次。
   * - rush.min ≤ ratio < rush.max → 'rush'
   * - safe.min ≤ ratio ≤ safe.max → 'safe'
   * - stable.min < ratio ≤ stable.max → 'stable'
   * - 其他 → null
   */
  classify(
    studentRank: number,
    universityRank: number,
    config: RushSafeStableConfig,
  ): 'rush' | 'safe' | 'stable' | null {
    if (!studentRank || !universityRank) return null;
    const r = universityRank / studentRank;
    if (r >= config.rush.min && r < config.rush.max) return 'rush';
    if (r >= config.safe.min && r <= config.safe.max) return 'safe';
    if (r > config.stable.min && r <= config.stable.max) return 'stable';
    return null;
  }
}
