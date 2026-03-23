'use client';

import { ButtonHTMLAttributes } from 'react';

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'default' | 'large';
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export default function GradientButton({
  children,
  size = 'default',
  variant = 'primary',
  icon,
  fullWidth,
  className = '',
  ...props
}: GradientButtonProps) {
  const sizeClasses = size === 'large' ? 'h-12 px-8 text-base' : 'h-10 px-6 text-sm';

  const variantClasses =
    variant === 'primary'
      ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-glow-primary hover:shadow-glow-primary-lg'
      : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest';

  return (
    <button
      className={`
        ${sizeClasses}
        ${variantClasses}
        ${fullWidth ? 'w-full' : ''}
        inline-flex items-center justify-center gap-2
        rounded-xl font-semibold font-body
        border-0 cursor-pointer
        transition-all duration-300
        hover:translate-y-[-1px]
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
