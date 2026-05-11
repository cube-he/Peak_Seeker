'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Empty, Spin } from 'antd';
import {
  FileTextOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import { studentApi } from '@/services/student-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';
import StudentSummaryRail from '@/components/student/workspace/StudentSummaryRail';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '@/components/student/workspace/StudentWorkspace';

const BATCH_LABELS: Record<string, string> = {
  EARLY: '本科提前批',
  BATCH_1: '本科一批',
  BATCH_2: '本科二批',
  JUNIOR_COLLEGE: '专科批',
};

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'CURRENT', label: '当前' },
  { key: 'DRAFT', label: '草稿' },
  { key: 'ARCHIVED', label: '归档' },
];

interface Plan {
  id: number;
  batch?: string;
  examSource?: string;
  status?: string;
  version?: number;
  itemCount?: number;
  updatedAt?: string;
}

function formatUpdatedAt(value?: string) {
  if (!value) return '等待更新';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPlanClass(status?: string) {
  if (status === 'ARCHIVED') return 'border-l-border opacity-75';
  if (status === 'DRAFT') return 'border-l-text-faint';
  return 'border-l-accent';
}

export default function StudentPlansPage() {
  const pathname = usePathname();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const { data, isLoading } = useQuery({
    queryKey: ['student-plans'],
    queryFn: () => planApi.getMyPlans(),
  });
  const { data: profileData } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  const plans: Plan[] = data?.data || [];
  const profile = (profileData as any)?.data ?? profileData;

  const counts = useMemo(
    () => ({
      ALL: plans.length,
      CURRENT: plans.filter((plan) => plan.status !== 'DRAFT' && plan.status !== 'ARCHIVED').length,
      DRAFT: plans.filter((plan) => plan.status === 'DRAFT').length,
      ARCHIVED: plans.filter((plan) => plan.status === 'ARCHIVED').length,
    }),
    [plans],
  );

  const filteredPlans = useMemo(() => {
    if (activeFilter === 'ALL') return plans;
    if (activeFilter === 'CURRENT') {
      return plans.filter((plan) => plan.status !== 'DRAFT' && plan.status !== 'ARCHIVED');
    }
    return plans.filter((plan) => plan.status === activeFilter);
  }, [activeFilter, plans]);

  const rail = (
    <StudentSummaryRail
      activePathname={pathname}
      profile={profile}
      progress={profile?.progress}
      plansCount={plans.length}
    />
  );

  const aside = (
    <>
      <StudentWorkspacePanel title="方案状态">
        <p className="m-0 text-sm leading-6 text-text-muted">
          当前列表由老师生成，学生端可查看、对比并确认方案内容。
        </p>
      </StudentWorkspacePanel>

      <StudentWorkspacePanel title="能力说明">
        <div className="flex gap-3 text-sm leading-6 text-text-muted">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-dim text-primary">
            <FileTextOutlined aria-hidden="true" />
          </span>
          <p className="m-0">
            新建、复制或导出方案需要后端开放学生端方案编辑 API，当前入口保持只读查看。
          </p>
        </div>
      </StudentWorkspacePanel>
    </>
  );

  return (
    <StudentWorkspace rail={rail} aside={aside}>
      <div className="space-y-5">
        <header className="pt-1">
          <h1 className="font-serif text-2xl font-semibold text-text">我的方案</h1>
          <p className="mt-1 text-sm text-text-muted">
            {plans.length} 份方案 · 当前列表由老师生成，学生端可查看与确认
          </p>
        </header>

      <div className="rounded-xl border-l-[3px] border-l-accent bg-accent-fixed px-4 py-3 text-sm leading-6 text-text-secondary">
        <InfoCircleOutlined aria-hidden="true" className="mr-2 text-accent" />
        方案仅供参考，请与老师充分沟通后确认最终志愿。列表接口暂未返回冲稳保分段，卡片中保留“待同步”提示。
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-dim p-1">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveFilter(filter.key)}
            className={`rounded-lg border-0 px-2 py-2 text-xs font-medium transition-colors ${
              activeFilter === filter.key
                ? 'bg-white text-text shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'bg-transparent text-text-muted'
            }`}
          >
            {filter.label}
            <span className="ml-1 text-[10px] text-text-faint">{counts[filter.key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-surface py-16 text-center shadow-card">
          <Spin size="large" />
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-2xl bg-surface py-12 shadow-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-center">
                <p className="text-text-muted">暂无符合条件的志愿方案</p>
                <p className="mt-1 text-xs text-text-faint">老师生成方案后会在这里显示。</p>
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPlans.map((plan) => (
            <Link
              key={plan.id}
              href={`/student/plans/${plan.id}`}
              className={`block overflow-hidden rounded-2xl border-l-[3px] bg-surface text-text no-underline shadow-card transition-shadow hover:shadow-card-hover lg:rounded-xl ${getPlanClass(plan.status)}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <h2 className="truncate font-serif text-base font-semibold">
                    <span className="mr-1 font-sans text-sm font-semibold text-accent">V{plan.version || 1}</span>
                    {BATCH_LABELS[plan.batch || ''] || plan.batch || '志愿方案'}
                  </h2>
                  <p className="mt-1 text-xs text-text-muted">
                    {plan.examSource === 'GAOKAO' ? '高考正式方案' : '模拟预案'} · {plan.itemCount || 0} 个志愿
                  </p>
                </div>
                <PlanStatusBadge status={plan.status} />
              </div>

              <div className="mx-5 grid grid-cols-3 rounded-xl bg-bg py-3 text-center">
                {['冲', '稳', '保'].map((label) => (
                  <div key={label} className="border-r border-border-subtle px-2 last:border-r-0">
                    <p className="text-[10px] uppercase tracking-[1.4px] text-text-muted">{label}</p>
                    <p className="mt-1 font-serif text-lg font-semibold text-text-faint">--</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3 text-xs text-text-muted">
                <span>{formatUpdatedAt(plan.updatedAt)} 更新</span>
                <span className="font-medium text-primary">
                  查看详情 <RightOutlined aria-hidden="true" className="text-[10px]" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border-0 bg-primary text-lg text-white shadow-[0_8px_24px_rgba(184,134,11,0.35)] lg:hidden"
        title="新建方案待接入"
      >
        <PlusOutlined aria-hidden="true" />
      </button>
      </div>
    </StudentWorkspace>
  );
}
