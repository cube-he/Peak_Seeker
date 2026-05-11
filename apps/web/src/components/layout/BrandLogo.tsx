import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  variant?: 'default' | 'reverse';
  size?: 'sm' | 'md';
  showSubtitle?: boolean;
  className?: string;
};

const sizeStyles = {
  sm: {
    mark: 'h-9 w-9',
    title: 'text-[19px]',
    subtitle: 'text-[9px]',
    gap: 'gap-2.5',
  },
  md: {
    mark: 'h-12 w-12',
    title: 'text-[22px]',
    subtitle: 'text-[10px]',
    gap: 'gap-3',
  },
};

function CompassHomeMark({
  variant,
  className,
}: {
  variant: 'default' | 'reverse';
  className: string;
}) {
  const ink = variant === 'reverse' ? '#ffffff' : '#1e3a5f';
  const accent = variant === 'reverse' ? '#d4a843' : '#b8860b';
  const softInk = variant === 'reverse' ? 'rgba(255,255,255,0.42)' : 'rgba(30,58,95,0.5)';
  const circleInk = variant === 'reverse' ? 'rgba(255,255,255,0.72)' : '#1e3a5f';

  return (
    <svg className={className} viewBox="0 0 58 58" fill="none" aria-hidden="true">
      <path d="M8 22L29 8L50 22" stroke={ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="29" y1="6" x2="29" y2="11" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="29" cy="36" r="13" stroke={circleInk} strokeWidth="1.4" />
      <circle cx="29" cy="36" r="1.6" fill={ink} />
      <path d="M29 36L36 28" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M36 28L33 30L34 32Z" fill={accent} />
      <path d="M29 36L24 42" stroke={softInk} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function BrandLogo({
  href = '/',
  variant = 'default',
  size = 'sm',
  showSubtitle = true,
  className = '',
}: BrandLogoProps) {
  const styles = sizeStyles[size];
  const titleColor = variant === 'reverse' ? 'text-white' : 'text-text';
  const subtitleColor = variant === 'reverse' ? 'text-white/55' : 'text-text-muted';
  const wrapperClass = `inline-flex items-center ${styles.gap} no-underline ${className}`;

  const content = (
    <>
      <CompassHomeMark variant={variant} className={`${styles.mark} flex-shrink-0`} />
      <span className="flex flex-col">
        <span className={`font-serif ${styles.title} font-semibold leading-tight ${titleColor}`}>
          智愿家
        </span>
        {showSubtitle && (
          <span className={`${styles.subtitle} uppercase leading-tight tracking-[1.5px] ${subtitleColor}`}>
            ZHIYUANJIA · WILLNEST
          </span>
        )}
      </span>
    </>
  );

  if (!href) {
    return (
      <div className={wrapperClass} aria-label="智愿家 WillNest">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={wrapperClass} aria-label="返回智愿家首页">
      {content}
    </Link>
  );
}
