'use client';

/**
 * 教师工作台 · 我的沟通复盘
 * 复刻自 `WillNest Design System/teacher/views/insights.jsx` 的 ViewInsightsMe.
 * className: stat-cluster / scell / insights-grid / in-card / in-tbl-mini.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import { consultationApi } from '@/services/consultation-api';
import { PageHeader, fmtMins } from '@/components/willnest';

const CHANNEL_NAME: Record<string, string> = {
  phone: '电话',
  wechat: '微信',
  in_person: '线下',
  video: '视频',
};

export default function MyInsightsPage() {
  const [range, setRange] = useState<'week' | 'month'>('month');
  const { data, isLoading } = useQuery({
    queryKey: ['insights-me', range],
    queryFn: () => consultationApi.getMyInsights(range),
  });

  if (isLoading || !data) {
    return (
      <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const diff =
    data.estimation.avgEst != null && data.estimation.avgAct != null
      ? data.estimation.avgAct - data.estimation.avgEst
      : null;
  const avgDeviation =
    diff === null ? '—' : diff > 0 ? `+${diff} 分` : `${diff} 分`;
  const dailyAvg = range === 'week' ? Math.round(data.totalMinutes / 7) : Math.round(data.totalMinutes / 30);

  return (
    <div className="view-transition">
      <PageHeader
        eyebrow="MY INSIGHTS"
        title="我的报表"
        meta={
          <>
            <span>统计你的沟通节奏 · 时长 · 命中度</span>
            <span className="dot" />
            <span>数据回溯到签约日</span>
          </>
        }
        fresh="今日"
        actions={
          <div className="range-toggle">
            <button
              type="button"
              className={range === 'week' ? 'is-active' : ''}
              onClick={() => setRange('week')}
            >
              最近 7 天
            </button>
            <button
              type="button"
              className={range === 'month' ? 'is-active' : ''}
              onClick={() => setRange('month')}
            >
              最近 30 天
            </button>
          </div>
        }
      />

      <div className="stat-cluster fade-up d1" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="scell t-primary">
          <div className="k">沟通次数</div>
          <div className="v">
            {data.totalCount}
            <span className="small">次</span>
          </div>
          <div className="sub">含电话 / 微信 / 视频 / 线下</div>
        </div>
        <div className="scell t-accent">
          <div className="k">累计时长</div>
          <div className="v">{fmtMins(data.totalMinutes)}</div>
          <div className="sub">日均 {fmtMins(dailyAvg)}</div>
        </div>
        <div className="scell t-safe">
          <div className="k">预估偏差(平均)</div>
          <div className="v">{avgDeviation}</div>
          <div className="sub">
            实际 vs 预估
            {data.estimation.sampleSize > 0 ? ` · ${data.estimation.sampleSize} 次样本` : ''}
          </div>
        </div>
      </div>

      <div className="insights-grid fade-up d2">
        <div className="in-card">
          <h4>按学生分布</h4>
          <div className="in-tbl-mini">
            <div className="hd">
              <span>学生</span>
              <span>次数</span>
              <span>累计时长</span>
            </div>
            {data.byStudent.length === 0 ? (
              <div className="rw" style={{ color: 'var(--text-muted)' }}>
                <span className="nm">暂无数据</span>
                <span className="num">—</span>
                <span className="num">—</span>
              </div>
            ) : (
              data.byStudent.map((row) => (
                <div className="rw" key={row.studentId}>
                  <span className="nm">
                    <Link href={`/teacher/students/${row.studentId}`} style={{ color: 'var(--primary)' }}>
                      {row.name}
                    </Link>
                  </span>
                  <span className="num">{row.count}</span>
                  <span className="num">{fmtMins(row.minutes)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="in-card">
          <h4>按沟通方式</h4>
          <div className="in-tbl-mini">
            <div className="hd">
              <span>方式</span>
              <span>次数</span>
              <span>累计时长</span>
            </div>
            {Object.keys(data.byChannel).length === 0 ? (
              <div className="rw" style={{ color: 'var(--text-muted)' }}>
                <span className="nm">暂无数据</span>
                <span className="num">—</span>
                <span className="num">—</span>
              </div>
            ) : (
              Object.entries(data.byChannel).map(([ch, v]) => (
                <div className="rw" key={ch}>
                  <span className="nm">{CHANNEL_NAME[ch] ?? ch}</span>
                  <span className="num">{v.count}</span>
                  <span className="num">{fmtMins(v.minutes)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
