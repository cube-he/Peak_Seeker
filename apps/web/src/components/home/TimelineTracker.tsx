'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { timelineApi, type TimelineEvent } from '@/services/timeline-api';

// 状态配置：标签文字、颜色分类
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

// 找当前活跃节点 index（当前大一圈的那个）
function getActiveIndex(events: TimelineEvent[]): number {
  // 从后往前找第一个 active 状态的节点
  for (let i = events.length - 1; i >= 0; i--) {
    const cfg = getStatusConfig(events[i].status);
    if (cfg.type === 'active') return i;
  }
  // 全部 completed → 最后一个
  if (events.every((e) => getStatusConfig(e.status).type === 'completed')) {
    return events.length - 1;
  }
  // 全部 pending → 第一个
  for (let i = 0; i < events.length; i++) {
    const cfg = getStatusConfig(events[i].status);
    if (cfg.type !== 'completed') return i;
  }
  return 0;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '';
  if (!end) return `${formatDate(start)} 起`;
  return `${formatDate(start)} - ${formatDate(end)}`;
}

// ---- Desktop Node ----

interface NodeProps {
  event: TimelineEvent;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}

function TimelineNode({ event, isActive, isExpanded, onToggle, index }: NodeProps) {
  const config = getStatusConfig(event.status);
  const days = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;

  const renderCircle = () => {
    if (config.type === 'completed') {
      return (
        <div className={`${isActive ? 'w-14 h-14' : 'w-10 h-10'} rounded-full bg-safe flex items-center justify-center text-white text-base shadow-[0_0_0_4px_var(--color-safe-fixed)] transition-transform duration-200 hover:scale-110`}>
          ✓
        </div>
      );
    }
    if (event.status === 'countdown' && days !== null) {
      return (
        <div className={`${isActive ? 'w-14 h-14' : 'w-10 h-10'} rounded-full bg-gradient-to-br from-accent to-accent-light flex flex-col items-center justify-center text-white shadow-[0_0_0_4px_var(--color-accent-fixed)] animate-pulse-ring transition-transform duration-200 hover:scale-110`}>
          <span className="font-serif text-xl font-bold leading-none">{days}</span>
          <span className="text-[9px] font-medium opacity-90 -mt-0.5">天</span>
        </div>
      );
    }
    if (config.type === 'active') {
      return (
        <div className={`${isActive ? 'w-14 h-14' : 'w-10 h-10'} rounded-full bg-accent flex items-center justify-center shadow-[0_0_0_4px_var(--color-accent-fixed)] animate-pulse-ring transition-transform duration-200 hover:scale-110`}>
          <span className="w-2.5 h-2.5 bg-white rounded-full block" />
        </div>
      );
    }
    return (
      <div className={`${isActive ? 'w-14 h-14' : 'w-10 h-10'} rounded-full bg-surface-dim flex items-center justify-center text-text-faint text-sm font-serif font-semibold`}>
        {index + 1}
      </div>
    );
  };

  const renderBadge = () => {
    if (config.type === 'completed') {
      return <span className="inline-flex text-[11px] text-safe font-medium bg-safe-fixed px-2.5 py-0.5 rounded-full mt-1">{config.label}</span>;
    }
    if (config.type === 'active') {
      return <span className="inline-flex items-center gap-1 text-[11px] text-white font-semibold bg-accent px-2.5 py-0.5 rounded-full mt-1">{config.label}</span>;
    }
    return <span className="inline-flex text-[11px] text-text-faint bg-surface-dim px-2.5 py-0.5 rounded-full mt-1">{config.label}</span>;
  };

  const textColor = config.type === 'completed' ? 'text-text' : config.type === 'active' ? 'text-accent' : 'text-text-faint';

  return (
    <div className="flex flex-col items-center z-[1] cursor-pointer relative" style={{ width: '20%' }} onClick={onToggle}>
      {renderCircle()}
      <div className={`font-serif text-[15px] font-semibold ${textColor} mt-3`}>{event.name}</div>
      {renderBadge()}
      <div className={`text-[11px] ${config.type === 'active' ? 'text-accent font-medium' : 'text-text-faint'} mt-0.5`}>
        {formatDateRange(event.startDate, event.endDate)}
      </div>

      {isExpanded && (
        <div className="absolute top-[120px] bg-surface rounded-[10px] p-4 shadow-card-hover border border-border w-[240px] text-left z-10">
          <div className="text-xs font-semibold mb-2" style={{ color: config.type === 'active' ? 'var(--color-accent)' : config.type === 'completed' ? 'var(--color-safe)' : 'var(--color-text-muted)' }}>
            {config.label}
          </div>
          {event.detail && typeof event.detail === 'object' && (
            <div className="bg-accent-fixed rounded-md p-2.5 mb-2 text-xs text-accent leading-relaxed">
              {Object.entries(event.detail as Record<string, string>).map(([k, v]) => (
                <div key={k}>{v}</div>
              ))}
            </div>
          )}
          <div className="text-[13px] text-text-secondary leading-relaxed">
            {formatDateRange(event.startDate, event.endDate)}
          </div>
          {event.sourceUrl && (
            <div className="mt-2.5 pt-2.5 border-t border-border-subtle">
              <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent no-underline hover:underline">
                查看考试院公告 →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Mobile Node ----

function MobileTimelineNode({ event, isActive, index, isLast }: { event: TimelineEvent; isActive: boolean; index: number; isLast: boolean }) {
  const config = getStatusConfig(event.status);
  const days = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;

  const renderCircle = () => {
    if (config.type === 'completed') {
      return <div className={`${isActive ? 'w-11 h-11' : 'w-8 h-8'} rounded-full bg-safe flex items-center justify-center text-white text-xs flex-shrink-0`}>✓</div>;
    }
    if (event.status === 'countdown' && days !== null) {
      return (
        <div className={`${isActive ? 'w-11 h-11' : 'w-8 h-8'} rounded-full bg-gradient-to-br from-accent to-accent-light flex flex-col items-center justify-center text-white shadow-[0_0_0_3px_var(--color-accent-fixed)] animate-pulse-ring flex-shrink-0`}>
          <span className="font-serif text-lg font-bold leading-none">{days}</span>
          <span className="text-[8px] font-medium opacity-90">天</span>
        </div>
      );
    }
    if (config.type === 'active') {
      return (
        <div className={`${isActive ? 'w-11 h-11' : 'w-8 h-8'} rounded-full bg-accent flex items-center justify-center shadow-[0_0_0_3px_var(--color-accent-fixed)] animate-pulse-ring flex-shrink-0`}>
          <span className="w-2 h-2 bg-white rounded-full block" />
        </div>
      );
    }
    return <div className={`${isActive ? 'w-11 h-11' : 'w-8 h-8'} rounded-full bg-surface-dim flex items-center justify-center text-text-faint text-xs font-serif flex-shrink-0`}>{index + 1}</div>;
  };

  const lineColor = config.type === 'completed' ? 'bg-safe' : config.type === 'active' ? 'bg-accent' : 'bg-surface-dim';
  const textColor = config.type === 'active' ? 'text-accent' : config.type === 'completed' ? 'text-text' : 'text-text-faint';

  return (
    <div className="flex gap-3.5 items-start">
      <div className="flex flex-col items-center flex-shrink-0">
        {renderCircle()}
        {!isLast && <div className={`w-0.5 h-7 ${lineColor}`} />}
      </div>
      <div className="pb-2 pt-1 flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-serif text-[15px] font-semibold ${textColor}`}>{event.name}</span>
          {config.type === 'completed' && <span className="text-[10px] text-safe bg-safe-fixed px-2 py-px rounded-full">{config.label}</span>}
          {config.type === 'active' && <span className="text-[10px] text-white bg-accent px-2 py-px rounded-full font-semibold">{config.label}</span>}
          {config.type === 'pending' && <span className="text-[10px] text-text-faint bg-surface-dim px-2 py-px rounded-full">{config.label}</span>}
        </div>
        <div className={`text-xs mt-0.5 ${config.type === 'active' ? 'text-accent font-medium' : 'text-text-faint'}`}>
          {formatDateRange(event.startDate, event.endDate)}
        </div>
        {isActive && event.sourceUrl && (
          <div className="bg-accent-fixed rounded-lg px-3 py-2 mt-2 text-xs">
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent font-semibold no-underline">
              查看考试院公告 →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- 主组件 ----

export default function TimelineTracker() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['timeline', new Date().getFullYear()],
    queryFn: () => timelineApi.getTimeline(new Date().getFullYear()),
    staleTime: 60 * 60 * 1000,
  });

  const events = data?.events ?? [];
  const activeIndex = useMemo(() => getActiveIndex(events), [events]);

  const lineGradient = useMemo(() => {
    if (events.length === 0) return 'transparent';
    const segments: string[] = [];
    const step = 100 / (events.length - 1);
    for (let i = 0; i < events.length - 1; i++) {
      const start = step * i;
      const end = step * (i + 1);
      const cfg = getStatusConfig(events[i].status);
      const color = cfg.type === 'completed' ? 'var(--color-safe)' : cfg.type === 'active' ? 'var(--color-accent)' : 'var(--color-border)';
      segments.push(`${color} ${start}%, ${color} ${end}%`);
    }
    return `linear-gradient(to right, ${segments.join(', ')})`;
  }, [events]);

  if (isLoading || events.length === 0) return null;

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12 lg:py-16">
      <div className="text-center mb-7 lg:mb-10">
        <div className="text-[11px] uppercase tracking-[2px] text-accent font-medium">录取进度</div>
        <h2 className="font-serif text-[22px] sm:text-[28px] lg:text-[32px] font-semibold text-text mt-1.5">
          {new Date().getFullYear()} 四川高考时间轴
        </h2>
        <p className="text-[13px] text-text-muted mt-1">
          数据来源：四川省教育考试院 · 每日自动更新
        </p>
      </div>

      {/* Desktop: horizontal */}
      <div className="hidden lg:block">
        <div className="relative flex items-start justify-between px-8 max-w-[900px] mx-auto">
          <div
            className="absolute top-5 left-[60px] right-[60px] h-[3px] rounded-sm z-0"
            style={{ background: lineGradient }}
          />
          {events.map((event, i) => (
            <TimelineNode
              key={event.key}
              event={event}
              isActive={i === activeIndex}
              isExpanded={expandedIndex === i}
              onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* Mobile: vertical */}
      <div className="lg:hidden pl-2">
        {events.map((event, i) => (
          <MobileTimelineNode
            key={event.key}
            event={event}
            isActive={i === activeIndex}
            index={i}
            isLast={i === events.length - 1}
          />
        ))}
      </div>

      <div className="text-center mt-6 lg:mt-8 text-xs text-text-faint">
        点击节点查看详情 · 征集志愿窗口通常仅 12-24 小时，请密切关注
      </div>
    </section>
  );
}
