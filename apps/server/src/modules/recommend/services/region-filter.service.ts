import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

/**
 * A single region eligibility row loaded from the DB.
 * Matches EligibleRegion model fields used for filtering.
 */
interface EligibleRegionRow {
  program: string;
  area: string;
  county: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  warning?: string;
}

const CACHE_KEY = 'eligible_regions:all';
const CACHE_TTL = 86400; // 24h

/**
 * Keyword-to-program-type mapping for special plan detection.
 * Order matters: more specific keywords (部属/国家级) must be checked before defaults.
 */
const FREE_TEACHER_NATIONAL_KEYWORDS = ['部属', '国家级'];
const FREE_TEACHER_PROVINCIAL_KEYWORDS = ['省级', '省属'];

/**
 * Sub-module: Region Eligibility Filter
 *
 * Loads EligibleRegion data once (Redis → DB fallback) and exposes:
 *   - loadRegions():           populate triple-nested index
 *   - detectSpecialProgram():  keyword-based program type detection
 *   - isEligible():            county-level (or city-level fallback) eligibility check
 *
 * Internal index structure: Map<program, Map<area/city, Set<county>>>
 * This gives O(1) lookup at filter time regardless of dataset size (~2400 rows).
 */
@Injectable()
export class RegionFilterService {
  private readonly logger = new Logger(RegionFilterService.name);

  // Triple-nested index: program → city → Set<county>
  private regionIndex = new Map<string, Map<string, Set<string>>>();
  private loaded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Loads all EligibleRegion rows and builds the in-memory triple index.
   * Idempotent: subsequent calls return immediately if already loaded.
   */
  async loadRegions(): Promise<void> {
    if (this.loaded) return;

    const cached = await this.redisService.getCache<EligibleRegionRow[]>(
      CACHE_KEY,
    );

    let rows: EligibleRegionRow[];

    if (cached) {
      rows = cached;
      this.logger.debug(
        `RegionFilter: loaded ${rows.length} rows from Redis cache`,
      );
    } else {
      rows = await this.prisma.eligibleRegion.findMany({
        select: { program: true, area: true, county: true },
      });
      this.logger.debug(
        `RegionFilter: loaded ${rows.length} rows from DB, writing to cache`,
      );
      await this.redisService.setCache(CACHE_KEY, rows, CACHE_TTL);
    }

    this.regionIndex.clear();
    for (const row of rows) {
      // Ensure program-level map exists
      if (!this.regionIndex.has(row.program)) {
        this.regionIndex.set(row.program, new Map());
      }
      const areaMap = this.regionIndex.get(row.program)!;

      // Ensure city-level set exists
      if (!areaMap.has(row.area)) {
        areaMap.set(row.area, new Set());
      }

      // county can be null for city-level-only records; only add non-null counties
      if (row.county !== null) {
        areaMap.get(row.area)!.add(row.county);
      }
    }

    this.loaded = true;
  }

  /**
   * Detects a special program type from batch/planNotes keywords.
   *
   * Concatenates batch and planNotes, then scans for known keywords.
   * Returns the program type string or null for regular batches.
   *
   * @param batch      e.g. "本科一批" | "国家专项计划"
   * @param planNotes  recruitment plan notes text, may be null
   */
  detectSpecialProgram(
    batch: string | null,
    planNotes: string | null,
  ): string | null {
    const text = [batch, planNotes].filter(Boolean).join('');
    if (!text) return null;

    // Check free-teacher keywords first, then determine national vs provincial
    if (text.includes('公费师范') || text.includes('免费师范')) {
      // National-level markers override the default provincial classification
      if (FREE_TEACHER_NATIONAL_KEYWORDS.some((kw) => text.includes(kw))) {
        return 'NATIONAL_FREE_TEACHER';
      }
      // Explicit provincial markers or no qualifier → provincial
      return 'PROVINCIAL_FREE_TEACHER';
    }

    if (text.includes('国家专项')) return 'NATIONAL_SPECIAL_PLAN';
    if (text.includes('地方专项')) return 'RURAL_REVITALIZATION';
    if (text.includes('深度贫困')) return 'DEEP_POVERTY';
    if (text.includes('民族地区')) return 'ETHNIC_BORDER_REGION';

    return null;
  }

  /**
   * Checks whether a student is eligible for a given special program
   * based on their registered city and county.
   *
   * Matching strategy:
   *  1. No areaMap for program → ineligible
   *  2. No student city → ineligible
   *  3. City not in areaMap → ineligible
   *  4. Student has county → exact Set lookup (eligible iff county is in set)
   *  5. Student has no county → permissive city-level fallback: eligible WITH warning
   *
   * IMPORTANT: call loadRegions() before this method in the pipeline.
   *
   * @param program  Program type code (e.g. 'PROVINCIAL_FREE_TEACHER')
   * @param student  Object with city and county fields
   */
  isEligible(
    program: string,
    student: { city: string | null; county: string | null },
  ): EligibilityResult {
    const areaMap = this.regionIndex.get(program);

    // Program not in index → not a regional program or not loaded
    if (!areaMap) return { eligible: false };

    // Can't evaluate without at least a city
    if (!student.city) return { eligible: false };

    const counties = areaMap.get(student.city);

    // City not covered by this program
    if (!counties) return { eligible: false };

    if (student.county) {
      // Precise county-level match
      return { eligible: counties.has(student.county) };
    }

    // County missing → permissive fallback with a prompt to fill in the detail
    return {
      eligible: true,
      warning: '建议完善区县信息以精确匹配专项计划资格',
    };
  }
}
