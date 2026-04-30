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

export default function TimelineTracker() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { data, isLoading } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });

  const events = data?.events ?? [];
  const activeIndex = useMemo(() => getActiveIndex(events), [events]);

  if (isLoading || events.length === 0) return null;

  // 当前活跃事件的描述文字
  const activeEvent = events[activeIndex];
  const activeConfig = getStatusConfig(activeEvent.status);
  const days = activeEvent.status === 'countdown' ? getDaysUntil(activeEvent.startDate) : null;

  // 活跃节点的摘要文字
  const activeSummary = days !== null
    ? `距${activeEvent.name}还有 ${days} 天`
    : `${activeEvent.name} · ${activeConfig.label}`;

  return (
    <div className="bg-[#162d4a] border-b border-white/[0.06]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center h-10 sm:h-11 gap-3 sm:gap-0 sm:justify-between overflow-x-auto scrollbar-none">

          {/* 左侧：活跃状态摘要（移动端主显示） */}
          <div className="flex items-center gap-2 flex-shrink-0 sm:hidden">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse-ring flex-shrink-0" />
            <span className="text-[13px] text-white font-medium whitespace-nowrap">{activeSummary}</span>
          </div>

          {/* 桌面端：完整节点列表 */}
          <div className="hidden sm:flex items-center gap-1 flex-1 justify-between">
            {events.map((event, i) => {
              const config = getStatusConfig(event.status);
              const isActive = i === activeIndex;
              const eventDays = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;

              return (
                <div key={event.key} className="flex items-center gap-1">
                  {/* 节点间连线 */}
                  {i > 0 && (
                    <div className={`w-4 lg:w-8 xl:w-12 h-[1.5px] rounded-full mx-0.5 ${
                      getStatusConfig(events[i - 1].status).type === 'completed'
                        ? 'bg-safe/50'
                        : getStatusConfig(events[i - 1].status).type === 'active'
                          ? 'bg-accent/40'
                          : 'bg-white/10'
                    }`} />
                  )}

                  {/* 节点 */}
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${
                    isActive ? 'bg-white/[0.08]' : ''
                  }`}>
                    {/* 圆点 */}
                    {config.type === 'completed' ? (
                      <div className="w-4 h-4 rounded-full bg-safe/80 flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] text-white">✓</span>
                      </div>
                    ) : isActive && eventDays !== null ? (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0 animate-pulse-ring">
                        <span className="text-[10px] text-white font-bold font-serif">{eventDays}</span>
                      </div>
                    ) : isActive ? (
                      <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center flex-shrink-0 animate-pulse-ring">
                        <span className="w-1.5 h-1.5 bg-white rounded-full" />
                      </div>
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-white/15 flex-shrink-0" />
                    )}

                    {/* 文字 */}
                    <span className={`text-[12px] lg:text-[13px] whitespace-nowrap ${
                      config.type === 'completed'
                        ? 'text-white/60'
                        : isActive
                          ? 'text-white font-medium'
                          : 'text-white/35'
                    }`}>
                      {event.name}
                    </span>

                    {/* 活跃节点额外信息 */}
                    {isActive && (
                      <span className="text-[10px] lg:text-[11px] text-accent-light font-medium whitespace-nowrap">
                        {eventDays !== null ? `${eventDays}天` : activeConfig.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 右侧数据来源 */}
          <span className="hidden lg:inline text-[10px] text-white/25 flex-shrink-0 ml-3">
            四川省教育考试院
          </span>
        </div>
      </div>
    </div>
  );
}
