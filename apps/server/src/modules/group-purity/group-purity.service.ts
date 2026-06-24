import { Injectable } from '@nestjs/common';

/**
 * 客观纯净度档位。
 *
 * NOTE (2026-06-24): bandFromScore (static method below) is the production source of truth.
 * The assess() rule engine is kept for backward compatibility but is no longer called by
 * compute-group-purity.ts (see docs/superpowers/plans/2026-06-24-group-purity-from-expert-data.md).
 *
 * - S（纯净）: 全同类 / 单门类且 N≤6（可填满无调剂）
 * - A（较纯净）: 同门类、主导专业类 ≥70%、N≤10
 * - B（混杂）: 跨 2 门类有主导 (≥50%)、N≤15
 * - C（高风险）: 其他（跨 3+ 门类、N>15、主导 <50%、N=2 跨门类、空组）
 *
 * 与现有 CleanlinessAssessor（主观纯净度，按学生偏好打分）正交，不冲突。
 */
export type GroupPurityLevel = 'S' | 'A' | 'B' | 'C';

/**
 * 注意字段命名沿用 codebase 的 Major 模型，但真实数据语义反过来了：
 *   - category   实际是【学科门类】（"工学"/"医学"/"理学"/...12 大门类）
 *   - discipline 实际是【专业类】（"计算机类"/"电子信息类"/...92 个专业类）
 */
export interface MajorInfo {
  name: string;
  category: string | null;
  discipline: string | null;
}

export interface GroupPurityInput {
  majors: MajorInfo[];
}

export interface GroupPurityResult {
  level: GroupPurityLevel;
  majorCount: number;
  dominantCategory: string | null;
  dominantCategoryRatio: number;
  dominantDiscipline: string | null;
  dominantDisciplineRatio: number;
  crossCategoryCount: number;
  hasForeign: boolean;
  mixedForeign: boolean;
  reasons: string[];
}

export const FOREIGN_KEYWORDS = ['中外合作', '合作办学', '国际合作', '中外合资'];

function isForeign(name: string): boolean {
  return FOREIGN_KEYWORDS.some((k) => name.includes(k));
}

export function isForeignMajor(name: string): boolean {
  return FOREIGN_KEYWORDS.some((k) => name.includes(k));
}

function topEntry(map: Map<string, number>): [string | null, number] {
  let topKey: string | null = null;
  let topCnt = 0;
  for (const [k, v] of map.entries()) {
    if (v > topCnt) {
      topCnt = v;
      topKey = k;
    }
  }
  return [topKey, topCnt];
}

function downgrade(level: GroupPurityLevel): GroupPurityLevel {
  if (level === 'S') return 'A';
  if (level === 'A') return 'B';
  if (level === 'B') return 'C';
  return 'C';
}

@Injectable()
export class GroupPurityService {
  /**
   * 按专家版分数切档。阈值(2026-06-24 拍板,全量分布参考):
   *   S ≥ 0.85  (~50%, 接近全单一专业类)
   *   A 0.60~0.85 (~11%)
   *   B 0.40~0.60 (~22%)
   *   C < 0.40    (~17%)
   */
  static bandFromScore(score: number | null | undefined): 'S' | 'A' | 'B' | 'C' | null {
    if (score === null || score === undefined || Number.isNaN(score)) return null;
    if (score >= 0.85) return 'S';
    if (score >= 0.60) return 'A';
    if (score >= 0.40) return 'B';
    return 'C';
  }

