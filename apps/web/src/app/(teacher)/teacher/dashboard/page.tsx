'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Empty, Input, Spin } from 'antd';
import {
  CheckCircleOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { planApi } from '@/services/plan-api';

// 高考 / 志愿填报截止日。今年官方日期公布前先用去年时间，由 VOLUNTEER_DEADLINE_IS_LAST_YEAR 控制 UI 提示
const EXAM_DATE = '2026-06-07T09:00:00+08:00';
const VOLUNTEER_DEADLINE = '2026-06-30T18:00:00+08:00';
const VOLUNTEER_DEADLINE_IS_LAST_YEAR = true;

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
  // 后端派生的工作流状态：COLLECTING/GENERATING/REVIEWING/FINALIZED/SUBMITTED
  workflowStatus?: string;
  // 原始 StudentStatus (ACTIVE/GRADUATED/...)，保留向后兼容，业务上不要直接判断
  status?: string;
  score?: number;
  totalScore?: number;
  rank?: number;
  provincialRank?: number;
  completeness?: number;
  progress?: { overallCompleteness?: number; studentSelfCompleteness?: number };
  planCount?: number;
  updatedAt?: string;
}

function getWorkflowStatus(student: StudentCard): string {
  return student.workflowStatus ?? 'COLLECTING';
}

interface PendingPlan {
  id: number;
  studentName: string;
  studentId: number;
  status: string;
  updatedAt: string;
}

interface RiskItem {
  key: string;
  studentId: number;
  name: string;
  initial: string;
  tag: string;
  reason: string;
  priority: number;
  severity: 'high' | 'medium';
  primaryAction: { label: string; href: string };
}

function getScore(student: StudentCard) {
  return student.score ?? student.totalScore ?? null;
}

function getCompleteness(student: StudentCard) {
  return student.completeness ?? student.progress?.overallCompleteness ?? 0;
}

