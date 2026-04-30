import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExamType } from './exam-type.helper';

interface LookupResult {
  year: number;
  examType: ExamType;
  score: number;
  rank: number;
  percentile: number; // 0..1
}

interface EquivalentResult {
  base: LookupResult;
  equivalents: LookupResult[];
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

  /** 跨年等位换算 — Task 5 实现 */
  async equivalent(
    _baseYear: number,
    _examType: ExamType,
    _rank: number,
  ): Promise<EquivalentResult> {
    throw new Error('not implemented');
  }
}
