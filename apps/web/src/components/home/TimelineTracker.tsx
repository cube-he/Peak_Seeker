'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { timelineApi, type TimelineEvent } from '@/services/timeline-api';

const STATUS_CONFIG: Record<string, { label: string; type: 'completed' | 'active' | 'pending' }> = {
  countdown: { label: '倒计时', type: 'active' },
  estimated: { label: '预计', type: 'pending' },
  filling: { label: '填报中', type: 'active' },
  available: { label: '可查询', type: 'completed' },
  in_progress: { label: '录取中', type: 'active' },
  collecting_1: { label: '一轮征集', type: 'active' },
  collecting_2: { label: '二轮征集', type: 'active' },
  collecting_3: { label: '三轮征集', type: 'active' },
  completed: { label: '已完成', type: 'completed' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, type: 'pending' };
}

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getActiveIndex(events: TimelineEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (getStatusConfig(events[i].status).type === 'active') return i;
  }
  if (events.every((event) => getStatusConfig(event.status).type === 'completed')) return events.length - 1;
  for (let i = 0; i < events.length; i++) {
    if (getStatusConfig(events[i].status).type !== 'completed') return i;
  }
  return 0;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  const startStr = `${s.getMonth() + 1}/${s.getDate()}`;
  if (!end) return `${startStr} 起`;
  const e = new Date(end);
  return `${startStr} - ${e.getMonth() + 1}/${e.getDate()}`;
}

export function CountdownBadge({ events }: { events: TimelineEvent[] }) {
  const activeIndex = useMemo(() => getActiveIndex(events), [events]);

  if (events.length === 0) {
    return (
      <div className="mb-6 inline-flex items-center gap-3 rounded-[10px] border border-accent/25 bg-accent/15 px-3.5 py-2">
        <div className="flex h-[38px] w-[38px] flex-col items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light text-white shadow-[0_0_0_4px_rgba(184,134,11,0.20)] animate-pulse-ring">
          <span className="font-serif text-[15px] font-bold leading-none">37</span>
          <span className="mt-px text-[7px] leading-none text-white/85">天</span>
        </div>
        <div>
          <div className="text-[13px] font-semibold leading-tight text-accent-light">距 2026 高考还有 37 天</div>
          <div className="mt-0.5 text-[10px] text-white/40">6 月 7 日 · 四川省教育考试院</div>
        </div>
      </div>
    );
  }

  const activeEvent = events[activeIndex];
  const config = getStatusConfig(activeEvent.status);
  const days = activeEvent.status === 'countdown' ? getDaysUntil(activeEvent.startDate) : null;
  const startDate = activeEvent.startDate ? new Date(activeEvent.startDate) : null;
  const dateStr = startDate ? `${startDate.getMonth() + 1} 月 ${startDate.getDate()} 日` : '';
  const endDate = activeEvent.endDate ? new Date(activeEvent.endDate) : null;
  const fullDateStr = endDate ? `${dateStr}-${endDate.getDate()} 日` : dateStr;

  return (
    <div className="mb-6 inline-flex items-center gap-3 rounded-[10px] border border-accent/25 bg-accent/15 px-3.5 py-2">
      {days !== null ? (
        <div className="flex h-[38px] w-[38px] flex-col items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light text-white shadow-[0_0_0_4px_rgba(184,134,11,0.20)] animate-pulse-ring">
          <span className="font-serif text-[15px] font-bold leading-none">{days}</span>
          <span className="mt-px text-[7px] leading-none text-white/85">天</span>
        </div>
      ) : (
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-accent animate-pulse-ring">
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </div>
      )}
      <div>
        <div className="text-[13px] font-semibold leading-tight text-accent-light">
          {days !== null ? `距 ${new Date().getFullYear()} 高考还有 ${days} 天` : `${activeEvent.name} · ${config.label}`}
        </div>
        <div className="mt-0.5 text-[10px] text-white/40">{fullDateStr} · 四川省教育考试院</div>
      </div>
    </div>
  );
}

function TimelineNode({ event, isActive, isLast }: { event: TimelineEvent; isActive: boolean; isLast: boolean }) {
  const config = getStatusConfig(event.status);
  const days = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;

  const renderDot = () => {
    if (config.type === 'completed') {
      return (
        <div className={`${isActive ? 'h-6 w-6' : 'h-[18px] w-[18px]'} flex flex-shrink-0 items-center justify-center rounded-full bg-safe/80 text-white`}>
          <span className={isActive ? 'text-[10px]' : 'text-[8px]'}>✓</span>
        </div>
      );
    }
    if (event.status === 'countdown' && days !== null) {
      return (
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light text-white shadow-[0_0_0_3px_rgba(184,134,11,0.2)] animate-pulse-ring">
          <span className="font-serif text-[10px] font-bold">{days}</span>
        </div>
      );
    }
    if (config.type === 'active') {
      return (
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent shadow-[0_0_0_3px_rgba(184,134,11,0.2)] animate-pulse-ring">
          <span className="h-2 w-2 rounded-full bg-white" />
        </div>
      );
    }
    return <div className={`${isActive ? 'h-6 w-6' : 'mx-[3px] h-[18px] w-[18px]'} flex-shrink-0 rounded-full border-2 border-white/15 bg-white/[0.04]`} />;
  };

  const lineColor = config.type === 'completed' ? 'bg-safe/30' : config.type === 'active' ? 'bg-accent/30' : 'bg-white/[0.06]';

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex flex-shrink-0 flex-col items-center">
        {renderDot()}
        {!isLast && <div className={`min-h-[12px] w-[1.5px] flex-1 ${lineColor}`} />}
      </div>
      <div className="min-w-0 pb-1 pt-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-medium ${config.type === 'completed' ? 'text-white/60' : isActive ? 'text-white' : 'text-white/35'}`}>
            {event.name}
          </span>
          {isActive && <span className="text-[10px] font-medium text-accent-light">{days !== null ? `${days}天` : config.label}</span>}
          {config.type === 'completed' && !isActive && <span className="text-[9px] text-safe/60">{config.label}</span>}
          {config.type === 'pending' && <span className="text-[9px] text-white/20">{config.label}</span>}
        </div>
        <div className={`mt-0.5 text-[10px] ${isActive ? 'text-white/40' : 'text-white/20'}`}>
          {formatDateRange(event.startDate, event.endDate)}
        </div>
      </div>
    </div>
  );
}

export function TimelinePanel() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { data, isLoading } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });

  const events = data?.events ?? [];
  const activeIndex = useMemo(() => getActiveIndex(events), [events]);

  if (isLoading || events.length === 0) return null;

  return (
    <div
      className="flex w-full flex-col rounded-xl border border-white/[0.12] bg-white/[0.04] p-5 backdrop-blur-md"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px -12px rgba(0,0,0,0.4)' }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-3 w-[2px] rounded-full bg-accent-light" />
        <span className="text-[10px] uppercase tracking-[1.5px] text-white/50">录取进度</span>
      </div>
      <div className="flex flex-1 flex-col justify-between">
        {events.map((event, index) => (
          <TimelineNode key={event.key} event={event} isActive={index === activeIndex} isLast={index === events.length - 1} />
        ))}
      </div>
    </div>
  );
}
