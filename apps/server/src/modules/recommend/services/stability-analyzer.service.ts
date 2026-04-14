import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

interface StabilityResult {
  stabilityFactor: number; // 0.5 ~ 1.0
  yearsOfData: number;
  ranks: number[];
  mean: number;
  std: number;
}

/**
 * Sub-module 7: Stability Analyzer
 *
 * Calculates multi-year rank volatility for a university+major combination.
 * stability = 1 - (std / mean), clamped to [0.5, 1.0]
 *
 * Queries the last 3 years of AdmissionRecord data.
 */
@Injectable()
export class StabilityAnalyzerService {
  private readonly logger = new Logger(StabilityAnalyzerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async analyze(
    universityId: number,
    majorId: number,
    province: string,
    referenceYear: number,
  ): Promise<StabilityResult> {
    // Query 3 years of admission data
    const records = await this.prisma.admissionRecord.findMany({
      where: {
        universityId,
        majorId,
        province,
        year: {
          gte: referenceYear - 3,
          lte: referenceYear,
        },
        majorMinRank: { not: null },
      },
      orderBy: { year: 'desc' },
      select: {
        year: true,
        majorMinRank: true,
      },
    });

    const ranks = records
      .map((r) => r.majorMinRank)
      .filter((r): r is number => r !== null);

    if (ranks.length === 0) {
      return {
        stabilityFactor: 0.5, // No data = worst stability
        yearsOfData: 0,
        ranks: [],
        mean: 0,
        std: 0,
      };
    }

    if (ranks.length === 1) {
      return {
        stabilityFactor: 0.7, // Single year = moderate confidence
        yearsOfData: 1,
        ranks,
        mean: ranks[0],
        std: 0,
      };
    }

    const mean = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
    const variance =
      ranks.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ranks.length;
    const std = Math.sqrt(variance);

    // stability = 1 - (std / mean), clamped to [0.5, 1.0]
    const rawStability = mean > 0 ? 1 - std / mean : 0.5;
    const stabilityFactor = Math.max(0.5, Math.min(1.0, rawStability));

    return {
      stabilityFactor,
      yearsOfData: ranks.length,
      ranks,
      mean,
      std,
    };
  }

  /**
   * Batch analyze stability for multiple candidates.
   * Returns a Map keyed by `universityId:majorId`.
   */
  async analyzeBatch(
    candidates: { universityId: number; majorId: number }[],
    province: string,
    referenceYear: number,
  ): Promise<Map<string, StabilityResult>> {
    const results = new Map<string, StabilityResult>();

    // Deduplicate
    const uniqueKeys = new Set(
      candidates.map((c) => `${c.universityId}:${c.majorId}`),
    );

    // Process in parallel batches of 50
    const keys = [...uniqueKeys];
    const batchSize = 50;

    for (let i = 0; i < keys.length; i += batchSize) {
      const chunk = keys.slice(i, i + batchSize);
      const promises = chunk.map(async (key) => {
        const [uid, mid] = key.split(':').map(Number);
        const result = await this.analyze(uid, mid, province, referenceYear);
        results.set(key, result);
      });
      await Promise.all(promises);
    }

    return results;
  }
}
