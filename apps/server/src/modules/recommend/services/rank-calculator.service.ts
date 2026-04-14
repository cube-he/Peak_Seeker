import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RankResult } from '../interfaces/recommend.types';

/**
 * Sub-module 1: Rank Calculator
 *
 * Converts a raw score + examType into a provincial rank using the
 * ScoreSegment (一分一段表) table.
 */
@Injectable()
export class RankCalculatorService {
  private readonly logger = new Logger(RankCalculatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculate(
    score: number,
    examType: string,
    province = '四川',
    year?: number,
  ): Promise<RankResult> {
    const targetYear = year ?? new Date().getFullYear() - 1;

    // Find the exact score segment
    const segment = await this.prisma.scoreSegment.findUnique({
      where: {
        year_province_examType_score: {
          year: targetYear,
          province,
          examType,
          score,
        },
      },
    });

    if (!segment) {
      // Fallback: find the closest score segment below the given score
      const closest = await this.prisma.scoreSegment.findFirst({
        where: { year: targetYear, province, examType, score: { lte: score } },
        orderBy: { score: 'desc' },
      });

      if (!closest) {
        this.logger.warn(
          `No score segment found for ${targetYear}/${province}/${examType}/${score}`,
        );
        // Return a conservative estimate
        return {
          rank: 0,
          bestRank: 0,
          uncertaintyRange: 0,
          sameScoreCount: 0,
          flagRangeDown: false,
        };
      }

      return this.buildResult(closest.cumulativeCount, closest.count);
    }

    // Also look up the segment one score above for bestRank calculation
    const upperSegment = await this.prisma.scoreSegment.findUnique({
      where: {
        year_province_examType_score: {
          year: targetYear,
          province,
          examType,
          score: score + 1,
        },
      },
    });

    const bestRank = upperSegment
      ? upperSegment.cumulativeCount + 1
      : segment.cumulativeCount - segment.count + 1;

    const sameScoreCount = segment.count;
    const flagRangeDown = sameScoreCount > 300;

    return {
      rank: segment.cumulativeCount,
      bestRank,
      uncertaintyRange: sameScoreCount,
      sameScoreCount,
      flagRangeDown,
    };
  }

  private buildResult(cumulativeCount: number, count: number): RankResult {
    const flagRangeDown = count > 300;
    return {
      rank: cumulativeCount,
      bestRank: cumulativeCount - count + 1,
      uncertaintyRange: count,
      sameScoreCount: count,
      flagRangeDown,
    };
  }
}
