'use client';

import { Progress } from 'antd';

interface Props {
  label: string;
  percent: number;
  hint?: string;
}

/**
 * 双轨进度条单元格。颜色随完成度阶梯变化（绿/琥珀/红）。
 */
export default function ProgressBar({ label, percent, hint }: Props) {
  const color =
    percent >= 80 ? '#276749' : percent >= 50 ? '#b8860b' : '#c53030';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono text-text-secondary">{percent}%</span>
      </div>
      <Progress
        percent={percent}
        strokeColor={color}
        showInfo={false}
        size="small"
      />
      {hint && <p className="text-xs text-text-faint">{hint}</p>}
    </div>
  );
}
