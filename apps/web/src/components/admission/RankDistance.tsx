import type { RankTier } from '@/utils/classify-rank';

const COLOR_BY_TIER: Record<RankTier, string> = {
  unreachable: '#6b7280',
  rush:    '#c53030',
  stable:  '#2c5282',
  safe:    '#276749',
  elite:   '#b8860b',
  unknown: '#87867f',
};

interface RankDistanceProps {
  /** predictedRank - userRank, or null when unknown */
  diff: number | null;
  tier: RankTier;
}

/** Format number with sign and locale separator: 1234 → "+1,234"; -1234 → "-1,234". */
function formatDiff(diff: number): string {
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '±';
  return `${sign}${Math.abs(diff).toLocaleString()}`;
}

export default function RankDistance({ diff, tier }: RankDistanceProps) {
  if (diff == null) return null;
  return (
    <span
      className="font-semibold text-sm"
      style={{
        color: COLOR_BY_TIER[tier],
        fontFamily: "'Crimson Pro', Georgia, serif",
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {formatDiff(diff)}
    </span>
  );
}
