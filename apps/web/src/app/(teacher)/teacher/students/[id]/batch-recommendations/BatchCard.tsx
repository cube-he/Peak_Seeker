'use client';
import { useState } from 'react';
import { SubsetItem } from './SubsetItem';
import type { BatchRecommendation } from '@/services/batch-recommendations-api';

const VERDICT_TEXT: Record<string, { label: string; color: string }> = {
  ELIGIBLE: { label: '资格通过', color: 'bg-green-100 text-green-700' },
  CONDITIONAL: { label: '条件通过', color: 'bg-yellow-100 text-yellow-700' },
  INELIGIBLE: { label: '资格不符', color: 'bg-red-100 text-red-700' },
  DATA_PENDING: { label: '详情待补充', color: 'bg-gray-100 text-gray-700' },
};

/** collapsed header 的一句话 summary:
 *  - INELIGIBLE: 第一条 FAIL 的 requirement (例: "年龄 16-20 岁: 学生 8 岁")
 *  - CONDITIONAL: 第一条 SOFT_HINT 或 UNCERTAIN
 *  - ELIGIBLE: 分差 (例: "+60 分, 你 527 / 线 467")
 *  - DATA_PENDING: 提示
 *  让老师 collapsed 状态下也能秒判.
 */
function summarizeBatch(batch: BatchRecommendation): string {
  if (batch.verdict === 'INELIGIBLE') {
    for (const s of batch.subsetResults ?? []) {
      for (const r of s.rulesEval ?? []) {
        if (r.pass === 'FAIL') return `${r.requirement} → ${r.actual}`;
      }
    }
    const reason = (batch.reasons ?? []).find((r) => r.type === 'HARD_FAIL' || r.type === 'INELIGIBLE');
    if (reason) return reason.message;
    return '硬性资格未满足 (展开看详情)';
  }
  if (batch.verdict === 'CONDITIONAL') {
    for (const s of batch.subsetResults ?? []) {
      for (const r of s.rulesEval ?? []) {
        if (r.pass === 'UNCERTAIN' || r.pass === 'SOFT_HINT') {
          return `待核实: ${r.requirement}`;
        }
      }
    }
    return '部分条件需老师核实';
  }
  if (batch.verdict === 'DATA_PENDING') {
    return '子类别详情待补充 — 展开看';
  }
  // ELIGIBLE
  const si = batch.scoreInfo;
  if (si && !si.lineMissing && si.studentScore != null && si.lineScore != null) {
    const gap = si.gap ?? 0;
    const sign = gap >= 0 ? '+' : '';
    return `${sign}${gap} 分 (你 ${si.studentScore} / 线 ${si.lineScore})`;
  }
  return '资格通过';
}

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
  defaultExpanded = false,
}: {
  batch: BatchRecommendation;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  /** 已选批次 section 里展开能让老师快速 review, 其他段默认 collapsed */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const v = VERDICT_TEXT[batch.verdict] ?? VERDICT_TEXT.DATA_PENDING;
  const modeLabel = VOLUNTEER_MODE_LABEL[batch.volunteerMode] ?? batch.volunteerMode;
  const summary = summarizeBatch(batch);
  return (
    <div className="border rounded">
      {/* —— header (checkbox + name + verdict + 展开按钮) —— */}
      <div className="flex items-center gap-2 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          className="cursor-pointer"
        />
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 flex items-center justify-between gap-2 text-left"
        >
          <div className="flex-1">
            <div className="font-semibold">{batch.batchName}</div>
            <div className="text-xs text-gray-500">志愿模式: {modeLabel}</div>
            {/* P0-3: 一句话 summary, collapsed 状态也能看到关键信息 */}
            <div className="text-xs text-gray-700 mt-0.5">{summary}</div>
          </div>
          <div className="flex items-center gap-2 self-start">
            <span className={`text-xs px-2 py-1 rounded ${v.color}`}>{v.label}</span>
            <span className="text-xs text-blue-600">{expanded ? '收起 ▲' : '展开 ▼'}</span>
          </div>
        </button>
      </div>
      {/* —— expanded body —— */}
      {expanded && (
        <div className="border-t p-3 space-y-2 bg-gray-50/50">
          {batch.scoreInfo && <ScoreInfoRow info={batch.scoreInfo} />}
          {(batch.subsetResults ?? []).length > 0 ? (
            <div className="space-y-2 mt-2">
              <div className="text-xs font-medium text-gray-700">子类别 / 资格判定:</div>
              {(batch.subsetResults ?? []).map((s) => (
                <SubsetItem key={s.code} subset={s} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500">无子类别信息</div>
          )}
        </div>
      )}
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
      <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
        当年 {lineLabel} 数据缺失
      </div>
    );
  }
  if (info.studentScore == null || info.lineScore == null) {
    return (
      <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
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
    <div className={`text-xs px-2 py-1 rounded ${tone}`}>
      你 {info.studentScore} / {lineLabel} {info.lineScore} ({sign}
      {gap} 分)
      {info.leniency && !info.passesLine && info.withinLeniency &&
        ` — 在 ${info.leniency} 分容错内`}
    </div>
  );
}
