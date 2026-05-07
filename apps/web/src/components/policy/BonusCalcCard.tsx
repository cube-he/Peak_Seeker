'use client';

import { useQuery } from '@tanstack/react-query';
import { Spin, Alert, Tag, Empty } from 'antd';
import { policyApi, type BonusCalcResult } from '@/services/policy';

interface Props {
  /** 老师查看学生时传入；学生查自己时不传（走 /me） */
  studentProfileId?: number;
}

const STALE_MS = 5 * 60 * 1000;

export default function BonusCalcCard({ studentProfileId }: Props) {
  const { data, isLoading, error } = useQuery<BonusCalcResult>({
    queryKey: ['bonus-calc', studentProfileId ?? 'me'],
    queryFn: () =>
      studentProfileId == null
        ? policyApi.getMyBonus()
        : policyApi.getStudentBonus(studentProfileId),
    staleTime: STALE_MS,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spin size="small" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert type="warning" showIcon message="加分计算结果暂不可用" />;
  }

  const { bonusValue, appliedItem, matchedItems, priorityFlags, caveats } = data;

  // 主显示分数
  const valueColor =
    bonusValue >= 20 ? 'red' : bonusValue >= 10 ? 'orange' : bonusValue > 0 ? 'blue' : 'default';

  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-surface-subtle p-3">
      {/* 头部：可享受加分总值 */}
      <div className="flex items-baseline gap-3">
        <span className="text-sm text-text-secondary">系统自动测算可享加分</span>
        <Tag color={valueColor} className="!m-0 !text-base">
          {bonusValue > 0 ? `+${bonusValue} 分` : '无加分'}
        </Tag>
      </div>

      {/* 应用的项 */}
      {appliedItem && (
        <div className="text-sm text-text">
          <span className="text-text-secondary">应用项：</span>
          <span>{appliedItem.reason}</span>
        </div>
      )}

      {/* 命中多项时列出 */}
      {matchedItems.length > 1 && (
        <div className="text-xs text-text-tertiary">
          <span className="mr-1">命中 {matchedItems.length} 项：</span>
          {matchedItems.map((m, i) => (
            <Tag
              key={i}
              color={m === appliedItem ? valueColor : 'default'}
              className="!mr-1"
            >
              {m.reason}（+{m.value}）
            </Tag>
          ))}
        </div>
      )}

      {/* 优先录取标记 */}
      {priorityFlags.length > 0 && (
        <div className="text-sm">
          <span className="text-text-secondary mr-2">优先录取标记：</span>
          {priorityFlags.map((p, i) => (
            <Tag key={i} color="purple" className="!mr-1">
              {p.reason}
            </Tag>
          ))}
        </div>
      )}

      {/* caveats 提示 */}
      {caveats.length > 0 && (
        <ul className="space-y-1 text-xs text-text-tertiary list-disc list-inside">
          {caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      {/* 完全无加分且无优先时提示 */}
      {bonusValue === 0 && priorityFlags.length === 0 && matchedItems.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span className="text-xs text-text-muted">
              当前信息未触发任何加分或优先录取项
            </span>
          }
        />
      )}
    </div>
  );
}
