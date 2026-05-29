/**
 * 院校录取概率分档（冲/稳/保/垫）。
 * 本文件是前端 apps/web/src/utils/classify-rank.ts + admission-thresholds.ts 的独立副本——
 * 修改分档逻辑或阈值时，必须同步前端那两个文件。
 */

export type Tier = '985' | '211' | '普通本科' | '专科';
export type RankTier = 'unreachable' | 'rush' | 'stable' | 'safe' | 'elite' | 'unknown';

interface TierThresholds {
  stable: number;
  safe: number;
  /** 存储但未在 classifyRank 内显式比较；elite 区间由 else 分支隐含。 */
  elite: number;
}

const TIER_THRESHOLDS: Record<Tier, TierThresholds> = {
  '985': { stable: 1500, safe: 5000, elite: 15000 },
  '211': { stable: 4000, safe: 12000, elite: 30000 },
  '普通本科': { stable: 10000, safe: 30000, elite: 80000 },
  '专科': { stable: 20000, safe: 60000, elite: 150000 },
};

const HISTORY_SCIENCE_MULTIPLIER = 1.5;

const RATIO_THRESHOLDS = { rushMax: -0.10, stableMax: 0.15, safeMax: 0.50 };

/** ratio < UNREACHABLE_RATIO → 院校位次远高于学生 50%+，列出来只会误导。 */
const UNREACHABLE_RATIO = -0.5;

const RISK_ORDER: RankTier[] = ['unreachable', 'rush', 'stable', 'safe', 'elite'];

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

export function isHistorical(subjects: string): boolean {
  return /历史|文科/.test(subjects);
}

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
  const absElite = t.elite * m;

  let absTier: RankTier;
  if (diff < -absElite) absTier = 'unreachable';
  else if (diff < -absStable) absTier = 'rush';
  else if (diff < absStable) absTier = 'stable';
  else if (diff < absSafe) absTier = 'safe';
  else absTier = 'elite';

  let ratioTier: RankTier;
  if (ratio < UNREACHABLE_RATIO) ratioTier = 'unreachable';
  else if (ratio < RATIO_THRESHOLDS.rushMax) ratioTier = 'rush';
  else if (ratio < RATIO_THRESHOLDS.stableMax) ratioTier = 'stable';
  else if (ratio < RATIO_THRESHOLDS.safeMax) ratioTier = 'safe';
  else ratioTier = 'elite';

  const absIdx = RISK_ORDER.indexOf(absTier);
  const ratioIdx = RISK_ORDER.indexOf(ratioTier);
  return RISK_ORDER[Math.min(absIdx, ratioIdx)];
}
