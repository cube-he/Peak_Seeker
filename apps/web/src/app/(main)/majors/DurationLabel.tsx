'use client';
import { Tooltip } from 'antd';

// 长学制说明: 本科出现 7/8/9 年是贯通培养项目, 数据来自招生计划表的真实学制
const LONG_DURATION_NOTES: Array<[string, string]> = [
  ['七年', '七年制为本硕连读贯通培养'],
  ['八年', '八年制为本博连读贯通培养（如临床医学八年制）'],
  ['九年', '九年制为本博连读贯通培养（如中医学九年制）'],
];

export function longDurationNote(d?: string | null): string | null {
  if (!d) return null;
  const hits = LONG_DURATION_NOTES.filter(([k]) => d.includes(k)).map(([, v]) => v);
  return hits.length ? `${hits.join('；')}。同一专业多个学制为不同培养项目并存，具体以院校招生章程为准。` : null;
}

/** 学制展示: 含七/八/九年时带虚线下划线 + 悬停备注解释原因 */
export function DurationLabel({ value }: { value?: string | null }) {
  const d = value ?? '';
  const note = longDurationNote(d);
  if (!note) return <>{d}</>;
  return (
    <Tooltip title={note}>
      <span style={{ borderBottom: '1px dashed currentColor', cursor: 'help' }}>{d}</span>
    </Tooltip>
  );
}
