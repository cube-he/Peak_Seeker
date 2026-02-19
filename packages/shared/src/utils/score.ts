import { RECOMMEND_STRATEGIES } from '../constants/recommend';

/**
 * 计算位次差
 * 正数表示用户位次比录取位次靠后（更难录取）
 * 负数表示用户位次比录取位次靠前（更容易录取）
 */
export function calculateRankDiff(userRank: number, admissionRank: number): number {
  return userRank - admissionRank;
}

/**
 * 根据位次差计算录取概率
 */
export function calculateAcceptRate(rankDiff: number): number {
  if (rankDiff > 10000) return 0.05;
  if (rankDiff > 8000) return 0.1;
  if (rankDiff > 5000) return 0.2;
  if (rankDiff > 3000) return 0.35;
  if (rankDiff > 0) return 0.5;
  if (rankDiff > -2000) return 0.65;
  if (rankDiff > -5000) return 0.8;
  if (rankDiff > -10000) return 0.9;
  return 0.95;
}

/**
 * 根据位次差判断策略类型
 */
export function classifyStrategy(rankDiff: number): 'rush' | 'stable' | 'safe' {
  const { DEFAULT_STABLE_RANGE } = RECOMMEND_STRATEGIES;

  if (rankDiff > DEFAULT_STABLE_RANGE) return 'rush';
  if (rankDiff > -DEFAULT_STABLE_RANGE) return 'stable';
  return 'safe';
}

/**
 * 根据录取概率判断风险等级
 */
export function getRiskLevel(acceptRate: number): 'high' | 'medium' | 'low' {
  if (acceptRate < 0.4) return 'high';
  if (acceptRate < 0.7) return 'medium';
  return 'low';
}

/**
 * 计算等效分数（用于不同年份数据对比）
 * 简化版：假设分数线每年波动在 ±10 分以内
 */
export function calculateEquivalentScore(
  score: number,
  fromYear: number,
  toYear: number,
  yearlyTrends?: { year: number; avgScore: number }[]
): number {
  if (!yearlyTrends || yearlyTrends.length < 2) {
    return score;
  }

  const fromYearData = yearlyTrends.find(t => t.year === fromYear);
  const toYearData = yearlyTrends.find(t => t.year === toYear);

  if (!fromYearData || !toYearData) {
    return score;
  }

  const diff = toYearData.avgScore - fromYearData.avgScore;
  return score + diff;
}
