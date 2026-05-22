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
 * 高考已开始返回 null。
 */
export function daysUntilGaokao(
  events: TimelineEvent[],
  now: Date = new Date(),
): number | null {
  const gaokaoDef = HERO_NODES.find((d) => d.key === 'gaokao')!;
  const event = events.find((e) => e.key === 'gaokao');
  const iso = event?.startDate ?? gaokaoDef.fallbackIso;
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0) return null;
  // Math.floor: 以整天为粒度(不足一整天不进位),与"距高考还有 N 天"的自然语义一致
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
