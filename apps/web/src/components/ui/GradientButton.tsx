'use client';

import { ButtonHTMLAttributes } from 'react';

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'default' | 'large';
  variant?: 'primary' | 'secondary' | 'accent';
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<NonNullable<GradientButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-br from-primary to-primary-light text-white shadow-glow-primary hover:shadow-glow-primary-lg',
  secondary:
    'bg-surface text-text-secondary shadow-ring hover:shadow-card-hover',
  accent:
    'bg-accent text-white shadow-glow-accent',
};

const sizeClasses: Record<NonNullable<GradientButtonProps['size']>, string> = {
  default: 'h-10 px-6 text-sm',
  large: 'h-12 px-7 text-[15px]',
};

export default function GradientButton({
  children,
  size = 'default',
  variant = 'primary',
  icon,
  fullWidth,
  className = '',
  ...props
}: GradientButtonProps) {
  return (
    <button
      className={`
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${fullWidth ? 'w-full' : ''}
        inline-flex items-center justify-center gap-2
        rounded font-sans font-medium
        border-0 cursor-pointer
        transition-all duration-200
        hover:-translate-y-px
        active:translate-y-0
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
        ${className}
      `}
      {...props}
    >
      {icon && <span className="text-lg">{icon}</span>}
      {children}
    </button>
  );
}
