/**
 * 冲/稳/保 分档逻辑(设计稿 classifyTier 的简化版):
 *   diff = uniRank - userRank
 *   diff > 0 → user 比 uni 录取线高(位次更前) → 安全
 *   diff < 0 → user 不够 uni 录取线 → 冲刺
 *   容忍度按 uniRank 比例(高分院校位次窄 → 容忍度大)
 */
export type Tier = 'rush' | 'stable' | 'safe';

export const TIER_TXT: Record<Tier, string> = {
  rush: '冲',
  stable: '稳',
  safe: '保',
};

export const TIER_FULL: Record<Tier, string> = {
  rush: '冲一冲',
  stable: '稳一稳',
  safe: '保一保',
};

export function classifyTier(userRank: number | null | undefined, uniRank: number | null | undefined): Tier | null {
  if (userRank == null || uniRank == null) return null;
  const diff = uniRank - userRank;
  const tolerance = Math.max(uniRank * 0.18, 1500);
  const ratio = diff / tolerance;
  if (ratio >= 0.6) return 'safe';
  if (ratio >= -0.3) return 'stable';
  return 'rush';
}

/**
 * 详情页 hero 5 档梯队判定 → 对应背景图 id + url:
 *   elite   顶尖 985(softRank ≤ 10)
 *   key     985/211/双一流(非顶尖)
 *   voc     职业本科/高职头部
 *   private 民办(本科+专科)
 *   regular 普通本科/公办专科
 */
export interface TierImage {
  id: 'elite' | 'key' | 'voc' | 'private' | 'regular';
  src: string;
}

interface TierImageInput {
  is985?: boolean;
  is211?: boolean;
  isDoubleFirstClass?: boolean;
  softRanking?: number | null;
  softRankList?: string | null;
  level?: string | null;
  nature?: string | null;
}

export function tierImageFor(uni: TierImageInput): TierImage {
  if (uni.is985 && (uni.softRanking ?? 999) <= 10) {
    return { id: 'elite', src: '/img/university/bg-hero-elite.png' };
  }
  if (uni.is985 || uni.is211 || uni.isDoubleFirstClass) {
    return { id: 'key', src: '/img/university/bg-hero-key.png' };
  }
  if (uni.level === '职业本科' || (uni.softRankList === '高职' && (uni.softRanking ?? 999) <= 30)) {
    return { id: 'voc', src: '/img/university/bg-hero-vocational.png' };
  }
  if (uni.nature === '民办') {
    return { id: 'private', src: '/img/university/bg-hero-private.png' };
  }
  // regular 没专属图,沿用 key 的暖调底图(避免空白)
  return { id: 'regular', src: '/img/university/bg-hero-key.png' };
}
