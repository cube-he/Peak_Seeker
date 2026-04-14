import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RangeResult, RankResult } from '../interfaces/recommend.types';

/**
 * Sub-module 3: Range Adapter
 *
 * Calculates the rank search range (rangeUp / rangeDown) based on
 * the student's rank tier. High scorers get a narrower range;
 * low scorers get a wider range. Auto-scales with data density.
 */
@Injectable()
export class RangeAdapterService {
  private readonly logger = new Logger(RangeAdapterService.name);

  // Tier thresholds and corresponding range widths
  private static readonly RANGE_TABLE: {
    maxRank: number;
    rangeUp: number;
    rangeDown: number;
  }[] = [
    { maxRank: 1000, rangeUp: 500, rangeDown: 800 },
    { maxRank: 3000, rangeUp: 1000, rangeDown: 1500 },
    { maxRank: 5000, rangeUp: 1500, rangeDown: 2500 },
    { maxRank: 10000, rangeUp: 2500, rangeDown: 4000 },
    { maxRank: 20000, rangeUp: 4000, rangeDown: 6000 },
    { maxRank: 50000, rangeUp: 6000, rangeDown: 8000 },
    { maxRank: 100000, rangeUp: 8000, rangeDown: 12000 },
    { maxRank: Infinity, rangeUp: 12000, rangeDown: 18000 },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the range for a given provincial rank.
   * If rankResult.flagRangeDown is true, expand rangeDown by 10%.
   */
  async calculate(
    provincialRank: number,
    rankResult?: RankResult,
    province = '四川',
    year?: number,
  ): Promise<RangeResult> {
    const tier = RangeAdapterService.RANGE_TABLE.find(
      (t) => provincialRank <= t.maxRank,
    )!;

    let { rangeUp, rangeDown } = tier;

    // Auto-scale based on data density: count how many admission records
    // exist in the vicinity of this rank to gauge data richness
    const targetYear = year ?? new Date().getFullYear() - 1;
    const nearbyCount = await this.prisma.admissionRecord.count({
      where: {
        province,
        year: targetYear,
        majorMinRank: {
          gte: provincialRank - rangeUp,
          lte: provincialRank + rangeDown,
        },
      },
    });

    // If data is sparse (< 200 records), widen range by 20%
    if (nearbyCount < 200) {
      const scaleFactor = 1.2;
      rangeUp = Math.round(rangeUp * scaleFactor);
      rangeDown = Math.round(rangeDown * scaleFactor);
      this.logger.debug(
        `Sparse data (${nearbyCount} records) — expanded range by 20%`,
      );
    }

    // If same-score count is high, expand rangeDown by 10%
    if (rankResult?.flagRangeDown) {
      rangeDown = Math.round(rangeDown * 1.1);
      this.logger.debug(
        `High same-score count (${rankResult.sameScoreCount}) — expanded rangeDown by 10%`,
      );
    }

    return { rangeUp, rangeDown };
  }
}
