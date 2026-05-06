'use client';
import { Progress } from 'antd';

interface Props {
  percent: number;
  filled: number;
  total: number;
  missing?: string[];
}

export default function CompactProgress({ percent, filled, total, missing = [] }: Props) {
  const visibleMissing = missing.slice(0, 3).join('、');
  const moreCount = missing.length > 3 ? missing.length : 0;
  return (
    <div className="flex items-center gap-3 text-xs text-text-secondary">
      <Progress percent={percent} size="small" className="flex-1 max-w-md" />
      <span className="text-text-faint whitespace-nowrap">{filled}/{total}</span>
      {missing.length > 0 && (
        <span className="text-text-faint truncate">
          · 缺：{visibleMissing}{moreCount ? ` 等${moreCount}项` : ''}
        </span>
      )}
    </div>
  );
}
