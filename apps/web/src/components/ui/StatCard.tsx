'use client';

type AccentColor = 'primary' | 'accent' | 'secondary' | 'tertiary' | 'safe' | 'rush' | 'error';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor?: AccentColor;
  icon?: React.ReactNode;
}

// Maps accent prop to left-border color
const borderColorMap: Record<AccentColor, string> = {
  primary: 'border-primary',
  accent: 'border-accent',
  tertiary: 'border-accent',
  secondary: 'border-safe',
  safe: 'border-safe',
  error: 'border-rush',
  rush: 'border-rush',
};

// Maps accent prop to value text color
const valueColorMap: Record<AccentColor, string> = {
  primary: 'text-primary',
  accent: 'text-accent',
  tertiary: 'text-accent',
  secondary: 'text-safe',
  safe: 'text-safe',
  error: 'text-rush',
  rush: 'text-rush',
};

export default function StatCard({
  label,
  value,
  subtitle,
  accentColor = 'primary',
  icon,
}: StatCardProps) {
  return (
    <div
      className={`bg-surface rounded-lg shadow-card hover:shadow-card-hover transition-shadow duration-300 p-5 border-l-[3px] ${borderColorMap[accentColor]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted font-sans mb-2">
            {label}
          </p>
          <p
            className={`font-serif text-[28px] font-semibold [font-variant-numeric:tabular-nums] ${valueColorMap[accentColor]}`}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-text-faint mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="text-text-muted text-2xl">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
