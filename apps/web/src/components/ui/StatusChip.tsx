'use client';

type ChipVariant = 'rush' | 'stable' | 'safe' | 'elite' | 'ai' | 'default';

interface StatusChipProps {
  variant: ChipVariant;
  children: React.ReactNode;
  size?: 'sm' | 'default';
}

const variantStyles: Record<ChipVariant, string> = {
  rush: 'bg-rush-fixed text-rush',
  stable: 'bg-stable-fixed text-stable',
  safe: 'bg-safe-fixed text-safe',
  elite: 'bg-elite-fixed text-elite',
  ai: 'bg-stable-fixed text-stable',
  default: 'bg-surface-dim text-text-secondary',
};

const sizeStyles: Record<NonNullable<StatusChipProps['size']>, string> = {
  default: 'px-3.5 py-1 text-[13px]',
  sm: 'px-2.5 py-0.5 text-[11px]',
};

export default function StatusChip({
  variant,
  children,
  size = 'default',
}: StatusChipProps) {
  return (
    <span
      className={`
        rounded-full font-sans font-medium inline-flex items-center
        ${sizeStyles[size]}
        ${variantStyles[variant]}
      `}
    >
      {children}
    </span>
  );
}
