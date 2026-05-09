'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import {
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  RightOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { studentApi } from '@/services/student-api';
import { timelineApi } from '@/services/timeline-api';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';
import { useAuthStore } from '@/stores/authStore';

const PROGRESS_STEPS = [
  { key: 'profile', label: '注册建档' },
  { key: 'score', label: '录入分数' },
  { key: 'plan', label: '挑选方案' },
  { key: 'submit', label: '填报志愿' },
];

const STATUS_TO_STEP: Record<string, number> = {
  COLLECTING: 0,
  GENERATING: 1,
  REVIEWING: 2,
  FINALIZED: 3,
  SUBMITTED: 4,
};

const BATCH_LABELS: Record<string, string> = {
  EARLY: '本科提前批',
  BATCH_1: '本科一批',
  BATCH_2: '本科二批',
  JUNIOR_COLLEGE: '专科批',
};

interface Plan {
  id: number;
  batch?: string;
  examSource?: string;
  status?: string;
  version?: number;
  itemCount?: number;
  updatedAt?: string;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
}

function formatUpdatedAt(value?: string) {
  if (!value) return '等待更新';
  return new Date(value).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

export default function StudentDashboardPage() {
  const { user } = useAuthStore();

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  const { data: progressData } = useQuery({
    queryKey: ['student-progress'],
    queryFn: () => studentApi.getMyProgress(),
  });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['student-plans'],
    queryFn: () => planApi.getMyPlans(),
  });

  const profile = profileData?.data;
  const plans: Plan[] = plansData?.data || [];
  const currentPlan = plans[0];
  const currentStep = STATUS_TO_STEP[profile?.status || 'COLLECTING'] ?? 0;
  const completion =
    progressData?.data?.overallCompleteness ??
    Math.min(100, Math.round(((currentStep + 1) / 5) * 100));

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }),
    [],
  );

  const { data: timelineData } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });

  const countdownDays = useMemo(() => {
    const events = timelineData?.events ?? [];
    const countdown = events.find((event) => event.status === 'countdown');
    if (!countdown?.startDate) return null;
    const target = new Date(countdown.startDate);
    const now = new Date();
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }, [timelineData]);

  const quickActions = [
    {
      href: '/student/recommend',
      label: 'AI 推荐',
      icon: <StarOutlined />,
      tone: 'bg-accent-fixed text-accent',
    },
    {
      href: '/universities',
      label: '院校库',
      icon: <BankOutlined />,
      tone: 'bg-[#dbeafe] text-[#1e40af]',
    },
    {
      href: '/scores',
      label: '查分线',
      icon: <BarChartOutlined />,
      tone: 'bg-[#dcfce7] text-[#166534]',
    },
    {
      href: '#',
      label: 'AI 答疑',
      icon: <MessageOutlined />,
      tone: 'bg-[#fee2e2] text-[#991b1b]',
      disabled: true,
    },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-[#1e3a5f] px-5 py-6 text-white shadow-[0_18px_45px_rgba(30,58,95,0.24)]">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url('/images/bg-student-welcome.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'right -48px center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1e3a5f] via-[#1e3a5f]/85 to-[#15212e]/45" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[1.8px] text-white/60">{todayLabel}</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold leading-tight">
            {user?.realName || user?.username || '同学'}，继续把志愿方案打磨扎实
          </h1>
          <div className="mt-6 grid grid-cols-[1fr_1px_1fr_1px_1fr] items-center gap-4">
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-[1.4px] text-white/55">省排名</p>
              <p className="font-serif text-2xl font-semibold text-accent-light">
                {formatNumber(profile?.provincialRank)}
              </p>
            </div>
            <div className="h-9 bg-white/20" />
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-[1.4px] text-white/55">我的方案</p>
              <p className="font-serif text-2xl font-semibold">
                {plans.length}
                <span className="ml-1 text-sm font-normal text-white/70">份</span>
              </p>
            </div>
            <div className="h-9 bg-white/20" />
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-[1.4px] text-white/55">倒计时</p>
              <p className="font-serif text-2xl font-semibold">
                {countdownDays ?? '--'}
                <span className="ml-1 text-sm font-normal text-white/70">天</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-surface px-5 py-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-base font-semibold text-text">志愿决策进度</h2>
          <span className="font-serif text-base font-semibold text-accent">{completion}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light"
            style={{ width: `${completion}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
          {PROGRESS_STEPS.map((step, index) => {
            const done = index < Math.min(currentStep, PROGRESS_STEPS.length - 1);
            const active = index === Math.min(currentStep, PROGRESS_STEPS.length - 1);
            return (
              <div
                key={step.key}
                className={done ? 'text-safe' : active ? 'font-semibold text-accent' : 'text-text-muted'}
              >
                <span className="mb-1 block text-sm">
                  {done ? <CheckCircleOutlined /> : active ? <ClockCircleOutlined /> : <span className="inline-block h-3 w-3 rounded-full border border-current" />}
                </span>
                {step.label}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-text">快捷功能</h2>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((action) =>
            action.disabled ? (
              <div
                key={action.label}
                className="rounded-xl bg-surface px-2 py-3 text-center opacity-70 shadow-card"
              >
                <span className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] text-base ${action.tone}`}>
                  {action.icon}
                </span>
                <p className="text-[11px] font-medium text-text">{action.label}</p>
                <p className="mt-1 text-[9px] text-text-muted">待接入</p>
              </div>
            ) : (
              <Link
                key={action.label}
                href={action.href}
                className="rounded-xl bg-surface px-2 py-3 text-center no-underline shadow-card transition-transform hover:-translate-y-0.5"
              >
                <span className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] text-base ${action.tone}`}>
                  {action.icon}
                </span>
                <p className="text-[11px] font-medium text-text">{action.label}</p>
              </Link>
            ),
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-text">当前方案</h2>
          <Link href="/student/plans" className="text-xs font-medium text-primary no-underline">
            全部 ({plans.length}) <RightOutlined className="text-[10px]" />
          </Link>
        </div>

        {plansLoading ? (
          <div className="rounded-2xl bg-surface py-10 text-center shadow-card">
            <Spin />
          </div>
        ) : currentPlan ? (
          <Link href={`/student/plans/${currentPlan.id}`} className="block no-underline">
            <div className="overflow-hidden rounded-2xl border-t-[3px] border-accent bg-surface shadow-card transition-shadow hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <h3 className="font-serif text-base font-semibold text-text">
                    {BATCH_LABELS[currentPlan.batch || ''] || currentPlan.batch || '志愿方案'} V{currentPlan.version || 1}
                  </h3>
                  <p className="mt-1 text-xs text-text-muted">
                    {currentPlan.examSource === 'GAOKAO' ? '高考正式方案' : '模拟预案'} · {currentPlan.itemCount || 0} 个志愿
                  </p>
                </div>
                {currentPlan.status ? <PlanStatusBadge status={currentPlan.status} /> : null}
              </div>
              <div className="grid grid-cols-3 border-y border-border-subtle text-center">
                {[
                  ['冲', Math.ceil((currentPlan.itemCount || 0) * 0.25), 'text-rush'],
                  ['稳', Math.ceil((currentPlan.itemCount || 0) * 0.45), 'text-accent'],
                  ['保', Math.max(0, (currentPlan.itemCount || 0) - Math.ceil((currentPlan.itemCount || 0) * 0.7)), 'text-safe'],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="border-r border-border-subtle px-3 py-3 last:border-r-0">
                    <p className="text-[10px] uppercase tracking-[1.4px] text-text-muted">{label}</p>
                    <p className={`mt-1 font-serif text-xl font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-xs text-text-muted">{formatUpdatedAt(currentPlan.updatedAt)} 更新</span>
                <span className="text-sm font-medium text-primary">
                  查看方案 <RightOutlined className="text-[10px]" />
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl bg-surface px-5 py-6 shadow-card">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary">
                <FileTextOutlined />
              </span>
              <div>
                <h3 className="font-medium text-text">暂时还没有老师生成的方案</h3>
                <p className="mt-1 text-sm text-text-muted">
                  完善成绩、位次和偏好后，老师生成的方案会显示在这里。
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-text">消息提醒</h2>
        </div>
        <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
          {profileLoading ? (
            <div className="py-8 text-center">
              <Spin />
            </div>
          ) : (
            <>
              <Link href="/student/profile" className="grid grid-cols-[36px_1fr_auto] gap-3 border-b border-border-subtle px-4 py-4 no-underline">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fee2e2] text-[#991b1b]">
                  <ExclamationCircleOutlined />
                </span>
                <span>
                  <span className="block text-sm font-medium text-text">完善个人信息后，推荐会更稳定</span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {progressData?.data?.missingFieldsForRecommend?.length
                      ? `仍有 ${progressData.data.missingFieldsForRecommend.length} 项关键信息待补充`
                      : '成绩、选科和偏好越完整，方案越贴近真实填报'}
                  </span>
                </span>
                <span className="text-xs text-primary">去完善</span>
              </Link>
              <div className="grid grid-cols-[36px_1fr_auto] gap-3 px-4 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dbeafe] text-[#1e40af]">
                  <BellOutlined />
                </span>
                <span>
                  <span className="block text-sm font-medium text-text">{currentYear} 年高考时间线已同步</span>
                  <span className="mt-1 block text-xs text-text-muted">
                    倒计时、志愿填报节点会跟随后台时间线接口更新
                  </span>
                </span>
                <span className="text-xs text-text-muted">自动</span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
