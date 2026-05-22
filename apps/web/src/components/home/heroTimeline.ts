import type { TimelineEvent } from '@/services/timeline-api';

export interface HeroTimelineNode {
  key: string;
  label: string;
  iso: string; // ISO 日期;显示格式由 UI 组件决定
}

/**
 * Hero 时间线卡的 5 个节点定义,数组顺序即展示顺序。
 * label 为卡片展示名(固定由前端定);fallbackIso 为后端 timeline 缺该节点时的兜底日期。
 * 兜底日期来源:四川省教育考试院 2026 年通知(sceea.cn)。
 */
export const HERO_NODES: { key: string; label: string; fallbackIso: string }[] = [
  { key: 'gaokao', label: '高考', fallbackIso: '2026-06-07' },
  { key: 'score_query', label: '出分 · 一分一段表', fallbackIso: '2026-06-22' },
  { key: 'volunteer_deadline_early', label: '本科提前批志愿截止', fallbackIso: '2026-06-28T17:00:00+08:00' },
  { key: 'volunteer_deadline_regular', label: '本科批志愿截止', fallbackIso: '2026-07-01T17:00:00+08:00' },
  { key: 'volunteer_deadline_vocational', label: '专科批志愿截止', fallbackIso: '2026-07-05T17:00:00+08:00' },
];

/**
 * 构造 Hero 时间线卡的 5 个节点。label 固定用前端定义;
 * 日期优先取后端 timeline 对应节点的 startDate,缺失则用兜底日期。
 */
export function buildHeroTimeline(events: TimelineEvent[]): HeroTimelineNode[] {
  return HERO_NODES.map((def) => {
    const event = events.find((e) => e.key === def.key);
    return {
      key: def.key,
      label: def.label,
      iso: event?.startDate ?? def.fallbackIso,
    };
  });
}

/**
 * 距高考剩余天数。优先用后端 gaokao 节点,缺失则用兜底日期。
 * 高考当天返回 0,高考已过(目标日之后的日期)返回 null。
 *
 * 按北京时间(UTC+8)的日期差算——把 now 和目标日都归一化到当天 0 点再相减,
 * 避免同一天上午和深夜因时刻不同算出差 1 天的问题。
 */
export function daysUntilGaokao(
  events: TimelineEvent[],
  now: Date = new Date(),
): number | null {
  const gaokaoDef = HERO_NODES.find((d) => d.key === 'gaokao')!;
  const event = events.find((e) => e.key === 'gaokao');
  const iso = event?.startDate ?? gaokaoDef.fallbackIso;

  // UTC+8 偏移量(毫秒)
  const UTC8_OFFSET = 8 * 60 * 60 * 1000;

  // 将时间戳按 UTC+8 归一化到当天 0 点:先加偏移使其"对齐北京时间",再取整天
  const toBeijingDayStart = (ts: number) =>
    Math.floor((ts + UTC8_OFFSET) / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24);

  const targetDay = toBeijingDayStart(new Date(iso).getTime());
  const nowDay = toBeijingDayStart(now.getTime());

  const diffDays = (targetDay - nowDay) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return null;
  return diffDays; // 0 = 当天,正整数 = 剩余天数
}