  assess(input: GroupPurityInput): GroupPurityResult {
    const majors = input.majors ?? [];
    const N = majors.length;

    // 边界 1：空组 → C 兜底
    if (N === 0) {
      return {
        level: 'C',
        majorCount: 0,
        dominantCategory: null,
        dominantCategoryRatio: 0,
        dominantDiscipline: null,
        dominantDisciplineRatio: 0,
        crossCategoryCount: 0,
        hasForeign: false,
        mixedForeign: false,
        reasons: ['组内专业数据缺失（N=0）'],
      };
    }

    // 边界 2：单专业组 → S（无调剂可能）
    if (N === 1) {
      const m = majors[0];
      return {
        level: 'S',
        majorCount: 1,
        dominantCategory: m.category,
        dominantCategoryRatio: 1,
        dominantDiscipline: m.discipline,
        dominantDisciplineRatio: 1,
        crossCategoryCount: m.category ? 1 : 0,
        hasForeign: isForeign(m.name),
        mixedForeign: false,
        reasons: ['单专业组，无调剂可能'],
      };
    }

    // 中外合作识别
    const foreignFlags = majors.map((m) => isForeign(m.name));
    const hasForeign = foreignFlags.some(Boolean);
    const allForeign = foreignFlags.every(Boolean);
    const mixedForeign = hasForeign && !allForeign;

    // 门类 / 专业类统计
    const catCount = new Map<string, number>();
    const discCount = new Map<string, number>();
    for (const m of majors) {
      if (m.category) catCount.set(m.category, (catCount.get(m.category) ?? 0) + 1);
      if (m.discipline) discCount.set(m.discipline, (discCount.get(m.discipline) ?? 0) + 1);
    }
    const [dominantCategory, dominantCategoryCount] = topEntry(catCount);
    const [dominantDiscipline, dominantDisciplineCount] = topEntry(discCount);
    const dominantCategoryRatio = dominantCategoryCount / N;
    const dominantDisciplineRatio = dominantDisciplineCount / N;
    const crossCategoryCount = catCount.size;

    let level: GroupPurityLevel;
    const reasons: string[] = [];

    // 高优先级硬规则
    // 规则 A：N>15 强制 C（即使全同类也无法填满 6 个志愿，调剂风险大）
    if (N > 15) {
      level = 'C';
      reasons.push(`N=${N}>15，超过填报上限，调剂风险高`);
    }
    // 规则 B：N=2 且跨门类 → C（50/50 调剂，比一般 B 严重）
    else if (N === 2 && crossCategoryCount >= 2) {
      level = 'C';
      reasons.push(`N=2 但跨 ${crossCategoryCount} 门类，100% 调剂可能`);
    }
    // 规则 1：N≤6 + 单门类 → S（可填满无调剂）
    else if (N <= 6 && crossCategoryCount === 1) {
      level = 'S';
      reasons.push(`N=${N}≤6 且单门类，可填满 6 志愿无调剂`);
    }
    // 规则 2：主导专业类 ≥90% + 单门类 → S
    else if (dominantDisciplineRatio >= 0.9 && crossCategoryCount === 1) {
      level = 'S';
      reasons.push(
        `主导专业类 ${dominantDiscipline} 占比 ${(dominantDisciplineRatio * 100).toFixed(0)}%≥90%，单门类`,
      );
    }
    // 规则 3：主导专业类 ≥70% + 单门类 + N≤10 → A
    else if (dominantDisciplineRatio >= 0.7 && crossCategoryCount === 1 && N <= 10) {
      level = 'A';
      reasons.push(
        `主导专业类 ${dominantDiscipline} 占比 ${(dominantDisciplineRatio * 100).toFixed(0)}%≥70%，单门类 N=${N}≤10`,
      );
    }
    // 规则 4：主导专业类 ≥50% + 跨门类≤2 + N≤15 → B
    else if (dominantDisciplineRatio >= 0.5 && crossCategoryCount <= 2 && N <= 15) {
      level = 'B';
      reasons.push(
        `主导专业类 ${dominantDiscipline} 占比 ${(dominantDisciplineRatio * 100).toFixed(0)}%≥50%，跨 ${crossCategoryCount} 门类 N=${N}`,
      );
    }
    // 规则 5：其他 → C
    else {
      level = 'C';
      reasons.push(
        `主导专业类占比 ${(dominantDisciplineRatio * 100).toFixed(0)}%、跨 ${crossCategoryCount} 门类、N=${N}`,
      );
    }

    // 中外合作混入降一档（全合作不降）
    if (mixedForeign && level !== 'C') {
      const before = level;
      level = downgrade(level);
      reasons.push(`含中外合作专业但非全部（${foreignFlags.filter(Boolean).length}/${N}），从 ${before} 降至 ${level}`);
    }

    return {
      level,
      majorCount: N,
      dominantCategory,
      dominantCategoryRatio,
      dominantDiscipline,
      dominantDisciplineRatio,
      crossCategoryCount,
      hasForeign,
      mixedForeign,
      reasons,
    };
  }
}
