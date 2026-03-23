'use client';

type ChipVariant = 'rush' | 'stable' | 'safe' | 'elite' | 'ai' | 'default';

interface StatusChipProps {
  variant: ChipVariant;
  children: React.ReactNode;
  size?: 'sm' | 'default';
}

const variantStyles: Record<ChipVariant, string> = {
  rush: 'bg-error-container text-on-error-container',
  stable: 'bg-primary-fixed text-on-primary-fixed',
  safe: 'bg-secondary-fixed text-on-secondary-fixed',
  elite: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  ai: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  default: 'bg-surface-container-high text-on-surface-variant',
};

export default function StatusChip({
  variant,
  children,
  size = 'default',
}: StatusChipProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-0.5' : 'text-xs px-3 py-1';

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-semibold font-label
        ${sizeClasses}
        ${variantStyles[variant]}
      `}
    >
      {children}
    </span>
  );
}
