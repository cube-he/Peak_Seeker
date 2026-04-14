import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { ScoredCandidate } from '../interfaces/recommend.types';

interface SupplementaryAnalysis {
  scoreAdjustment: number;
  riskNote?: string;
  supplementaryRate: number | null;
  totalRounds: number;
}

/**
 * Sub-module 6: Supplementary Analyzer
 *
 * Queries SupplementarySummary for university+group+major to assess
 * how often a program goes to supplementary recruitment (征集志愿).
 *
 * At 保底段 (t > 0.7): high 征集率 → bonus score (more accessible)
 * At 冲段 (t < 0.3): high 征集率 → flag "冲刺价值有限"
 */
@Injectable()
export class SupplementaryAnalyzerService {
  private readonly logger = new Logger(SupplementaryAnalyzerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async analyze(
    candidate: ScoredCandidate,
    t: number,
    province = '四川',
  ): Promise<SupplementaryAnalysis> {
    // Try Redis warm cache first
    const cacheKey = `supplementary_summary:${candidate.year}:${province}:${candidate.batch || ''}:${candidate.universityId}`;
    const cached = await this.redisService.getCache<any>(cacheKey);

    let summary = cached;
    if (!summary) {
      // Fallback to DB query
      summary = await this.prisma.supplementarySummary.findFirst({
        where: {
          province,
          universityId: candidate.universityId,
        },
        orderBy: { year: 'desc' },
      });
    }

    if (!summary) {
      return {
        scoreAdjustment: 0,
        supplementaryRate: null,
        totalRounds: 0,
      };
    }

    const rate = summary.supplementaryRate
      ? Number(summary.supplementaryRate)
      : 0;
    const totalRounds = summary.totalRounds || 0;

    let scoreAdjustment = 0;
    let riskNote: string | undefined;

    // At 保底段 (t > 0.7): high supplementary rate = bonus (easier to get in)
    if (t > 0.7 && rate > 0.3) {
      scoreAdjustment = rate * 2; // Up to ~2 point bonus
      riskNote = `征集志愿率${(rate * 100).toFixed(0)}%，保底可靠性较高`;
    }

    // At 冲段 (t < 0.3): high supplementary rate = warning
    if (t < 0.3 && rate > 0.5) {
      scoreAdjustment = -rate; // Slight penalty
      riskNote = `征集志愿率${(rate * 100).toFixed(0)}%，冲刺价值有限，该校往年频繁征集`;
    }

    // Multiple rounds of supplementary = additional signal
    if (totalRounds >= 3) {
      if (t > 0.7) {
        scoreAdjustment += 0.5;
      } else if (t < 0.3) {
        riskNote =
          (riskNote ? riskNote + '；' : '') +
          `近年征集${totalRounds}轮，生源不稳定`;
      }
    }

    return {
      scoreAdjustment,
      riskNote,
      supplementaryRate: rate,
      totalRounds,
    };
  }

  /**
   * Batch analyze multiple candidates.
   */
  async analyzeBatch(
    candidates: ScoredCandidate[],
    t: number,
    province?: string,
  ): Promise<Map<number, SupplementaryAnalysis>> {
    const results = new Map<number, SupplementaryAnalysis>();
    for (const c of candidates) {
      results.set(c.admissionRecordId, await this.analyze(c, t, province));
    }
    return results;
  }
}
