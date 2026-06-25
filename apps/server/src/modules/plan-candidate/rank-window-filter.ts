// 分数条筛选(服务端): 按院校组的"历史最低录取位次"(groupMinRank) 过滤 —— 与卡片展示的
// 「历史最低 X 分 / 位次 Y」同一来源, 保证"老师选的分数段 = 卡片上看到的历史最低分段"。
//
// 历史教训: 早期按 predictedMinRank.point(预测今年位次) 过滤, 且分数→位次换算用考生当年
// (2026)一分一段; 但卡片展示的是历史最低分(groupMinScore, 来自 admissionBaselineYear=2025)。
// 两套口径(预测位次 vs 历史位次 + 2026 vs 2025 换算)导致: 老师选 500-550, 出来的组展示分却
// 不在 500-550。改为: ① 比对 groupMinRank(历史位次, 与展示同源); ② 分数→位次换算用
// admissionBaselineYear(见 resolveRankWindow 调用处)。两改合一 → 选的=看到的。
export interface RankWindow {
  minRank: number; // 高分端对应的小位次
  maxRank: number; // 低分端对应的大位次
}

type GroupLike = { groupMinRank?: number | null } | null | undefined;

/** 组的历史最低位次是否在 [minRank, maxRank] 内. 无历史线(groupMinRank 缺失) → false(选了分数段就排除无线组). */
export function groupInRankWindow(group: GroupLike, window: RankWindow): boolean {
  const r = group?.groupMinRank;
  return typeof r === 'number' && r >= window.minRank && r <= window.maxRank;
}

/** 按位次窗口筛组; 窗口 null → 原样返回同引用; 否则保留命中的、剔除无历史线的. */
export function filterGroupsByRankWindow<
  T extends { groupMinRank?: number | null },
>(groups: T[], window: RankWindow | null): T[] {
  if (!window) return groups;
  return groups.filter((g) => groupInRankWindow(g, window));
}

/** 院校(上卷)筛: 校内任一组命中窗口; 窗口 null → 原样返回同引用. */
export function filterUniversitiesByRankWindow<
  T extends { groups?: Array<{ groupMinRank?: number | null }> },
>(universities: T[], window: RankWindow | null): T[] {
  if (!window) return universities;
  return universities.filter((u) => (u.groups ?? []).some((g) => groupInRankWindow(g, window)));
}

/** 池内历史最低位次的最小/最大(忽略无线组); 全无 → null. 用于算滑块定义域. */
export function poolRankBounds(
  groups: Array<{ groupMinRank?: number | null }>,
): { minPoint: number; maxPoint: number } | null {
  let minPoint = Infinity;
  let maxPoint = -Infinity;
  for (const g of groups) {
    const r = g?.groupMinRank;
    if (typeof r === 'number') {
      if (r < minPoint) minPoint = r;
      if (r > maxPoint) maxPoint = r;
    }
  }
  return Number.isFinite(minPoint) ? { minPoint, maxPoint } : null;
}
