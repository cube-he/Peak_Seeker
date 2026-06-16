// university-rollup.ts
// 「院校优先」视图: 把已算好的候选「院校专业组」按 universityId 上卷成院校条目。
// 纯函数, 不依赖 Prisma / service 内部状态, 便于单测。
// 输入的 group 即 plan-candidate.service 已构建好的 CandidateGroup(含归一化 matchScore)。

import { normalizeRegion } from './region-match';

export interface CandidateUniversitySummary {
  groupCount: number;
  // 该校够得着的组按梯度统计 (冲/稳/保)
  gradientSpread: { chong: number; wen: number; bao: number };
  bestMatchScore: number | null;
  easiestGroupMinRank: number | null; // 位次数字最大 = 最容易进 (保底参考)
  hardestGroupMinRank: number | null; // 位次数字最小 = 最难进 (冲刺参考)
  isPreferred: boolean; // 命中学生意向院校
  preferredRank: number | null; // 意向院校排第几 (1-based), 未命中为 null
  regionMatch: boolean; // 命中意向省份/城市
}

export interface CandidateUniversity {
  universityId: number;
  universityName: string;
  universityCode: string | null;
  university: any;
  groups: any[]; // 该校够得着的组, 已按组最低位次升序 (最难/冲在前)
  summary: CandidateUniversitySummary;
}

export interface RollupContext {
  preferredUniversityNames: Set<string>;
  preferredUniversityIds: Set<number>;
  preferredUniversityOrder: Map<string, number>; // 院校名 -> 意向序号(1-based)
  preferredRegions: Set<string>; // 意向省份 + 城市 合并
}

export const CANDIDATE_UNIVERSITY_SORTS = [
  'UNIVERSITY_OVERALL', // 综合: 意向→软科排名→匹配 (默认)
  'UNIVERSITY_RANK', // 软科排名升序
  'REGION_FIRST', // 地域优先
  'UNIVERSITY_TIER', // 层次: 985→211→双一流→普通
] as const;
export type CandidateUniversitySort = (typeof CANDIDATE_UNIVERSITY_SORTS)[number];

