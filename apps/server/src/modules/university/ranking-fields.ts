export interface AdmissionRow {
  majorMinScore: number | null;
  majorMinRank: number | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
}

/**
 * 院校某科类某年度的「最低分及对应位次」：分数最低的一条专业记录。
 * majorMinScore 优先、groupMinScore 兜底（与 UniversityService.aggregateLatestAdmission 同口径）。
 */
export function aggregateMinScoreRank(
  records: AdmissionRow[],
): { minScore: number; minRank: number | null } | null {
  let best: { score: number; rank: number | null } | null = null;
  for (const r of records) {
    const score = r.majorMinScore ?? r.groupMinScore;
    if (score == null) continue;
    const rank = r.majorMinScore != null ? r.majorMinRank : r.groupMinRank;
    if (best == null || score < best.score) best = { score, rank };
  }
  return best == null ? null : { minScore: best.score, minRank: best.rank };
}

/**
 * 院校某科类的「预测位次」：所有专业组预测里 pointRank 最小值（最难专业组作 benchmark，
 * 与 UniversityService.findById 的 bestPrediction 同口径）。recruitType 过滤在查询层完成。
 */
export function pickUniversityPredRank(
  predictions: Array<{ pointRank: number | null }>,
): number | null {
  let min: number | null = null;
  for (const p of predictions) {
    if (p.pointRank == null) continue;
    if (min == null || p.pointRank < min) min = p.pointRank;
  }
  return min;
}
