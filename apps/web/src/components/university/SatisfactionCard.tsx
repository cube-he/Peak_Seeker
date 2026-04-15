'use client';

import { Card, Progress, Space } from 'antd';

interface SatisfactionCardProps {
  overall: number | null;
  life: number | null;
  environ: number | null;
  count: number | null;
}

interface SatisfactionItemProps {
  label: string;
  score: number;
}

function SatisfactionItem({ label, score }: SatisfactionItemProps) {
  // Scores are out of 5; convert to percent for the progress bar
  const percent = Math.round((score / 5) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-sm text-text-secondary shrink-0">{label}</span>
      <Progress
        percent={percent}
        format={() => `${score.toFixed(1)}/5`}
        strokeColor="var(--color-primary)"
        className="flex-1 mb-0"
      />
    </div>
  );
}

export default function SatisfactionCard({
  overall,
  life,
  environ,
  count,
}: SatisfactionCardProps) {
  if (overall == null && life == null && environ == null) return null;

  const titleSuffix = count != null ? `（${count.toLocaleString()} 人评价）` : '';

  return (
    <Card title={`在校生评价${titleSuffix}`} size="small" className="mt-4">
      <Space direction="vertical" className="w-full" size={12}>
        {overall != null && <SatisfactionItem label="综合" score={overall} />}
        {life != null && <SatisfactionItem label="生活" score={life} />}
        {environ != null && <SatisfactionItem label="环境" score={environ} />}
      </Space>
    </Card>
  );
}
