/**
 * 冲/稳/保/垫 染色阈值。
 *
 * 数值基于 spec-0.5 v2 sanity report 的实测 MAE：
 *   985 MAE 652, 211 MAE 1944, 普通本科 4912, 专科 10118.
 * "stable" 半宽 ≈ 2× MAE，让"稳"区间表示模型不确定性内的合理浮动。
 *
 * 调整阈值：直接编辑此文件 → commit → deploy。git 留版本历史。
 */

export type Tier = '985' | '211' | '普通本科' | '专科';

export interface TierThresholds {
  /** |diff| < stable → 稳 */
  stable: number;
  /** stable ≤ |diff| < safe → 保 (diff>0) 或 冲 (diff<0) */
  safe: number;
  /** |diff| ≥ elite → 垫 (diff>0) */
  elite: number;
}

export const TIER_THRESHOLDS: Record<Tier, TierThresholds> = {
  '985':     { stable: 1500,  safe: 5000,  elite: 15000 },
  '211':     { stable: 4000,  safe: 12000, elite: 30000 },
  '普通本科': { stable: 10000, safe: 30000, elite: 80000 },
  '专科':    { stable: 20000, safe: 60000, elite: 150000 },
};

/** 历史科 MAPE (14.74%) 是物理科 (6.36%) 的 ~2.3x；阈值放宽 1.5x 缓冲。 */
export const HISTORY_SCIENCE_MULTIPLIER = 1.5;

/** 相对比例阈值（与绝对阈值并行判定，取风险更高的档）。 */
export const RATIO_THRESHOLDS = {
  /** ratio < rushMax → 冲 */
  rushMax: -0.10,
  /** rushMax ≤ ratio < stableMax → 稳 */
  stableMax: 0.15,
  /** stableMax ≤ ratio < safeMax → 保；否则 → 垫 */
  safeMax: 0.50,
};
