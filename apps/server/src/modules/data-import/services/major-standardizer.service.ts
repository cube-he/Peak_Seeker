import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface StandardizedName {
  rawName: string;
  baseName: string;
  standardName: string;
  suffix: string | null;
  tags: string[];
}

/**
 * Extract bracket content, unify common aliases, auto-tag suffixes,
 * and persist to MajorNameMapping for downstream recommendation matching.
 */
@Injectable()
export class MajorStandardizerService {
  private readonly logger = new Logger(MajorStandardizerService.name);

  // Common suffix patterns that should be tagged
  private static readonly SUFFIX_TAGS: Record<string, string> = {
    实验班: '实验班',
    拔尖计划: '拔尖计划',
    中外合作: '中外合作',
    中外合作办学: '中外合作',
    合作办学: '中外合作',
    国际班: '国际班',
    基地班: '基地班',
    强基计划: '强基计划',
    卓越班: '卓越班',
    创新班: '创新班',
    菁英班: '菁英班',
    试验班: '实验班', // variant
    国际合作: '中外合作',
    中英合作: '中外合作',
    中美合作: '中外合作',
    中澳合作: '中外合作',
    中法合作: '中外合作',
    中德合作: '中外合作',
  };

  // Alias unification: variant → canonical
  private static readonly ALIAS_MAP: Record<string, string> = {
    计算机科学与技术类: '计算机类',
    电子信息科学与技术: '电子信息工程',
    机械设计制造及其自动化: '机械工程',
    土木工程类: '土木类',
    信息与计算科学: '数学与应用数学',
    应用化学: '化学',
    工商管理类: '工商管理',
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Standardize a single major name.
   */
  standardize(rawName: string): StandardizedName {
    const trimmed = rawName.trim();

    // 1. Extract bracket content: "计算机科学与技术（实验班）" → baseName + suffix
    const { base, suffix } = this.extractBracketContent(trimmed);

    // 2. Auto-tag suffixes
    const tags: string[] = [];
    if (suffix) {
      const tag = MajorStandardizerService.SUFFIX_TAGS[suffix];
      if (tag) tags.push(tag);
    }

    // Also scan the base name for keywords (e.g. "中外合作办学" might appear inline)
    for (const [keyword, tag] of Object.entries(
      MajorStandardizerService.SUFFIX_TAGS,
    )) {
      if (base.includes(keyword) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    // 3. Alias unification
    const standardName =
      MajorStandardizerService.ALIAS_MAP[base] ?? base;

    return {
      rawName: trimmed,
      baseName: base,
      standardName,
      suffix: suffix || null,
      tags,
    };
  }

  /**
   * Batch standardize and write mappings to MajorNameMapping.
   * Returns the number of new mappings created.
   */
  async standardizeAndPersist(
    rawNames: string[],
    source: string,
  ): Promise<{ results: StandardizedName[]; newMappings: number }> {
    const results = rawNames.map((n) => this.standardize(n));
    let newMappings = 0;

    // Deduplicate by rawName+source before writing
    const unique = new Map<string, StandardizedName>();
    for (const r of results) {
      unique.set(r.rawName, r);
    }

    for (const std of unique.values()) {
      // Use upsert to avoid duplicates (@@unique([rawName, source]))
      const existing = await this.prisma.majorNameMapping.findUnique({
        where: { rawName_source: { rawName: std.rawName, source } },
      });

      if (!existing) {
        await this.prisma.majorNameMapping.create({
          data: {
            rawName: std.rawName,
            standardName: std.standardName,
            source,
          },
        });
        newMappings++;
      } else if (existing.standardName !== std.standardName) {
        // Update if standard name changed
        await this.prisma.majorNameMapping.update({
          where: { id: existing.id },
          data: { standardName: std.standardName },
        });
      }
    }

    this.logger.log(
      `Standardized ${results.length} names from source="${source}", ${newMappings} new mappings`,
    );

    return { results, newMappings };
  }

  // ---- private helpers ----

  /**
   * Split bracket content from major name.
   * Supports both full-width and half-width parentheses, plus 【】.
   */
  private extractBracketContent(name: string): {
    base: string;
    suffix: string;
  } {
    // Match (content), （content）, 【content】
    const match = name.match(
      /^(.+?)[（(【]([^）)】]+)[）)】]$/,
    );
    if (match) {
      return { base: match[1].trim(), suffix: match[2].trim() };
    }
    return { base: name, suffix: '' };
  }
}
