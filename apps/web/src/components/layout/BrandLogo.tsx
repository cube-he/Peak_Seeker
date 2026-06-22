import Image from 'next/image';
import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  variant?: 'default' | 'reverse';
  size?: 'sm' | 'md';
  showSubtitle?: boolean;
  // 只渲染 logo 图标、不渲染文字 (折叠侧栏 64px 宽时用, 避免文字被裁成破相)
  markOnly?: boolean;
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

export default function BrandLogo({
  href = '/',
  variant = 'default',
  size = 'sm',
  showSubtitle = true,
  markOnly = false,
  className = '',
}: BrandLogoProps) {
  const styles = sizeStyles[size];
  const titleColor = variant === 'reverse' ? 'text-white' : 'text-text';
  const subtitleColor = variant === 'reverse' ? 'text-white/55' : 'text-text-muted';
  const wrapperClass = `inline-flex items-center ${styles.gap} no-underline ${className}`;

  // reverse（深色背景）时用 CSS filter 将深蓝 PNG 反白，避免图标不可见
  const markStyle = variant === 'reverse' ? { filter: 'brightness(0) invert(1)' } : undefined;

  const mark = (
    <Image
      src="/images/brand-mark.png"
      alt="智愿家 logo"
      width={48}
      height={48}
      className={`${styles.mark} flex-shrink-0 object-contain`}
      style={markStyle}
      aria-hidden="true"
    />
  );

  const content = markOnly ? mark : (
    <>
      {mark}
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
