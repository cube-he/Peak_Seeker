import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

/**
 * A single rule loaded from the HealthRestriction table.
 * Kept as a plain interface to avoid circular Prisma type imports.
 */
interface HealthRestrictionRule {
  conditionCode: string;
  conditionName: string;
  severity: string; // 'hard' | 'soft'
  restrictionScope: string; // '类' | '专业'
  majorCategory: string | null;
  majorCode: string | null;
}

export interface CheckResult {
  excluded: boolean;
  risks: string[];
}

const CACHE_KEY = 'health_restrictions:all';
const CACHE_TTL = 86400; // 24 h

/**
 * Sub-module: Health Restriction Filter
 *
 * Loads HealthRestriction rules once (Redis → DB fallback) and exposes
 * two methods used by CandidateFilterService (Task 8):
 *   - mapLegacyConditions: converts boolean flags → condition codes
 *   - checkCandidate:      evaluates a single candidate against conditions
 *
 * Rule matching logic:
 *   - Universal restriction (majorCategory=null AND majorCode=null) → matches ALL candidates
 *   - restrictionScope="类"    → candidate.majorCategory includes rule.majorCategory
 *   - restrictionScope="专业"  → candidate.majorCode === rule.majorCode (exact match)
 *
 * Severity semantics:
 *   - "hard" → immediate exclusion (excluded: true)
 *   - "soft" → collect risk message, candidate still included
 */
@Injectable()
export class HealthFilterService {
  private readonly logger = new Logger(HealthFilterService.name);

  // Index keyed by conditionCode for O(1) lookup at check time
  private restrictionIndex = new Map<string, HealthRestrictionRule[]>();
  private loaded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Loads all HealthRestriction rows and builds an in-memory index.
   * Idempotent: subsequent calls return immediately if already loaded.
   */
  async loadRestrictions(): Promise<void> {
    if (this.loaded) return;

    // Try warm Redis cache first
    const cached = await this.redisService.getCache<HealthRestrictionRule[]>(
      CACHE_KEY,
    );

    let rows: HealthRestrictionRule[];

    if (cached) {
      rows = cached;
      this.logger.debug(
        `HealthFilter: loaded ${rows.length} rules from Redis cache`,
      );
    } else {
      rows = await this.prisma.healthRestriction.findMany();
      this.logger.debug(
        `HealthFilter: loaded ${rows.length} rules from DB, writing to cache`,
      );
      // Store for 24h so all worker processes share warm data
      await this.redisService.setCache(CACHE_KEY, rows, CACHE_TTL);
    }

    // Build index: conditionCode → rules[]
    this.restrictionIndex.clear();
    for (const row of rows) {
      const existing = this.restrictionIndex.get(row.conditionCode) ?? [];
      existing.push(row);
      this.restrictionIndex.set(row.conditionCode, existing);
    }

    this.loaded = true;
  }

  /**
   * Converts legacy boolean fields on StudentProfile to an array of
   * condition codes compatible with the HealthRestriction table.
   *
   * @param colorBlind      StudentProfile.colorBlind
   * @param colorWeak       StudentProfile.colorWeak
   * @param physicalLimits  StudentProfile.physicalLimits (JSON array of codes, or null)
   */
  mapLegacyConditions(
    colorBlind: boolean,
    colorWeak: boolean,
    physicalLimits: any,
  ): string[] {
    const codes: string[] = [];

    // If physicalLimits is already a list of codes, include them first
    if (Array.isArray(physicalLimits)) {
      codes.push(...physicalLimits);
    }

    // Merge legacy boolean flags, avoiding duplicates
    if (colorBlind && !codes.includes('COLOR_BLIND')) {
      codes.push('COLOR_BLIND');
    }

    if (colorWeak && !codes.includes('COLOR_WEAK')) {
      codes.push('COLOR_WEAK');
    }

    return codes;
  }

  /**
   * Checks whether a candidate should be excluded (or has soft risks)
   * based on the student's condition codes.
   *
   * IMPORTANT: call loadRestrictions() before this method in the pipeline.
   *
   * @param studentConditionCodes  Array of condition codes (from mapLegacyConditions)
   * @param candidate              Slim candidate object with majorCategory & majorCode
   */
  checkCandidate(
    studentConditionCodes: string[],
    candidate: { majorCategory: string | null; majorCode: string | null },
  ): CheckResult {
    if (studentConditionCodes.length === 0) {
      return { excluded: false, risks: [] };
    }

    const risks: string[] = [];

    for (const code of studentConditionCodes) {
      const rules = this.restrictionIndex.get(code);
      if (!rules) continue;

      for (const rule of rules) {
        if (!this.ruleMatchesCandidate(rule, candidate)) continue;

        if (rule.severity === 'hard') {
          // Hard restriction → exclude immediately, no risk messages needed
          return { excluded: true, risks: [] };
        }

        // Soft restriction → accumulate warning, continue evaluating
        risks.push(
          `该专业对${rule.conditionName}有限制要求，建议确认体检标准后填报`,
        );
      }
    }

    return { excluded: false, risks };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Returns true if the rule applies to the given candidate.
   *
   * Matching rules:
   *  1. Universal (both null)  → always matches
   *  2. Scope="类"             → candidate.majorCategory includes rule.majorCategory
   *  3. Scope="专业"           → exact majorCode match
   */
  private ruleMatchesCandidate(
    rule: HealthRestrictionRule,
    candidate: { majorCategory: string | null; majorCode: string | null },
  ): boolean {
    const { restrictionScope, majorCategory, majorCode } = rule;

    // Universal restriction: affects every major
    if (majorCategory === null && majorCode === null) {
      return true;
    }

    if (restrictionScope === '类' && majorCategory !== null) {
      return (candidate.majorCategory ?? '').includes(majorCategory);
    }

    if (restrictionScope === '专业' && majorCode !== null) {
      return candidate.majorCode === majorCode;
    }

    return false;
  }
}
