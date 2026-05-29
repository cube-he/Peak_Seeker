'use client';

/**
 * 教师工作台 · 团队沟通报表 (主管)
 * 复刻自 `WillNest Design System/teacher/views/insights.jsx` 的 ViewInsightsTeam.
 * className: stat-cluster / scell / low-alert / team-rank.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import { consultationApi } from '@/services/consultation-api';
import { Avatar, PageHeader, TIcon, fmtMins } from '@/components/willnest';

const TONES = ['t-blue', 't-amber', 't-violet', 't-rose', 't-green'];
function pickTone(id: number): string {
  return TONES[Math.abs(id) % TONES.length];
}

export default function TeamInsightsPage() {
  const [range, setRange] = useState<'week' | 'month'>('month');
  const { data, isLoading, error } = useQuery({
    queryKey: ['insights-team', range],
    queryFn: () => consultationApi.getTeamInsights(range),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="view-transition">
        <PageHeader eyebrow="TEAM INSIGHTS" title="团队沟通报表" />
        <div
          className="db-silent"
          style={{ background: 'var(--rush-fixed)', borderColor: 'var(--rush)' }}
        >
          <div className="db-silent-head">
            <span className="db-silent-ic">
              <TIcon.alert />
            </span>
            <h3>无权访问</h3>
            <span className="db-silent-sub">
              {(error as any)?.response?.data?.message ?? '需要主管权限'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const activeTeachers = data.totalTeachers;
  const lowOutput = data.alerts.lowProductivity ?? [];
  const ranking = data.byTeacher ?? [];
  const maxMin = Math.max(1, ...ranking.map((r) => r.minutes));

  return (
    <div className="view-transition">
      <PageHeader
        eyebrow="TEAM INSIGHTS"
        title="团队沟通报表"
        meta={<span>主管视图 · 关注团队动作密度与产能</span>}
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
          <div className="k">活跃老师</div>
          <div className="v">
            {activeTeachers}
            <span className="small">名</span>
          </div>
          <div className="sub">本周期内至少 1 次沟通</div>
        </div>
        <div className="scell t-accent">
          <div className="k">沟通总次数</div>
          <div className="v">
            {data.totalCount}
            <span className="small">次</span>
          </div>
          <div className="sub">
            人均 {activeTeachers > 0 ? Math.round(data.totalCount / activeTeachers) : 0} 次
          </div>
        </div>
        <div className="scell t-safe">
          <div className="k">累计时长</div>
          <div className="v">{fmtMins(data.totalMinutes)}</div>
          <div className="sub">
            人均 {fmtMins(activeTeachers > 0 ? Math.round(data.totalMinutes / activeTeachers) : 0)}
          </div>
        </div>
      </div>

      {lowOutput.length > 0 ? (
        <div className="low-alert fade-up d2">
          <span className="ic">
            <TIcon.alert />
          </span>
          <div className="body">
            <span className="em">低产警报:</span>
            {lowOutput.map((p, i) => {
              const ratio = data.alerts.threshold > 0 ? p.minutes / data.alerts.threshold : 0;
              return (
                <span key={p.teacherId}>
                  {i > 0 && '、'}
                  <strong style={{ color: 'var(--text)' }}>{p.name}</strong> 本周期沟通仅{' '}
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--rush)',
                      fontWeight: 600,
                    }}
                  >
                    {fmtMins(p.minutes)}
                  </span>{' '}
                  (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(ratio * 100)}%
                  </span>{' '}
                  of 阈值 {fmtMins(data.alerts.threshold)})
                </span>
              );
            })}
            ,建议追踪。
          </div>
        </div>
      ) : null}

      <div className="team-rank fade-up d3">
        <div className="hd">
          <span>排名</span>
          <span>老师</span>
          <span>沟通次数</span>
          <span>累计时长</span>
          <span>服务学生数</span>
        </div>
        {ranking.map((r, i) => (
          <div className="rw" key={r.teacherId}>
            <span className={`rk r${i + 1}`}>{String(i + 1).padStart(2, '0')}</span>
            <div className="who">
              <Avatar
                student={{
                  id: r.teacherId,
                  name: r.name,
                  initials: r.name.charAt(0),
                  tone: pickTone(r.teacherId),
                }}
                size={32}
              />
              <span className="nm">{r.name}</span>
            </div>
            <span className="num">{r.count} 次</span>
            <div className={`bar-wrap ${r.minutes < 180 ? 'low' : ''}`}>
              <div className="bar">
                <div className="fill" style={{ width: `${(r.minutes / maxMin) * 100}%` }} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 0,
                  transform: 'translateY(-50%)',
                  fontSize: 11.5,
                  color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                  background: 'var(--surface)',
                  padding: '0 4px',
                }}
              >
                {fmtMins(r.minutes)}
              </div>
            </div>
            <span className="stu-cnt">
              <TIcon.students />
              {r.studentCount} 名
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
