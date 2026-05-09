'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Empty, Spin } from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';

const STATUS_LABELS: Record<string, string> = {
  COLLECTING: '待采集',
  GENERATING: '待生成',
  REVIEWING: '待审核',
  FINALIZED: '已定稿',
  SUBMITTED: '已填报',
};

interface StudentCard {
  id: number;
  realName?: string;
  username?: string;
  status?: string;
  score?: number;
  totalScore?: number;
  rank?: number;
  provincialRank?: number;
  completeness?: number;
  progress?: { overallCompleteness?: number };
  planCount?: number;
  updatedAt?: string;
}

function getScore(student: StudentCard) {
  return student.score ?? student.totalScore ?? null;
}

function getRank(student: StudentCard) {
  return student.rank ?? student.provincialRank ?? null;
}

function getCompleteness(student: StudentCard) {
  return student.completeness ?? student.progress?.overallCompleteness ?? 0;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
}

export default function TeacherDashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ['teacher-students', refreshKey],
    queryFn: () => studentApi.getList(),
  });

  const students: StudentCard[] = studentsData?.data || [];

  const stats = useMemo(() => {
    const totalStudents = students.length;
    const collecting = students.filter((student) => student.status === 'COLLECTING').length;
    const reviewing = students.filter((student) => student.status === 'REVIEWING').length;
    const finalized = students.filter((student) => student.status === 'FINALIZED').length;
    const scored = students.map(getScore).filter((score): score is number => typeof score === 'number');
    const avgScore = scored.length
      ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length)
      : null;
    return { totalStudents, collecting, reviewing, finalized, avgScore };
  }, [students]);

  const scoreBuckets = useMemo(() => {
    const ranges = [
      { label: '≥640', min: 640, max: Infinity },
      { label: '600-639', min: 600, max: 639 },
      { label: '560-599', min: 560, max: 599 },
      { label: '520-559', min: 520, max: 559 },
      { label: '<520', min: -Infinity, max: 519 },
    ];
    const scored = students.map(getScore).filter((score): score is number => typeof score === 'number');
    return ranges.map((range) => {
      const count = scored.filter((score) => score >= range.min && score <= range.max).length;
      const percent = scored.length ? Math.max(4, Math.round((count / scored.length) * 100)) : 0;
      return { ...range, count, percent };
    });
  }, [students]);

  const attentionStudents = useMemo(
    () =>
      [...students]
        .sort((a, b) => {
          const aRisk = (a.status === 'COLLECTING' ? 2 : 0) + (getCompleteness(a) < 60 ? 1 : 0);
          const bRisk = (b.status === 'COLLECTING' ? 2 : 0) + (getCompleteness(b) < 60 ? 1 : 0);
          return bRisk - aRisk;
        })
        .slice(0, 5),
    [students],
  );

  const kpis = [
    { label: '学生总数', value: stats.totalStudents, suffix: '人', tone: 'border-l-primary' },
    { label: '平均分', value: stats.avgScore ?? '--', suffix: stats.avgScore ? '分' : '', tone: 'border-l-accent' },
    { label: '待审核方案', value: stats.reviewing, suffix: '项', tone: 'border-l-rush' },
    { label: '已定稿', value: stats.finalized, suffix: '人', tone: 'border-l-safe' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            Teacher Console
          </p>
          <h1 className="font-serif text-3xl font-semibold text-text">看板 · Dashboard</h1>
          <p className="mt-2 text-sm text-text-muted">
            {stats.totalStudents} 名学生 · {stats.collecting} 人待采集 · {stats.reviewing} 份待审核
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((key) => key + 1)}>
            刷新
          </Button>
          <Link href="/teacher/students/create">
            <Button type="primary" icon={<PlusOutlined />} className="border-0">
              新建学生
            </Button>
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`rounded-2xl border-l-[3px] ${kpi.tone} bg-surface px-5 py-4 shadow-card`}>
            <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">{kpi.label}</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-text">
              {kpi.value}
              <span className="ml-1 text-sm font-normal text-text-muted">{kpi.suffix}</span>
            </p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
          <Spin size="large" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <section className="rounded-2xl bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
                <h2 className="font-serif text-lg font-semibold text-text">班级分数分布</h2>
                <span className="text-xs text-text-muted">来自学生列表分数字段</span>
              </div>
              <div className="space-y-3 px-6 py-5">
                {scoreBuckets.map((bucket, index) => (
                  <div key={bucket.label} className="grid grid-cols-[64px_1fr_56px] items-center gap-3">
                    <span className="text-xs font-medium text-text-muted">{bucket.label}</span>
                    <div className="h-5 overflow-hidden rounded-md bg-bg">
                      <div
                        className={`h-full rounded-md ${
                          index < 2 ? 'bg-gradient-to-r from-safe to-[#80c89c]' : index < 4 ? 'bg-gradient-to-r from-accent-light to-accent' : 'bg-gradient-to-r from-rush to-[#9a3412]'
                        }`}
                        style={{ width: `${bucket.percent}%` }}
                      />
                    </div>
                    <span className="text-right font-serif text-sm font-semibold text-text">{bucket.count} 人</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
                <h2 className="font-serif text-lg font-semibold text-text">
                  需要关注的学生
                  <span className="ml-2 text-sm font-semibold text-rush">{attentionStudents.length}</span>
                </h2>
                <Link href="/teacher/students" className="text-sm font-medium text-primary no-underline">
                  全部学生 <RightOutlined className="text-[10px]" />
                </Link>
              </div>
              {attentionStudents.length === 0 ? (
                <div className="py-10">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无学生数据" />
                </div>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {attentionStudents.map((student) => {
                    const score = getScore(student);
                    const rank = getRank(student);
                    const completeness = getCompleteness(student);
                    const name = student.realName || student.username || '学生';
                    return (
                      <Link
                        key={student.id}
                        href={`/teacher/students/${student.id}`}
                        className="grid grid-cols-[40px_1fr_90px_90px_90px_24px] items-center gap-4 px-6 py-4 text-text no-underline hover:bg-bg"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light font-serif font-semibold text-white">
                          {name.charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{name}</span>
                          <span className="mt-0.5 block text-xs text-text-muted">
                            {score ? `${score} 分` : '未录入分数'} · {rank ? `${formatNumber(rank)} 位` : '位次待计算'}
                          </span>
                        </span>
                        <span>
                          <span className="block text-[10px] uppercase tracking-[1.2px] text-text-muted">状态</span>
                          <span className="font-serif text-sm font-semibold">{STATUS_LABELS[student.status || ''] || '未知'}</span>
                        </span>
                        <span>
                          <span className="block text-[10px] uppercase tracking-[1.2px] text-text-muted">完整度</span>
                          <span className="font-serif text-sm font-semibold">{completeness}%</span>
                        </span>
                        <span className={`rounded-md px-2 py-1 text-center text-[11px] font-semibold ${completeness < 60 ? 'bg-[#fee2e2] text-rush' : 'bg-accent-fixed text-accent'}`}>
                          {completeness < 60 ? '需补档' : '跟进'}
                        </span>
                        <RightOutlined className="text-text-faint" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl bg-surface shadow-card">
              <div className="border-b border-border-subtle px-6 py-4">
                <h2 className="font-serif text-lg font-semibold text-text">今日待办</h2>
              </div>
              <div className="divide-y divide-border-subtle">
                {[
                  [`审核 ${stats.reviewing} 份待审核方案`, stats.reviewing ? '高' : '低'],
                  [`补齐 ${stats.collecting} 名学生档案`, stats.collecting ? '中' : '低'],
                  ['生成本周班级跟进清单', '中'],
                ].map(([title, urgency], index) => (
                  <div key={title} className="grid grid-cols-[22px_1fr_auto] gap-3 px-6 py-4">
                    <span className="mt-0.5 h-[18px] w-[18px] rounded-md border border-border bg-white" />
                    <span>
                      <span className="block text-sm font-medium text-text">{title}</span>
                      <span className="mt-1 block text-xs text-text-muted">
                        {index === 2 ? '当前没有独立待办接口，按学生状态生成提醒' : '来自学生状态统计'}
                      </span>
                    </span>
                    <span className={`h-fit rounded px-2 py-0.5 text-[11px] font-semibold ${urgency === '高' ? 'bg-[#fee2e2] text-rush' : 'bg-accent-fixed text-accent'}`}>
                      {urgency}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-surface shadow-card">
              <div className="border-b border-border-subtle px-6 py-4">
                <h2 className="font-serif text-lg font-semibold text-text">状态动态</h2>
              </div>
              <div className="px-6 py-3">
                {attentionStudents.slice(0, 4).map((student) => {
                  const name = student.realName || student.username || '学生';
                  return (
                    <Link
                      key={student.id}
                      href={`/teacher/students/${student.id}`}
                      className="flex gap-3 border-b border-border-subtle py-3 text-text no-underline last:border-b-0"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-fixed font-serif text-xs font-semibold text-accent">
                        {name.charAt(0)}
                      </span>
                      <span className="text-sm leading-6">
                        <strong className="font-semibold">{name}</strong> 当前处于
                        <strong className="mx-1 font-semibold">{STATUS_LABELS[student.status || ''] || '未知状态'}</strong>
                        阶段
                        <span className="block text-xs text-text-muted">点击查看档案与方案进度</span>
                      </span>
                    </Link>
                  );
                })}
                {attentionStudents.length === 0 ? (
                  <p className="py-8 text-center text-sm text-text-muted">暂无动态</p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