function finiteNums(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function tagScore(u: any): number {
  return (u?.is985 ? 100 : 0) + (u?.is211 ? 60 : 0) + (u?.isDoubleFirstClass ? 40 : 0);
}

function softRankingOf(u: CandidateUniversity): number {
  const r = u.university?.softRanking;
  return typeof r === 'number' && Number.isFinite(r) ? r : Number.MAX_SAFE_INTEGER;
}

// 公办判定: softRanking 公办存综合排名、民办存民办分类排名, 两者不可比;
// 排序时公办优先, 避免民办分类小名次(#5)盖过公办综合名次。
function isPublicUni(u: CandidateUniversity): boolean {
  const n = String(u.university?.runningNature ?? '');
  return n.includes('公办') || n.includes('公立');
}

// 位次匹配档: 0=有稳档组(学生最够得着), 1=有冲档(无稳), 2=只有保底/无匹配。
// 默认排序据此把"保底校"沉到底, 让稳/冲档先出, 而不是被民办保底刷屏。
function fitTier(u: CandidateUniversity): number {
  const sp = u.summary?.gradientSpread ?? { chong: 0, wen: 0, bao: 0 };
  if ((sp.wen ?? 0) > 0) return 0;
  if ((sp.chong ?? 0) > 0) return 1;
  return 2;
}

export function rollupByUniversity(groups: any[], ctx: RollupContext): CandidateUniversity[] {
  const map = new Map<number, any[]>();
  for (const g of groups) {
    const arr = map.get(g.universityId);
    if (arr) arr.push(g);
    else map.set(g.universityId, [g]);
  }

  const result: CandidateUniversity[] = [];
  for (const [universityId, gs] of map.entries()) {
    // 组内展示顺序: 按组最低位次升序 (最难/冲在前), null 垫底
    gs.sort((a, b) => {
      const ar = typeof a.groupMinRank === 'number' ? a.groupMinRank : Infinity;
      const br = typeof b.groupMinRank === 'number' ? b.groupMinRank : Infinity;
      return ar - br;
    });

    const first = gs[0];
    const spread = { chong: 0, wen: 0, bao: 0 };
    for (const g of gs) {
      if (g.suggestedGradient === 'CHONG') spread.chong++;
      else if (g.suggestedGradient === 'BAO') spread.bao++;
      else spread.wen++;
    }
    const ranks = finiteNums(gs.map((g) => g.groupMinRank));
    const scores = finiteNums(gs.map((g) => g.matchScore));
    const name = first.universityName;

    const isPreferred =
      ctx.preferredUniversityIds.has(universityId) ||
      (typeof name === 'string' && ctx.preferredUniversityNames.has(name));
    const preferredRank =
      typeof name === 'string' && ctx.preferredUniversityOrder.has(name)
        ? (ctx.preferredUniversityOrder.get(name) as number)
        : null;
    const prov = first.university?.province;
    const city = first.university?.city;
    const regionMatch =
      (typeof prov === 'string' && ctx.preferredRegions.has(normalizeRegion(prov))) ||
      (typeof city === 'string' && ctx.preferredRegions.has(normalizeRegion(city)));

    result.push({
      universityId,
      universityName: name,
      universityCode: first.universityCode ?? null,
      university: first.university ?? null,
      groups: gs,
      summary: {
        groupCount: gs.length,
        gradientSpread: spread,
        bestMatchScore: scores.length ? Math.max(...scores) : null,
        easiestGroupMinRank: ranks.length ? Math.max(...ranks) : null,
        hardestGroupMinRank: ranks.length ? Math.min(...ranks) : null,
        isPreferred,
        preferredRank,
        regionMatch,
      },
    });
  }
  return result;
}

export function sortCandidateUniversities(
  unis: CandidateUniversity[],
  sort: string,
  _studentRank: number,
): void {
  const byRank = (a: CandidateUniversity, b: CandidateUniversity) =>
    softRankingOf(a) - softRankingOf(b);
  const byMatch = (a: CandidateUniversity, b: CandidateUniversity) =>
    (b.summary.bestMatchScore ?? 0) - (a.summary.bestMatchScore ?? 0);
  const byPublic = (a: CandidateUniversity, b: CandidateUniversity) =>
    Number(isPublicUni(b)) - Number(isPublicUni(a)); // 公办在前
  const byFit = (a: CandidateUniversity, b: CandidateUniversity) =>
    fitTier(a) - fitTier(b); // 稳(0)→冲(1)→保底(2)

  unis.sort((a, b) => {
    if (sort === 'UNIVERSITY_RANK') {
      // 公办优先(综合排名), 再民办(分类排名), 同性质内软科升序
      return byPublic(a, b) || byRank(a, b) || byMatch(a, b);
    }
    if (sort === 'UNIVERSITY_TIER') {
      return tagScore(b.university) - tagScore(a.university) || byRank(a, b) || byMatch(a, b);
    }
    if (sort === 'REGION_FIRST') {
      const r = Number(b.summary.regionMatch) - Number(a.summary.regionMatch);
      if (r !== 0) return r;
      return byFit(a, b) || byPublic(a, b) || byRank(a, b);
    }
    // UNIVERSITY_OVERALL (默认): 意向院校 → 位次匹配(稳→冲→保) → 公办 → 软科排名 → 匹配度
    const pref = Number(b.summary.isPreferred) - Number(a.summary.isPreferred);
    if (pref !== 0) return pref;
    const ar = a.summary.preferredRank ?? Number.MAX_SAFE_INTEGER;
    const br = b.summary.preferredRank ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return byFit(a, b) || byPublic(a, b) || byRank(a, b) || byMatch(a, b);
  });
}
