'use client';

export type Classification = 'rush' | 'safe' | 'stable';

interface RankBadgeProps {
  classification: Classification | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

const CONFIG: Record<Classification, { label: string; bg: string; text: string }> = {
  rush:   { label: '冲', bg: 'bg-rush-fixed',   text: 'text-rush' },
  safe:   { label: '稳', bg: 'bg-safe-fixed',   text: 'text-safe' },
  stable: { label: '保', bg: 'bg-stable-fixed', text: 'text-stable' },
};

export function RankBadge({ classification, size = 'sm', className = '' }: RankBadgeProps) {
  if (!classification) return null;
  const c = CONFIG[classification];
  const sizeCls = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span
      className={`inline-flex items-center rounded ${sizeCls} ${c.bg} ${c.text} font-medium ${className}`}
    >
      ● {c.label}
    </span>
  );
}
