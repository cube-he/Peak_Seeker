import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { ImportTarget } from './batch-import.service';

/**
 * Three-tier cache refresh after data import:
 *
 * 1. Cold data (in-memory Maps): ScoreSegment, MajorRecommendation,
 *    BatchConfig, MajorNameMapping — loaded once, refreshed on import.
 * 2. Warm data (Redis 24h TTL): SupplementarySummary.
 * 3. Clear + reload affected caches on demand.
 */
@Injectable()
export class CacheRefreshService {
  private readonly logger = new Logger(CacheRefreshService.name);

  // ---- In-memory cold caches ----
  private scoreSegmentCache = new Map<string, any[]>();
  private batchConfigCache = new Map<string, any>();
  private majorMappingCache = new Map<string, string>(); // rawName → standardName
  private majorRecommendationCache = new Map<number, any[]>(); // studentProfileId → recs

  // Redis TTL for warm data (24 hours)
  private static readonly WARM_TTL = 24 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  // ---- Public API ----

  /**
   * Refresh caches relevant to the given import target.
   */
  async refreshForTarget(target: ImportTarget | string): Promise<void> {
    this.logger.log(`Refreshing caches for target: ${target}`);

    switch (target) {
      case 'ScoreSegment':
        await this.refreshScoreSegments();
        break;
      case 'BatchConfig':
        await this.refreshBatchConfigs();
        break;
      case 'Major':
        await this.refreshMajorMappings();
        break;
      case 'University':
      case 'EnrollmentPlan':
      case 'AdmissionRecord':
        // These don't have dedicated caches but may affect warm Redis data
        await this.clearWarmCache(`data:${target.toLowerCase()}`);
        break;
      case 'SupplementaryRecord':
        await this.refreshSupplementarySummary();
        break;
      default:
        this.logger.warn(`No cache refresh strategy for target: ${target}`);
    }
  }

  /**
   * Full refresh of all cold caches — call on application startup.
   */
  async refreshAll(): Promise<void> {
    this.logger.log('Full cache refresh starting...');
    await Promise.all([
      this.refreshScoreSegments(),
      this.refreshBatchConfigs(),
      this.refreshMajorMappings(),
      this.refreshMajorRecommendations(),
    ]);
    this.logger.log('Full cache refresh complete');
  }

  // ---- Cold cache getters ----

  getScoreSegments(key: string): any[] | undefined {
    return this.scoreSegmentCache.get(key);
  }

  getBatchConfig(key: string): any | undefined {
    return this.batchConfigCache.get(key);
  }

  getStandardName(rawName: string): string | undefined {
    return this.majorMappingCache.get(rawName);
  }

  getMajorRecommendations(studentProfileId: number): any[] | undefined {
    return this.majorRecommendationCache.get(studentProfileId);
  }

  // ---- Refresh implementations ----

  private async refreshScoreSegments(): Promise<void> {
    this.scoreSegmentCache.clear();
    const segments = await this.prisma.scoreSegment.findMany({
      orderBy: [{ year: 'desc' }, { score: 'desc' }],
    });

    for (const seg of segments) {
      const key = `${seg.year}:${seg.province}:${seg.examType}`;
      if (!this.scoreSegmentCache.has(key)) {
        this.scoreSegmentCache.set(key, []);
      }
      this.scoreSegmentCache.get(key)!.push(seg);
    }

    this.logger.log(
      `ScoreSegment cache: ${this.scoreSegmentCache.size} groups, ${segments.length} total`,
    );
  }

  private async refreshBatchConfigs(): Promise<void> {
    this.batchConfigCache.clear();
    const configs = await this.prisma.batchConfig.findMany();

    for (const cfg of configs) {
      const key = `${cfg.year}:${cfg.province}:${cfg.batch}:${cfg.examType}`;
      this.batchConfigCache.set(key, cfg);
    }

    this.logger.log(
      `BatchConfig cache: ${this.batchConfigCache.size} entries`,
    );
  }

  private async refreshMajorMappings(): Promise<void> {
    this.majorMappingCache.clear();
    const mappings = await this.prisma.majorNameMapping.findMany();

    for (const m of mappings) {
      this.majorMappingCache.set(m.rawName, m.standardName);
    }

    this.logger.log(
      `MajorNameMapping cache: ${this.majorMappingCache.size} entries`,
    );
  }

  private async refreshMajorRecommendations(): Promise<void> {
    this.majorRecommendationCache.clear();
    const recs = await this.prisma.majorRecommendation.findMany();

    for (const rec of recs) {
      const key = rec.studentProfileId;
      if (!this.majorRecommendationCache.has(key)) {
        this.majorRecommendationCache.set(key, []);
      }
      this.majorRecommendationCache.get(key)!.push(rec);
    }

    this.logger.log(
      `MajorRecommendation cache: ${this.majorRecommendationCache.size} students`,
    );
  }

  private async refreshSupplementarySummary(): Promise<void> {
    // Clear warm Redis cache for supplementary summaries
    await this.clearWarmCache('supplementary_summary');

    // Re-populate Redis with fresh data
    const summaries = await this.prisma.supplementarySummary.findMany();
    for (const s of summaries) {
      const key = `supplementary_summary:${s.year}:${s.province}:${s.batch}:${s.universityId}`;
      await this.redisService.setCache(
        key,
        s,
        CacheRefreshService.WARM_TTL,
      );
    }

    this.logger.log(
      `SupplementarySummary warm cache: ${summaries.length} entries (TTL 24h)`,
    );
  }

  /**
   * Clear all Redis keys matching a prefix pattern.
   */
  private async clearWarmCache(prefix: string): Promise<void> {
    const client = this.redisService.getClient();
    // Use SCAN to find matching keys safely
    const stream = client.scanStream({
      match: `cache:${prefix}:*`,
      count: 100,
    });

    let deletedCount = 0;
    for await (const keys of stream) {
      if ((keys as string[]).length > 0) {
        await client.del(...(keys as string[]));
        deletedCount += (keys as string[]).length;
      }
    }

    if (deletedCount > 0) {
      this.logger.log(
        `Cleared ${deletedCount} warm cache keys with prefix "${prefix}"`,
      );
    }
  }
}
