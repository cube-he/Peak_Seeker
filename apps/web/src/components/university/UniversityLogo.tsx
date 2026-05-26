'use client';

import { useState } from 'react';

const PASTEL_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#c5d9e8', fg: '#1e3a5f' }, // 蓝
  { bg: '#e8d4b8', fg: '#6b4520' }, // 琥珀
  { bg: '#d4c5e8', fg: '#4a2d70' }, // 紫
  { bg: '#cce0d4', fg: '#1e4a30' }, // 绿
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % PASTEL_PALETTE.length;
}

function firstChar(name: string): string {
  const stripped = name.replace(/^(中国|中央|北京|上海)/, '');
  return stripped[0] ?? name[0] ?? '?';
}

interface UniversityLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
  /** 额外 className(让外层 CSS selector 选中这个节点。例如院校库的
   *  `.rank-row.rank-1 .uni-logo` 加金圈光环) */
  className?: string;
}

export default function UniversityLogo({ name, logoUrl, size = 40, className }: UniversityLogoProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!logoUrl && !errored;

  const palette = PASTEL_PALETTE[hashName(name)];
  const radius = Math.round(size * 0.2);
  const fontSize = Math.round(size * 0.45);

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center overflow-hidden ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: showImage ? '#f0eee6' : palette.bg,
        color: palette.fg,
      }}
      aria-label={name}
    >
      {showImage ? (
        <img
          src={logoUrl!}
          alt={name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onError={() => setErrored(true)}
        />
      ) : (
        <span
          style={{
            fontFamily: "'Crimson Pro', Georgia, serif",
            fontWeight: 600,
            fontSize,
          }}
        >
          {firstChar(name)}
        </span>
      )}
    </div>
  );
}
