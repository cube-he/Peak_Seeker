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
  if (events.every((e) => getStatusConfig(e.status).type === 'completed')) {
    return events.length - 1;
  }
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

// ---- 倒计时徽章（Hero 左栏顶部） ----

export function CountdownBadge({ events }: { events: TimelineEvent[] }) {
  const activeIndex = useMemo(() => getActiveIndex(events), [events]);
  if (events.length === 0) return null;

  const activeEvent = events[activeIndex];
  const config = getStatusConfig(activeEvent.status);
  const days = activeEvent.status === 'countdown' ? getDaysUntil(activeEvent.startDate) : null;

  const startDate = activeEvent.startDate ? new Date(activeEvent.startDate) : null;
  const dateStr = startDate
    ? `${startDate.getMonth() + 1}月${startDate.getDate()}日`
    : '';
  const endDate = activeEvent.endDate ? new Date(activeEvent.endDate) : null;
  const fullDateStr = endDate
    ? `${dateStr}-${endDate.getDate()}日`
    : dateStr;

  return (
    <div className="inline-flex items-center gap-2.5 bg-accent/15 border border-accent/25 rounded-[10px] px-4 py-2 mb-5">
      {days !== null ? (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-light flex flex-col items-center justify-center text-white shadow-[0_0_0_3px_rgba(184,134,11,0.2)] animate-pulse-ring flex-shrink-0">
          <span className="font-serif text-[15px] font-bold leading-none">{days}</span>
          <span className="text-[7px] font-medium opacity-80">天</span>
        </div>
      ) : (
        <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center animate-pulse-ring flex-shrink-0">
          <span className="w-2.5 h-2.5 bg-white rounded-full" />
        </div>
      )}
      <div>
        <div className="text-accent-light text-[13px] font-semibold leading-tight">
          {days !== null ? `距 ${new Date().getFullYear()} 高考还有 ${days} 天` : `${activeEvent.name} · ${config.label}`}
        </div>
        <div className="text-white/40 text-[10px] mt-0.5">
          {fullDateStr} · 四川省教育考试院
        </div>
      </div>
    </div>
  );
}

// ---- 右栏垂直时间轴 ----

function TimelineNode({ event, isActive, isLast }: { event: TimelineEvent; isActive: boolean; isLast: boolean }) {
  const config = getStatusConfig(event.status);
  const days = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;

  const renderDot = () => {
    if (config.type === 'completed') {
      return (
        <div className={`${isActive ? 'w-6 h-6' : 'w-[18px] h-[18px]'} rounded-full bg-safe/80 flex items-center justify-center text-white flex-shrink-0`}>
          <span className={isActive ? 'text-[10px]' : 'text-[8px]'}>✓</span>
        </div>
      );
    }
    if (event.status === 'countdown' && days !== null) {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-white shadow-[0_0_0_3px_rgba(184,134,11,0.2)] animate-pulse-ring flex-shrink-0">
          <span className="font-serif text-[10px] font-bold">{days}</span>
        </div>
      );
    }
    if (config.type === 'active') {
      return (
        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-[0_0_0_3px_rgba(184,134,11,0.2)] animate-pulse-ring flex-shrink-0">
          <span className="w-2 h-2 bg-white rounded-full" />
        </div>
      );
    }
    return (
      <div className={`${isActive ? 'w-6 h-6' : 'w-[18px] h-[18px]'} rounded-full bg-white/[0.12] flex-shrink-0 ${!isActive ? 'mx-[3px]' : ''}`} />
    );
  };

  const lineColor = config.type === 'completed'
    ? 'bg-safe/30'
    : config.type === 'active'
      ? 'bg-accent/30'
      : 'bg-white/[0.06]';

  return (
    <div className="flex gap-2.5 items-start">
      <div className="flex flex-col items-center flex-shrink-0">
        {renderDot()}
        {!isLast && <div className={`w-[1.5px] flex-1 min-h-[12px] ${lineColor}`} />}
      </div>
      <div className="pt-0.5 pb-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-medium ${
            config.type === 'completed'
              ? 'text-white/60'
              : isActive
                ? 'text-white'
                : 'text-white/35'
          }`}>
            {event.name}
          </span>
          {isActive && (
            <span className="text-[10px] text-accent-light font-medium">
              {days !== null ? `${days}天` : config.label}
            </span>
          )}
          {config.type === 'completed' && !isActive && (
            <span className="text-[9px] text-safe/60">{config.label}</span>
          )}
          {config.type === 'pending' && (
            <span className="text-[9px] text-white/20">{config.label}</span>
          )}
        </div>
        <div className={`text-[10px] mt-0.5 ${isActive ? 'text-white/40' : 'text-white/20'}`}>
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
    <div className="bg-white/[0.05] border border-white/[0.08] rounded-xl p-5 flex flex-col w-full">
      <div className="text-[10px] text-white/40 uppercase tracking-[1.5px] mb-auto">
        录取进度
      </div>
      <div className="flex flex-col justify-between flex-1 mt-3">
        {events.map((event, i) => (
          <TimelineNode
            key={event.key}
            event={event}
            isActive={i === activeIndex}
            isLast={i === events.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

