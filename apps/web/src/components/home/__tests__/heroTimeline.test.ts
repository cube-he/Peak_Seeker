import { buildHeroTimeline, daysUntilGaokao, HERO_NODES } from '../heroTimeline';
import type { TimelineEvent } from '@/services/timeline-api';

function ev(key: string, name: string, startDate: string | null): TimelineEvent {
  return {
    id: 1, key, name, status: 'estimated', sortOrder: 1,
    startDate, endDate: null, detail: null, sourceUrl: null, year: 2026,
  };
}

describe('buildHeroTimeline', () => {
  it('返回固定 5 个节点,key 顺序与展示名固定', () => {
    const result = buildHeroTimeline([]);
    expect(result.map((n) => n.key)).toEqual([
      'gaokao', 'score_query', 'volunteer_deadline_early',
      'volunteer_deadline_regular', 'volunteer_deadline_vocational',
    ]);
    expect(result[2].label).toBe('本科提前批志愿截止');
  });

  it('后端有该节点时,iso 取后端 startDate', () => {
    const events = [
      ev('volunteer_deadline_early', '本科提前批志愿截止', '2026-06-30T17:00:00+08:00'),
    ];
    const node = buildHeroTimeline(events).find((n) => n.key === 'volunteer_deadline_early')!;
    expect(node.iso).toBe('2026-06-30T17:00:00+08:00');
  });

  it('后端缺该节点时,iso 用兜底日期', () => {
    const node = buildHeroTimeline([]).find((n) => n.key === 'volunteer_deadline_early')!;
    const def = HERO_NODES.find((d) => d.key === 'volunteer_deadline_early')!;
    expect(node.iso).toBe(def.fallbackIso);
  });
});

describe('daysUntilGaokao', () => {
  it('用后端 gaokao 节点算剩余天数', () => {
    const events = [ev('gaokao', '高考', '2026-06-07')];
    expect(daysUntilGaokao(events, new Date('2026-05-21T00:00:00+08:00'))).toBe(17);
  });

  it('无 gaokao 节点时回退到兜底日期', () => {
    expect(daysUntilGaokao([], new Date('2026-05-21T00:00:00+08:00'))).toBe(17);
  });

  it('高考已过返回 null', () => {
    expect(daysUntilGaokao([], new Date('2026-07-01T00:00:00+08:00'))).toBeNull();
  });
});
