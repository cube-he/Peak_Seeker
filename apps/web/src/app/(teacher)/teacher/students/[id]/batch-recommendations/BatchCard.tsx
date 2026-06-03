'use client';
import { SubsetItem } from './SubsetItem';
import type { BatchRecommendation } from '@/services/batch-recommendations-api';

const VERDICT_TEXT: Record<string, { label: string; color: string }> = {
  ELIGIBLE: { label: '推荐', color: 'bg-green-100 text-green-700' },
  CONDITIONAL: { label: '可冲', color: 'bg-yellow-100 text-yellow-700' },
  INELIGIBLE: { label: '不可填', color: 'bg-red-100 text-red-700' },
  DATA_PENDING: { label: '详情待补充', color: 'bg-gray-100 text-gray-700' },
};

export function BatchCard({
  batch,
  selected,
  onToggle,
  disabled,
}: {
  batch: BatchRecommendation;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const v = VERDICT_TEXT[batch.verdict] ?? VERDICT_TEXT.DATA_PENDING;
  const topReason = batch.reasons?.[0]?.message ?? '—';
  return (
    <div className="border rounded p-4">
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-start gap-2 flex-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={disabled}
            className="mt-1"
          />
          <div>
            <div className="font-semibold">{batch.batchName}</div>
            <div className="text-xs text-gray-500">志愿模式: {batch.volunteerMode}</div>
            <div className="text-sm mt-1">{topReason}</div>
          </div>
        </label>
        <span className={`text-xs px-2 py-1 rounded ${v.color}`}>{v.label}</span>
      </div>
      <div className="mt-3 space-y-2">
        {(batch.subsetResults ?? []).map((s) => (
          <SubsetItem key={s.code} subset={s} />
        ))}
      </div>
    </div>
  );
}
