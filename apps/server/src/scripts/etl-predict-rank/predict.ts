/**
 * subjectWeight: how the target year's subject pool size compares to a historical year.
 * Larger N_target / N_historical → same rank in target year is "harder" (more competitors above).
 * Returns 1 (no adjustment) when either side is unknown.
 */
export function subjectWeight(N_target: number | null, N_historical: number | null): number {
  if (N_target == null || N_historical == null) return 1;
  if (N_target === 0 || N_historical === 0) return 1;
  return N_target / N_historical;
}

/**
 * planWeight: how the target year's plan count compares to a historical year.
 * Larger P_target relative to P_historical means looser threshold this year, so
 * historical_rank gets multiplied by P_target/P_historical to scale up.
 * e.g. if target has 2× the plans, the min-admitted rank is roughly 2× larger (worse-ranked accepted).
 * Returns 1 (no adjustment) when either side is unknown.
 */
export function planWeight(P_historical: number | null, P_target: number | null): number {
  if (P_historical == null || P_target == null) return 1;
  if (P_historical === 0 || P_target === 0) return 1;
  return P_target / P_historical;
}

export interface PredictInput {
  /** sorted desc by year, max 3 */
  history: Array<{ year: number; minRank: number }>;
  /** plan count for target year, null if unknown */
  planTarget: number | null;
  /** plan count for each historical year keyed by year */
  planHistorical: Record<number, number | null>;
  /** target year subject pool (canonical) */
  poolTarget: number | null;
  /** historical subject pool keyed by year */
  poolHistorical: Record<number, number | null>;
  /** true if poolTarget came from target-1 fallback */
  poolTargetIsProxy: boolean;
}

export interface PredictOutput {
  point: number;
  conservative: number;
  optimistic: number;
  basisYears: number[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Year weights from most recent (index 0) to oldest (index 2).
 * When history has fewer than 3 entries, weights are sliced + renormalized
 * (divided by their sum) so `point` is always a true weighted average regardless
 * of history length. Evidence sufficiency is reflected via `confidence`,
 * not by deflating the point estimate.
 */
const YEAR_WEIGHTS = [0.5, 0.3, 0.2];

export function predictMinRank(input: PredictInput): PredictOutput | null {
  const { history, planTarget, planHistorical, poolTarget, poolHistorical, poolTargetIsProxy } = input;

  if (history.length < 2) return null;
  // target pool unknown (proxy fallback already attempted upstream by ETL caller)
  if (poolTarget == null) return null;

  const equivRanks: number[] = [];
  for (const h of history) {
    const N_y = poolHistorical[h.year] ?? null;
    const P_y = planHistorical[h.year] ?? null;
    const sw = subjectWeight(poolTarget, N_y);
    const pw = planWeight(P_y, planTarget);
    equivRanks.push(h.minRank * sw * pw);
  }

  const usedWeights = YEAR_WEIGHTS.slice(0, equivRanks.length);
  const totalWeight = usedWeights.reduce((a, b) => a + b, 0);
  const point = equivRanks.reduce((acc, v, i) => acc + v * usedWeights[i], 0) / totalWeight;

  // Confidence ladder:
  // - 3 years + non-proxy pool + non-null planTarget → high
  // - 2-3 years + non-proxy pool + non-null planTarget → medium
  // - proxy pool but planTarget known → medium
  // - planTarget null (threshold unknown) → low
  const confidence: PredictOutput['confidence'] =
    history.length === 3 && !poolTargetIsProxy && planTarget != null ? 'high'
    : history.length >= 2 && !poolTargetIsProxy && planTarget != null ? 'medium'
    : poolTargetIsProxy && planTarget != null ? 'medium'
    : 'low';

  return {
    point: Math.round(point),
    conservative: Math.round(Math.max(...equivRanks)),
    optimistic: Math.round(Math.min(...equivRanks)),
    basisYears: history.map(h => h.year),
    confidence,
  };
}
