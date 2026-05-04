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
 * More plans this year → admission threshold loosens → predicted rank moves toward larger numbers.
 * Use historical/target ratio so historical_rank × planWeight scales correctly.
 * Returns 1 (no adjustment) when either side is unknown.
 */
export function planWeight(P_historical: number | null, P_target: number | null): number {
  if (P_historical == null || P_target == null) return 1;
  if (P_historical === 0 || P_target === 0) return 1;
  return P_historical / P_target;
}
