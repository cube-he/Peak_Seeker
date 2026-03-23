'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor?: 'primary' | 'secondary' | 'tertiary' | 'error';
  icon?: React.ReactNode;
}

const accentColorMap = {
  primary: 'border-l-primary',
  secondary: 'border-l-secondary',
  tertiary: 'border-l-tertiary',
  error: 'border-l-error',
};

const textColorMap = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  error: 'text-error',
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
      className={`bg-surface-container-lowest rounded-xl p-6 border-l-[3px] ${accentColorMap[accentColor]} transition-all duration-300 hover:shadow-ambient`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2">
            {label}
          </p>
          <p className={`text-3xl font-headline font-extrabold ${textColorMap[accentColor]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-on-surface-variant mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="text-on-surface-variant opacity-40 text-2xl">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
