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

// ---- 紧凑横幅节点 ----

function BannerNode({ event, isActive, index }: { event: TimelineEvent; isActive: boolean; index: number }) {
  const config = getStatusConfig(event.status);
  const days = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;

  // 节点圆圈：活跃节点 28px，其余 20px
  const renderDot = () => {
    if (config.type === 'completed') {
      return (
        <div className={`${isActive ? 'w-7 h-7' : 'w-5 h-5'} rounded-full bg-safe flex items-center justify-center text-white flex-shrink-0`}>
          <span className={isActive ? 'text-xs' : 'text-[9px]'}>✓</span>
        </div>
      );
    }
    if (event.status === 'countdown' && days !== null) {
      return (
        <div className={`${isActive ? 'w-7 h-7' : 'w-5 h-5'} rounded-full bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-white animate-pulse-ring flex-shrink-0`}>
          <span className={`font-serif font-bold leading-none ${isActive ? 'text-xs' : 'text-[9px]'}`}>{days}</span>
        </div>
      );
    }
    if (config.type === 'active') {
      return (
        <div className={`${isActive ? 'w-7 h-7' : 'w-5 h-5'} rounded-full bg-accent flex items-center justify-center animate-pulse-ring flex-shrink-0`}>
          <span className={`bg-white rounded-full block ${isActive ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} />
        </div>
      );
    }
    return (
      <div className={`${isActive ? 'w-7 h-7' : 'w-5 h-5'} rounded-full bg-white/20 flex items-center justify-center text-white/50 flex-shrink-0`}>
        <span className={`font-serif font-medium ${isActive ? 'text-[10px]' : 'text-[8px]'}`}>{index + 1}</span>
      </div>
    );
  };

  const textColor = config.type === 'completed'
    ? 'text-white/80'
    : config.type === 'active'
      ? 'text-white'
      : 'text-white/40';

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {renderDot()}
      <div className="hidden sm:flex flex-col leading-none">
        <span className={`text-[11px] sm:text-xs font-medium ${textColor}`}>{event.name}</span>
        {isActive && (
          <span className="text-[9px] sm:text-[10px] text-accent-light font-medium mt-0.5">
            {event.status === 'countdown' && days !== null ? `${days}天` : config.label}
          </span>
        )}
      </div>
      {/* 移动端只在活跃节点显示名称 */}
      {isActive && (
        <span className={`sm:hidden text-[11px] font-medium ${textColor}`}>
          {event.name}
          <span className="text-accent-light ml-1">
            {event.status === 'countdown' && days !== null ? `${days}天` : config.label}
          </span>
        </span>
      )}
    </div>
  );
}

// ---- 主组件：紧凑横幅 ----

export default function TimelineTracker() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { data, isLoading } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });

  const events = data?.events ?? [];
  const activeIndex = useMemo(() => getActiveIndex(events), [events]);

  // 连接线渐变
  const lineGradient = useMemo(() => {
    if (events.length === 0) return 'transparent';
    const segments: string[] = [];
    const step = 100 / (events.length - 1);
    for (let i = 0; i < events.length - 1; i++) {
      const start = step * i;
      const end = step * (i + 1);
      const cfg = getStatusConfig(events[i].status);
      const color = cfg.type === 'completed'
        ? 'rgba(39,103,73,0.6)'
        : cfg.type === 'active'
          ? 'rgba(184,134,11,0.6)'
          : 'rgba(255,255,255,0.15)';
      segments.push(`${color} ${start}%, ${color} ${end}%`);
    }
    return `linear-gradient(to right, ${segments.join(', ')})`;
  }, [events]);

  if (isLoading || events.length === 0) return null;

  return (
    <div className="bg-primary/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-2 relative">
          {/* 连接线 */}
          <div
            className="absolute top-1/2 left-3 right-3 h-[2px] rounded-full -translate-y-1/2 z-0 hidden sm:block"
            style={{ background: lineGradient }}
          />

          {events.map((event, i) => (
            <div key={event.key} className="relative z-[1] flex-shrink-0">
              <BannerNode
                event={event}
                isActive={i === activeIndex}
                index={i}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
