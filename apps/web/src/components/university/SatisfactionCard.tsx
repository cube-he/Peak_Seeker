'use client';

import { Card, Progress, Space, Tooltip } from 'antd';

// P2 满意度分布结构：每维度有 1-5 星人数 + count
type StarDistribution = {
  count?: number | null;
  1?: number | null;
  2?: number | null;
  3?: number | null;
  4?: number | null;
  5?: number | null;
};

interface SatisfactionDistribution {
  overall?: StarDistribution;
  life?: StarDistribution;
  environ?: StarDistribution;
}

interface SatisfactionCardProps {
  overall: number | null;
  life: number | null;
  environ: number | null;
  count: number | null;
  // P2 新增
  distribution?: SatisfactionDistribution | null;
  onlineOverall?: number | null;
  onlineOverallCount?: number | null;
  onlineLife?: number | null;
  onlineLifeCount?: number | null;
  onlineEnviron?: number | null;
  onlineEnvironCount?: number | null;
}

// 5 档星级颜色（1星深红 -> 5星绿），用 hex 避免依赖 tailwind class 渲染
const STAR_COLORS = ['#e57373', '#ffb74d', '#fff176', '#aed581', '#66bb6a'];

interface RowProps {
  label: string;
  score: number | null;
  dist?: StarDistribution;
  onlineScore?: number | null;
  onlineCount?: number | null;
}

function SatisfactionRow({ label, score, dist, onlineScore, onlineCount }: RowProps) {
  // 5 段堆叠条：仅当有任一星级人数时显示
  const stars = [1, 2, 3, 4, 5] as const;
  const counts = stars.map((n) => (dist?.[n] ?? 0) as number);
  const total = counts.reduce((a, b) => a + b, 0);
  const hasDist = total > 0;

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-10 text-sm text-text-secondary shrink-0">{label}</span>
        {score != null ? (
          <Progress
            percent={Math.round((score / 5) * 100)}
            format={() => `${score.toFixed(1)}/5`}
            strokeColor="var(--color-primary)"
            className="flex-1 mb-0"
          />
        ) : (
          <span className="flex-1 text-xs text-text-muted">现场评分缺失</span>
        )}
      </div>

      {hasDist && (
        <div className="mt-1.5 ml-[3.25rem] flex h-2 overflow-hidden rounded-full bg-bg-subtle">
          {stars.map((n, i) => {
            const pct = (counts[i] / total) * 100;
            if (pct === 0) return null;
            return (
              <Tooltip key={n} title={`${n} 星：${counts[i].toLocaleString()} 人（${pct.toFixed(1)}%）`}>
                <div
                  style={{ width: `${pct}%`, backgroundColor: STAR_COLORS[i] }}
                  className="h-full"
                />
              </Tooltip>
            );
          })}
        </div>
      )}

      {(onlineScore != null) && (
        <div className="mt-1 ml-[3.25rem] text-[11px] text-text-tertiary">
          网络评分 <span className="font-mono tabular-nums text-text-secondary">{onlineScore.toFixed(1)}</span>
          {onlineCount != null && (
            <span className="ml-1">({onlineCount.toLocaleString()} 人)</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SatisfactionCard({
  overall,
  life,
  environ,
  count,
  distribution,
  onlineOverall,
  onlineOverallCount,
  onlineLife,
  onlineLifeCount,
  onlineEnviron,
  onlineEnvironCount,
}: SatisfactionCardProps) {
  const hasAny =
    overall != null ||
    life != null ||
    environ != null ||
    onlineOverall != null ||
    onlineLife != null ||
    onlineEnviron != null;
  if (!hasAny) return null;

  const titleSuffix = count != null ? `（${count.toLocaleString()} 人评价）` : '';

  return (
    <Card title={`在校生评价${titleSuffix}`} size="small" className="mt-4">
      <Space direction="vertical" className="w-full" size={14}>
        <SatisfactionRow
          label="综合"
          score={overall}
          dist={distribution?.overall}
          onlineScore={onlineOverall}
          onlineCount={onlineOverallCount}
        />
        <SatisfactionRow
          label="生活"
          score={life}
          dist={distribution?.life}
          onlineScore={onlineLife}
          onlineCount={onlineLifeCount}
        />
        <SatisfactionRow
          label="环境"
          score={environ}
          dist={distribution?.environ}
          onlineScore={onlineEnviron}
          onlineCount={onlineEnvironCount}
        />
      </Space>
    </Card>
  );
}
