'use client';

interface GradientTier {
  key: string;
  label: string;
  color: string;
  items: { id: number }[];
}

interface GradientNavProps {
  tiers: GradientTier[];
}

export default function GradientNav({ tiers }: GradientNavProps) {
  return (
    <nav className="bg-surface rounded-xl p-4 shadow-card">
      <h4 className="text-[10px] uppercase tracking-wider text-text-faint font-medium mb-3">
        梯度导航
      </h4>
      <div className="space-y-1">
        {tiers.map((tier) => (
          <a
            key={tier.key}
            href={`#gradient-${tier.key}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-text-tertiary hover:bg-surface-dim hover:text-text-secondary no-underline transition-colors"
          >
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: tier.color }}
            />
            <span className="truncate text-xs">{tier.label}</span>
            <span className="text-[10px] text-text-faint ml-auto">
              {tier.items.length}
            </span>
          </a>
        ))}
      </div>
    </nav>
  );
}
