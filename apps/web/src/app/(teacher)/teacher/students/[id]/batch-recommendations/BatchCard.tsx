'use client';
import { SubsetItem } from './SubsetItem';
import type { BatchRecommendation } from '@/services/batch-recommendations-api';

const VERDICT_TEXT: Record<string, { label: string; color: string }> = {
  ELIGIBLE: { label: '资格通过', color: 'bg-green-100 text-green-700' },
  CONDITIONAL: { label: '条件通过', color: 'bg-yellow-100 text-yellow-700' },
  INELIGIBLE: { label: '资格不符', color: 'bg-red-100 text-red-700' },
  DATA_PENDING: { label: '详情待补充', color: 'bg-gray-100 text-gray-700' },
};

const VOLUNTEER_MODE_LABEL: Record<string, string> = {
  parallel: '平行志愿',
  sequential: '顺序志愿',
  mixed: '混合志愿',
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
  const modeLabel = VOLUNTEER_MODE_LABEL[batch.volunteerMode] ?? batch.volunteerMode;
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
            <div className="text-xs text-gray-500">志愿模式: {modeLabel}</div>
          </div>
        </label>
        <span className={`text-xs px-2 py-1 rounded ${v.color}`}>{v.label}</span>
      </div>
      {batch.scoreInfo && <ScoreInfoRow info={batch.scoreInfo} />}
      <div className="mt-3 space-y-2">
        {(batch.subsetResults ?? []).map((s) => (
          <SubsetItem key={s.code} subset={s} />
        ))}
      </div>
    </div>
  );
}

const LINE_TYPE_LABEL: Record<string, string> = {
  BATCH_LINE: '本科线',
  SPECIAL_LINE: '特殊类型线',
  ZHUANKE_LINE: '专科线',
};

function ScoreInfoRow({
  info,
}: {
  info: import('@/services/batch-recommendations-api').ScoreInfo;
}) {
  const lineLabel = LINE_TYPE_LABEL[info.lineType] ?? info.lineType;
  if (info.lineMissing) {
    return (
      <div className="mt-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
        当年 {lineLabel} 数据缺失
      </div>
    );
  }
  if (info.studentScore == null || info.lineScore == null) {
    return (
      <div className="mt-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
        {lineLabel}: {info.lineScore ?? '?'}, 学生总分: {info.studentScore ?? '未填'}
      </div>
    );
  }
  const gap = info.gap!;
  const tone =
    gap >= 30
      ? 'text-green-700 bg-green-50'
      : gap >= 0
        ? 'text-blue-700 bg-blue-50'
        : info.withinLeniency
          ? 'text-yellow-700 bg-yellow-50'
          : 'text-red-700 bg-red-50';
  const sign = gap >= 0 ? '+' : '';
  return (
    <div className={`mt-2 text-xs px-2 py-1 rounded ${tone}`}>
      你 {info.studentScore} / {lineLabel} {info.lineScore} ({sign}
      {gap} 分)
      {info.leniency && !info.passesLine && info.withinLeniency &&
        ` — 在 ${info.leniency} 分容错内`}
    </div>
  );
}