function daysUntil(target: Date, now: Date) {
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function daysSince(date: string | undefined, now: Date) {
  if (!date) return null;
  const past = new Date(date);
  if (Number.isNaN(past.getTime())) return null;
  return Math.floor((now.getTime() - past.getTime()) / 86_400_000);
}

function formatRelativeTime(date: Date, now: Date) {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86_400)} 天前`;
}

function computeRisks(
  students: StudentCard[],
  pendingPlans: PendingPlan[],
  now: Date,
  deadline: Date,
): RiskItem[] {
  const list: RiskItem[] = [];
  const daysToDeadline = daysUntil(deadline, now);

  students.forEach((student) => {
    const status = getWorkflowStatus(student);
    const noActionDays = daysSince(student.updatedAt, now);
    const completeness = getCompleteness(student);
    const name = student.realName || student.username || '学生';
    const initial = name.charAt(0);

    // 已定稿/已填报学生不再产生风险（除非临期但还没填报）
    if (status === 'SUBMITTED') return;

    // 信号 1：临期未定稿（7 天内截止且未定稿）
    if (status !== 'FINALIZED' && daysToDeadline <= 7 && daysToDeadline >= 0) {
      list.push({
        key: `deadline-${student.id}`,
        studentId: student.id,
        name,
        initial,
        tag: '临期未定稿',
        reason: `距填报截止还剩 ${daysToDeadline} 天 · 当前${STATUS_LABELS[status] ?? '未知'}`,
        priority: 1000 + (7 - daysToDeadline) * 10,
        severity: 'high',
        primaryAction: { label: '打开档案', href: `/teacher/students/${student.id}` },
      });
      return;
    }

    // 信号 2：长时间无动作
    if (noActionDays !== null && noActionDays >= 7 && status !== 'FINALIZED') {
      list.push({
        key: `idle-${student.id}`,
        studentId: student.id,
        name,
        initial,
        tag: '长时间无动作',
        reason: `${noActionDays} 天未更新 · 当前${STATUS_LABELS[status] ?? '未知'}`,
        priority: 500 + noActionDays,
        severity: 'medium',
        primaryAction: { label: '打开档案', href: `/teacher/students/${student.id}` },
      });
      return;
    }

    // 信号 3：低完整度（仅在采集阶段）
    if (status === 'COLLECTING' && completeness < 60) {
      list.push({
        key: `incomplete-${student.id}`,
        studentId: student.id,
        name,
        initial,
        tag: '档案不完整',
        reason: `完整度 ${completeness}%`,
        priority: 200 + (60 - completeness),
        severity: 'medium',
        primaryAction: { label: '打开档案', href: `/teacher/students/${student.id}` },
      });
    }
  });

  // 信号 4：方案审核积压（>3 天未处理）
  pendingPlans.forEach((plan) => {
    const days = daysSince(plan.updatedAt, now);
    if (days === null || days < 3) return;
    const name = plan.studentName || '学生';
    list.push({
      key: `pending-${plan.id}`,
      studentId: plan.studentId,
      name,
      initial: name.charAt(0),
      tag: '审核积压',
      reason: `方案提交 ${days} 天未处理`,
      priority: 700 + days,
      severity: 'high',
      primaryAction: { label: '立即审核', href: `/teacher/plans/${plan.id}` },
    });
  });

  return list.sort((a, b) => b.priority - a.priority);
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  // 客户端启动后再产生 now / updatedAt，避免 SSR / 客户端时间不一致导致 hydration 警告
  const [clock, setClock] = useState<{ now: Date; updatedAt: Date } | null>(null);

  useEffect(() => {
    const stamp = new Date();
    setClock({ now: stamp, updatedAt: stamp });
  }, [refreshKey]);

  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['teacher-dashboard-students', refreshKey],
    queryFn: () => studentApi.getList({ pageSize: 200 }),
  });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['teacher-dashboard-pending-plans', refreshKey],
    queryFn: () => planApi.getTeacherPlans({ status: 'PENDING_REVIEW', pageSize: 100 }),
  });

  const isLoading = studentsLoading || plansLoading || clock === null;

  // 接口返回结构两种都兼容（参考 students/page.tsx 现有写法）
  const students: StudentCard[] = studentsData?.data?.data ?? studentsData?.data ?? [];
  const pendingPlans: PendingPlan[] = plansData?.data?.data ?? plansData?.data ?? [];

  const now = clock?.now ?? new Date(0);
  const updatedAt = clock?.updatedAt ?? new Date(0);
  const examDate = useMemo(() => new Date(EXAM_DATE), []);
  const deadlineDate = useMemo(() => new Date(VOLUNTEER_DEADLINE), []);
  const examDaysLeft = Math.max(0, daysUntil(examDate, now));
  const deadlineDaysLeft = Math.max(0, daysUntil(deadlineDate, now));

  // 各状态人数
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      COLLECTING: 0,
      GENERATING: 0,
      REVIEWING: 0,
      FINALIZED: 0,
      SUBMITTED: 0,
    };
    students.forEach((s) => {
      const ws = getWorkflowStatus(s);
      const key = counts[ws] !== undefined ? ws : 'COLLECTING';
      counts[key] += 1;
    });
    return counts;
  }, [students]);

  const totalStudents = students.length;
  const finalizedCount = (statusCounts.FINALIZED ?? 0) + (statusCounts.SUBMITTED ?? 0);
  const completionRatio = totalStudents > 0 ? Math.round((finalizedCount / totalStudents) * 100) : 0;

  const avgScore = useMemo(() => {
    const scored = students.map(getScore).filter((s): s is number => typeof s === 'number');
    return scored.length ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length) : null;
  }, [students]);

  const avgCompleteness = useMemo(() => {
    if (!students.length) return 0;
    return Math.round(students.reduce((sum, s) => sum + getCompleteness(s), 0) / students.length);
  }, [students]);

  const risks = useMemo(
    () => computeRisks(students, pendingPlans, now, deadlineDate),
    [students, pendingPlans, now, deadlineDate],
  );

  // 临期未定稿的人数（用于顶部警告）
  const deadlineRiskCount = useMemo(
    () => risks.filter((r) => r.tag === '临期未定稿').length,
    [risks],
  );

  // 瓶颈：找非终态节点中人数最多的
  const bottleneck = useMemo(() => {
    const candidates: Array<{ key: string; label: string }> = [
      { key: 'COLLECTING', label: '待采集' },
      { key: 'GENERATING', label: '待生成' },
      { key: 'REVIEWING', label: '待审核' },
    ];
    return candidates.reduce(
      (best, stage) => {
        const count = statusCounts[stage.key] ?? 0;
        return count > best.count ? { stage, count } : best;
      },
      { stage: candidates[0], count: 0 },
    );
  }, [statusCounts]);

  const handleSearch = () => {
    const keyword = searchInput.trim();
    router.push(keyword ? `/teacher/students?keyword=${encodeURIComponent(keyword)}` : '/teacher/students');
  };

  return (
    <div className="space-y-5">
      {/* A 区：顶部 */}
      <header className="space-y-4 rounded-2xl bg-surface px-6 py-5 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text">看板</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
              <span>{totalStudents} 名学生</span>
              <span aria-hidden>·</span>
              <span>平均分 {avgScore ?? '--'}</span>
              <span aria-hidden>·</span>
              <span>
                数据更新于 {clock ? formatRelativeTime(updatedAt, now) : '--'}
                <Button
                  size="small"
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={() => setRefreshKey((k) => k + 1)}
                  aria-label="刷新数据"
                  className="ml-1"
                />
              </span>
            </p>
          </div>
          <Input
            placeholder="搜索学生姓名 / 学号 (回车跳转)"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleSearch}
            className="lg:w-[320px]"
            allowClear
          />
        </div>

        {/* 倒计时 + 临期警告 */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary-fixed px-3 py-1.5 text-primary">
            距高考 <strong className="text-base">{examDaysLeft}</strong> 天
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-fixed px-3 py-1.5 text-accent">
            距志愿填报截止 <strong className="text-base">{deadlineDaysLeft}</strong> 天
            {VOLUNTEER_DEADLINE_IS_LAST_YEAR ? (
              <span className="text-xs font-normal text-text-muted">(去年时间·仅供参考)</span>
            ) : null}
          </span>
          {deadlineRiskCount > 0 ? (
            <Link
              href="/teacher/students?workflowStatus=COLLECTING"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#fee2e2] px-3 py-1.5 text-rush no-underline"
            >
              <WarningOutlined /> {deadlineRiskCount} 人定稿临期
            </Link>
          ) : null}
        </div>

        {/* 快捷操作 */}
        <div className="flex flex-wrap gap-2">
          <Link href="/teacher/plans?status=PENDING_REVIEW">
            <Button type="primary" icon={<CheckCircleOutlined />} className="border-0">
              处理 {pendingPlans.length} 份待审
            </Button>
          </Link>
          <Link href="/teacher/students/create">
            <Button icon={<PlusOutlined />}>新建学生</Button>
          </Link>
          <Button icon={<UploadOutlined />} disabled title="批量导入功能待接入">
            批量导入
          </Button>
          <Link href="/teacher/students">
            <Button icon={<FileTextOutlined />}>班级清单</Button>
          </Link>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* B 区：班级推进漏斗 */}
          <FunnelSection
            counts={statusCounts}
            totalStudents={totalStudents}
            completionRatio={completionRatio}
            bottleneck={bottleneck}
          />

          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            {/* C 区：风险中心 */}
            <RiskSection risks={risks} />

            {/* D 区：关键指标卡 */}
            <MetricsSection
              totalStudents={totalStudents}
              avgScore={avgScore}
              riskCount={risks.length}
              avgCompleteness={avgCompleteness}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── B 区：班级推进漏斗 ──
function FunnelSection({
  counts,
  totalStudents,
  completionRatio,
  bottleneck,
}: {
  counts: Record<string, number>;
  totalStudents: number;
  completionRatio: number;
  bottleneck: { stage: { key: string; label: string }; count: number };
}) {
  const stages = [
    { key: 'COLLECTING', label: '待采集', barClass: 'bg-gradient-to-r from-[#dbe5e7] to-[#a5b5b8]' },
    { key: 'GENERATING', label: '待生成', barClass: 'bg-gradient-to-r from-[#cbd5e8] to-[#8595c3]' },
    { key: 'REVIEWING', label: '待审核', barClass: 'bg-gradient-to-r from-[#fde4c8] to-[#e8a86a]' },
    { key: 'FINALIZED', label: '已定稿', barClass: 'bg-gradient-to-r from-[#cfe9d6] to-[#80c89c]' },
    { key: 'SUBMITTED', label: '已填报', barClass: 'bg-gradient-to-r from-[#bce5e0] to-[#5fa9a1]' },
  ];

  const max = Math.max(1, ...stages.map((s) => counts[s.key] ?? 0));

  return (
    <section className="rounded-2xl bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <h2 className="text-lg font-semibold text-text">班级推进</h2>
        <span className="text-sm text-text-muted">
          <strong className="text-text">{completionRatio}%</strong> 已定稿 · 共 {totalStudents} 人
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 px-6 py-5 md:grid-cols-3 lg:grid-cols-5">
        {stages.map((stage) => {
          const count = counts[stage.key] ?? 0;
          const percent = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
          return (
            <Link
              key={stage.key}
              href={`/teacher/students?workflowStatus=${stage.key}`}
              className="group flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg/40 p-3 no-underline transition hover:border-primary hover:bg-surface hover:shadow-sm"
            >
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                {stage.label}
              </span>
              <span className="text-2xl font-semibold text-text">{count}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <div className={`h-full rounded-full ${stage.barClass}`} style={{ width: `${count > 0 ? percent : 0}%` }} />
              </div>
              <span className="text-[11px] text-text-faint group-hover:text-primary">点击查看 →</span>
            </Link>
          );
        })}
      </div>
      {totalStudents > 0 && bottleneck.count > 0 ? (
        <div className="border-t border-border-subtle bg-bg/40 px-6 py-3 text-sm text-text-muted">
          <WarningOutlined className="mr-2 text-rush" />
          瓶颈：<strong className="text-text">{bottleneck.count}</strong> 名学生卡在「{bottleneck.stage.label}」环节
          <Link
            href={`/teacher/students?workflowStatus=${bottleneck.stage.key}`}
            className="ml-2 font-medium text-primary no-underline"
          >
            优先处理 →
          </Link>
        </div>
      ) : null}
    </section>
  );
}

// ── C 区：风险中心 ──
function RiskSection({ risks }: { risks: RiskItem[] }) {
  const displayed = risks.slice(0, 6);
  return (
    <section className="rounded-2xl bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <h2 className="text-lg font-semibold text-text">
          风险中心
          {risks.length > 0 ? (
            <span className="ml-2 text-base font-semibold text-rush">{risks.length}</span>
          ) : null}
        </h2>
        <Link href="/teacher/students" className="text-sm font-medium text-primary no-underline">
          全部学生 <RightOutlined className="text-[10px]" />
        </Link>
      </div>
      {risks.length === 0 ? (
        <div className="py-12">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="目前没有需要紧急处理的学生" />
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {displayed.map((risk) => {
            const tagClass =
              risk.severity === 'high' ? 'bg-[#fee2e2] text-rush' : 'bg-accent-fixed text-accent';
            return (
              <div key={risk.key} className="grid grid-cols-[40px_1fr_auto] items-center gap-4 px-6 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light text-sm font-semibold text-white">
                  {risk.initial}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{risk.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tagClass}`}>
                      {risk.tag}
                    </span>
                  </div>
                  <span className="mt-0.5 block text-xs text-text-muted">{risk.reason}</span>
                </div>
                <Link href={risk.primaryAction.href}>
                  <Button size="small" type="primary" ghost>
                    {risk.primaryAction.label}
                  </Button>
                </Link>
              </div>
            );
          })}
          {risks.length > displayed.length ? (
            <div className="bg-bg/30 px-6 py-3 text-center text-xs text-text-muted">
              还有 {risks.length - displayed.length} 名学生有风险，
              <Link href="/teacher/students" className="font-medium text-primary no-underline">
                查看全部 →
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ── D 区：关键指标卡 ──
function MetricsSection({
  totalStudents,
  avgScore,
  riskCount,
  avgCompleteness,
}: {
  totalStudents: number;
  avgScore: number | null;
  riskCount: number;
  avgCompleteness: number;
}) {
  const items = [
    { label: '学生总数', value: totalStudents, suffix: '人' },
    { label: '平均分', value: avgScore ?? '--', suffix: avgScore !== null ? '分' : '' },
    { label: '风险学生', value: riskCount, suffix: '人', emphasize: riskCount > 0 },
    { label: '平均完整度', value: avgCompleteness, suffix: '%' },
  ];
  return (
    <section className="rounded-2xl bg-surface shadow-card">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="text-lg font-semibold text-text">关键指标</h2>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-6 py-5">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{item.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${item.emphasize ? 'text-rush' : 'text-text'}`}>
              {item.value}
              <span className="ml-1 text-sm font-normal text-text-muted">{item.suffix}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
