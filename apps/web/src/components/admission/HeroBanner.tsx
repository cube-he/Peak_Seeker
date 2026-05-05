import RankTierBadge from './RankTierBadge';
import { classifyRank, getTier, isHistorical, type RankTier } from '@/utils/classify-rank';

const BG_COLOR_BY_TIER: Record<RankTier, string> = {
  rush:    '#fef0ee',
  stable:  '#ebf2f8',
  safe:    '#e8f1ec',
  elite:   '#f5edd6',
  unknown: '#f0eee6',
};

interface HeroBannerProps {
  university: { is985: boolean; is211: boolean };
  /** The "best prediction" for this university, in the user's selected subject. */
  prediction: {
    point: number;
    confidence: 'high' | 'medium' | 'low';
    subjects: string;
    batch: string;
  } | null;
  userRank: number | null;
}

export default function HeroBanner({ university, prediction, userRank }: HeroBannerProps) {
  let tier: RankTier;
  let body: string;

  if (prediction == null) {
    tier = 'unknown';
    body = '当前数据不足以预估录取位次';
  } else if (userRank == null) {
    tier = 'unknown';
    body = `该校最低组 ${prediction.point.toLocaleString()} 名 — 输入你的位次以查看冲稳保`;
  } else {
    tier = classifyRank(
      userRank,
      prediction.point,
      getTier({ is985: university.is985, is211: university.is211, batch: prediction.batch }),
      isHistorical(prediction.subjects),
    );
    const diff = prediction.point - userRank;
    if (diff < 0) {
      body = `最低组 ${prediction.point.toLocaleString()} 名 — 你需要再涨 ${Math.abs(diff).toLocaleString()} 名`;
    } else if (tier === 'elite') {
      body = `最低组 ${prediction.point.toLocaleString()} 名 — 远高于你的位次`;
    } else {
      body = `最低组 ${prediction.point.toLocaleString()} 名 — 高出 ${diff.toLocaleString()} 名`;
    }
  }

  const showLowConf = prediction?.confidence === 'low';

  return (
    <div
      className="mt-4 px-4 py-3 rounded flex items-center gap-3"
      style={{ background: BG_COLOR_BY_TIER[tier] }}
    >
      <RankTierBadge tier={tier} />
      <span className="text-sm text-text">{body}</span>
      {showLowConf && (
        <span className="text-[11px] text-text-muted ml-auto">仅供参考</span>
      )}
    </div>
  );
}
