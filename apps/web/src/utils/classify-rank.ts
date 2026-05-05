import {
  TIER_THRESHOLDS,
  HISTORY_SCIENCE_MULTIPLIER,
  RATIO_THRESHOLDS,
  type Tier,
} from './admission-thresholds';

export type RankTier = 'rush' | 'stable' | 'safe' | 'elite' | 'unknown';

const RISK_ORDER: RankTier[] = ['rush', 'stable', 'safe', 'elite'];

/**
 * Derive university tier for a given (university flags, batch) row.
 * Order: 985 > 211 > 专科 > 普通本科.
 */
export function getTier(input: {
  is985: boolean;
  is211: boolean;
  batch: string;
}): Tier {
  if (input.is985) return '985';
  if (input.is211) return '211';
  if (input.batch.includes('专科') || input.batch.includes('高职')) return '专科';
  return '普通本科';
}

/** True if the subject string represents history/arts track. */
export function isHistorical(subjects: string): boolean {
  return /历史|文科/.test(subjects);
}

/**
 * Classify a (userRank, predictedRank) into 4 tiers + unknown.
 *
 * Dual-criterion: absolute diff vs tier thresholds, AND relative ratio vs RATIO_THRESHOLDS.
 * Take the risker tier (rush > stable > safe > elite by RISK_ORDER index).
 *
 * Returns 'unknown' when predictedRank is null (insufficient model data).
 */
export function classifyRank(
  userRank: number,
  predictedRank: number | null,
  tier: Tier,
  historical: boolean,
): RankTier {
  if (predictedRank == null) return 'unknown';

  const diff = predictedRank - userRank;
  const ratio = diff / Math.max(1, userRank);

  const t = TIER_THRESHOLDS[tier];
  const m = historical ? HISTORY_SCIENCE_MULTIPLIER : 1;
  const absStable = t.stable * m;
  const absSafe = t.safe * m;

  let absTier: RankTier;
  if (diff < -absStable) absTier = 'rush';
  else if (diff < absStable) absTier = 'stable';
  else if (diff < absSafe) absTier = 'safe';
  else absTier = 'elite';

  let ratioTier: RankTier;
  if (ratio < RATIO_THRESHOLDS.rushMax) ratioTier = 'rush';
  else if (ratio < RATIO_THRESHOLDS.stableMax) ratioTier = 'stable';
  else if (ratio < RATIO_THRESHOLDS.safeMax) ratioTier = 'safe';
  else ratioTier = 'elite';

  const absIdx = RISK_ORDER.indexOf(absTier);
  const ratioIdx = RISK_ORDER.indexOf(ratioTier);
  return RISK_ORDER[Math.min(absIdx, ratioIdx)];
}
