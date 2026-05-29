import type { RankTier } from '@/utils/classify-rank';

const STYLES: Record<RankTier, { bg: string; fg: string; label: string }> = {
  unreachable: { bg: '#f3f4f6', fg: '#6b7280', label: '难达' },
  rush:    { bg: '#fef0ee', fg: '#c53030', label: '冲' },
  stable:  { bg: '#ebf2f8', fg: '#2c5282', label: '稳' },
  safe:    { bg: '#e8f1ec', fg: '#276749', label: '保' },
  elite:   { bg: '#f5edd6', fg: '#b8860b', label: '垫' },
  unknown: { bg: '#f0eee6', fg: '#87867f', label: '暂无预测' },
};

export default function RankTierBadge({ tier }: { tier: RankTier }) {
  const s = STYLES[tier];
  return (
    <span
      className="font-semibold px-2.5 py-1 rounded-full text-xs whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
