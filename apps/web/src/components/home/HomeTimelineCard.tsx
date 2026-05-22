'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { timelineApi } from '@/services/timeline-api';
import { buildHeroTimeline, daysUntilGaokao } from './heroTimeline';

/** ISO 日期 → "6 月 7 日"。无效日期返回 "待定"。 */
function formatNodeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '待定';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** ISO 日期 → "2026 年 6 月 7 日"(用于卡片头部目标日期行)。 */
function formatTargetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '待定';
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/**
 * Hero 右侧"志愿填报时间线卡":高考倒计时 + 5 个关键节点。
 * 数据来自后端 timeline 接口,节点构造与倒计时逻辑复用 heroTimeline.ts。
 */
export default function HomeTimelineCard() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { data } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });

  const events = data?.events ?? [];
  const nodes = buildHeroTimeline(events);
  const days = daysUntilGaokao(events);

  // 高考节点(节点数组首项)的日期 → 卡片头部年份与目标日期
  const gaokaoIso = nodes[0]?.iso;
  const examYear = gaokaoIso ? new Date(gaokaoIso).getFullYear() : currentYear;

  // 第一个尚未到期的节点为"进行中",其前为"已结束",其后为"待进行"
  const now = Date.now();
  const activeIndex = nodes.findIndex((n) => new Date(n.iso).getTime() > now);

  return (
    <aside className="countdown-card" aria-label="高考倒计时与时间线">
      <div className="head">
        <span className="tag">Gaokao Countdown</span>
        <span className="yr">{examYear} 高考</span>
      </div>

      {days === null ? (
        // daysUntilGaokao 返回 null:高考已结束
        <div className="countdown-note">{examYear} 高考已结束</div>
      ) : days === 0 ? (
        // 返回 0:高考当天
        <div className="countdown-note">今天高考 · 全力以赴</div>
      ) : (
        <>
          <div className="countdown-hero">
            <span className="countdown-prefix">距</span>
            <span className="countdown-num">{days}</span>
            <span className="countdown-suffix">天</span>
            <span className="countdown-live">
              <span className="pulse" />
              实时
            </span>
          </div>
          {gaokaoIso && (
            <div className="countdown-target">目标日期 · {formatTargetDate(gaokaoIso)}</div>
          )}
        </>
      )}

      <div className="timeline">
        <div className="lbl">志愿填报路径</div>
        {nodes.map((node, index) => {
          // activeIndex 为 -1 表示所有节点都已过期 → 全部标记为 done
          const state =
            activeIndex === -1 || index < activeIndex
              ? 'done'
              : index === activeIndex
                ? 'active'
                : 'pending';
          return (
            <div key={node.key} className={`tl-node ${state}`}>
              <div className="row1">
                <span className="ttl">{node.label}</span>
                <span className="date">{formatNodeDate(node.iso)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
