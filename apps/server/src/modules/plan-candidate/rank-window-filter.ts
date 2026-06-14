// 位次窗口筛选 (服务端): 按院校组的"今年预测最低位次" predictedMinRank.point 过滤.
export interface RankWindow {
  minRank: number; // 高分端对应的小位次
  maxRank: number; // 低分端对应的大位次
}

type GroupLike = { predictedMinRank?: { point?: number | null } | null } | null | undefined;

/** 组的预测位次是否在 [minRank, maxRank] 内. 无预测(point 缺失) → false. */
export function groupInRankWindow(group: GroupLike, window: RankWindow): boolean {
  const point = group?.predictedMinRank?.point;
  return typeof point === 'number' && point >= window.minRank && point <= window.maxRank;
}

/** 按位次窗口筛组; 窗口 null → 原样返回同引用; 否则保留命中的、剔除无预测的. */
export function filterGroupsByRankWindow<
  T extends { predictedMinRank?: { point?: number | null } | null },
>(groups: T[], window: RankWindow | null): T[] {
  if (!window) return groups;
  return groups.filter((g) => groupInRankWindow(g, window));
}

/** 院校(上卷)筛: 校内任一组命中窗口; 窗口 null → 原样返回同引用. */
export function filterUniversitiesByRankWindow<
  T extends { groups?: Array<{ predictedMinRank?: { point?: number | null } | null }> },
>(universities: T[], window: RankWindow | null): T[] {
  if (!window) return universities;
  return universities.filter((u) => (u.groups ?? []).some((g) => groupInRankWindow(g, window)));
}

/** 池内预测位次的最小/最大(忽略无预测); 全无 → null. 用于算滑块定义域. */
export function poolRankBounds(
  groups: Array<{ predictedMinRank?: { point?: number | null } | null }>,
): { minPoint: number; maxPoint: number } | null {
  let minPoint = Infinity;
  let maxPoint = -Infinity;
  for (const g of groups) {
    const point = g?.predictedMinRank?.point;
    if (typeof point === 'number') {
      if (point < minPoint) minPoint = point;
      if (point > maxPoint) maxPoint = point;
    }
  }
  return Number.isFinite(minPoint) ? { minPoint, maxPoint } : null;
}
