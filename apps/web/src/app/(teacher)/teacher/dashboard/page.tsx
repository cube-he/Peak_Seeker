'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Spin } from 'antd';
import {
  CheckCircleOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { planApi } from '@/services/plan-api';
import { timelineApi, type TimelineEvent } from '@/services/timeline-api';

// 兜底日期:仅在 timeline API 加载失败或事件缺失时使用。来源:四川省教育考试院 2026 年通知。
const FALLBACK_EXAM_DATE = '2026-06-07T09:00:00+08:00';
const FALLBACK_DEADLINE_REGULAR = '2026-07-01T17:00:00+08:00';

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

// 三轨待办流 + 沉默学生的统一项目结构
interface TodoItem {
  key: string;             // 唯一 key (e.g. 'pending-plan-42')
  studentId: number;
  name: string;
  initial: string;
  // 这一条出现在哪个轨上,决定颜色和分组
  track: 'wait-me' | 'wait-student-parent' | 'wait-supervisor' | 'sleeping';
  // 主标签,显示在卡片标题旁
  label: string;
  // 副文,显示在主标签下
  detail: string;
  // 主操作按钮
  primaryAction: { label: string; href: string };
  // 排序优先级(数字越大越靠前)
  priority: number;
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

function categorizeStudents(
  students: StudentCard[],
  pendingPlans: PendingPlan[],
  now: Date,
): {
  waitMe: TodoItem[];
  waitStudentParent: TodoItem[];
  waitSupervisor: TodoItem[];
  sleeping: TodoItem[];
} {
  const waitMe: TodoItem[] = [];
  const waitStudentParent: TodoItem[] = [];
  const waitSupervisor: TodoItem[] = [];
  const sleeping: TodoItem[] = [];

  // ── 等主管:由 plan status PENDING_REVIEW 驱动 ──
  pendingPlans.forEach((plan) => {
    const days = daysSince(plan.updatedAt, now);
    const name = plan.studentName || '学生';
    waitSupervisor.push({
      key: `pending-${plan.id}`,
      studentId: plan.studentId,
      name,
      initial: name.charAt(0),
      track: 'wait-supervisor',
      label: '等主管审核',
      detail: days === null ? `刚提交` : `提交 ${days} 天前`,
      primaryAction: { label: '查看方案', href: `/teacher/plans/${plan.id}` },
      priority: 1000 - (days ?? 0),
    });
  });

  students.forEach((student) => {
    const status = getWorkflowStatus(student);
    const name = student.realName || student.username || '学生';
    const initial = name.charAt(0);
    const studentId = student.id;
    const noActionDays = daysSince(student.updatedAt, now);
    const completeness = getCompleteness(student);

    if (status === 'SUBMITTED') return;

    if (noActionDays !== null && noActionDays >= 7 && status !== 'FINALIZED') {
      sleeping.push({
        key: `sleeping-${studentId}`,
        studentId,
        name,
        initial,
        track: 'sleeping',
        label: `沉默 ${noActionDays} 天`,
        detail: `当前${STATUS_LABELS[status] ?? '未知'} · 完整度 ${completeness}%`,
        primaryAction: { label: '联系跟进', href: `/teacher/students/${studentId}` },
        priority: 800 + noActionDays,
      });
      return;
    }

    if (status === 'COLLECTING' && completeness < 60) {
      waitMe.push({
        key: `collect-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-me',
        label: '待采集资料',
        detail: `完整度 ${completeness}% · 老师需补充`,
        primaryAction: { label: '继续采集', href: `/teacher/students/${studentId}` },
        priority: 500 + (60 - completeness),
      });
      return;
    }

    if (status === 'GENERATING') {
      waitMe.push({
        key: `generate-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-me',
        label: '待生成方案',
        detail: `资料已齐 ${completeness}% · 等老师出方案`,
        primaryAction: { label: '生成方案', href: `/teacher/plans/generate/${studentId}` },
        priority: 600,
      });
      return;
    }

    if (status === 'COLLECTING' && completeness >= 60) {
      waitStudentParent.push({
        key: `student-fill-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-student-parent',
        label: '等家长补资料',
        detail: `已 ${completeness}% · 缺剩余字段`,
        primaryAction: { label: '查看 / 催办', href: `/teacher/students/${studentId}` },
        priority: 300 + completeness,
      });
      return;
    }

    if (status === 'FINALIZED') {
      waitStudentParent.push({
        key: `finalize-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-student-parent',
        label: '终稿待签字',
        detail: `方案已定稿 · 等家长确认提交`,
        primaryAction: { label: '查看方案', href: `/teacher/students/${studentId}` },
        priority: 400,
      });
      return;
    }
  });

  waitMe.sort((a, b) => b.priority - a.priority);
  waitStudentParent.sort((a, b) => b.priority - a.priority);
  waitSupervisor.sort((a, b) => b.priority - a.priority);
  sleeping.sort((a, b) => b.priority - a.priority);

  return { waitMe, waitStudentParent, waitSupervisor, sleeping };
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

  // 拉取真实 timeline 数据:高考日期 / 志愿填报截止 / 各批次录取窗口
  // 失败时使用 FALLBACK_* 常量,但 UI 上不再标注"这是去年数据",因为现在数据是当年的官方值
  const { data: timelineData } = useQuery({
    queryKey: ['timeline', new Date().getFullYear()],
    queryFn: () => timelineApi.getTimeline(),
    staleTime: 1000 * 60 * 60, // timeline 数据一小时缓存够了
  });
  const timelineEvents: TimelineEvent[] = timelineData?.events ?? [];

  // 从 events 提取关键日期,缺失则用 fallback
  const examDate = useMemo(() => {
    const gaokao = timelineEvents.find((e) => e.key === 'gaokao');
    return new Date(gaokao?.startDate ?? FALLBACK_EXAM_DATE);
  }, [timelineEvents]);

  const deadlineDate = useMemo(() => {
    // 本科批截止是教培老师最关心的;提前批/专科批截止可在副位展示(Task 后续可扩展)
    const regular = timelineEvents.find((e) => e.key === 'volunteer_deadline_regular');
    return new Date(regular?.startDate ?? FALLBACK_DEADLINE_REGULAR);
  }, [timelineEvents]);

  const examDaysLeft = Math.max(0, daysUntil(examDate, now));
  const deadlineDaysLeft = Math.max(0, daysUntil(deadlineDate, now));

  const totalStudents = students.length;

  const avgScore = useMemo(() => {
    const scored = students.map(getScore).filter((s): s is number => typeof s === 'number');
    return scored.length ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length) : null;
  }, [students]);

  const categorized = useMemo(
    () => categorizeStudents(students, pendingPlans, now),
    [students, pendingPlans, now],
  );

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
          </span>
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
          <ThreeTrackTodoSection
            waitMe={categorized.waitMe}
            waitStudentParent={categorized.waitStudentParent}
            waitSupervisor={categorized.waitSupervisor}
            sleeping={categorized.sleeping}
          />
        </>
      )}
    </div>
  );
}

// ── 三轨待办流 + 沉默学生 ──
function ThreeTrackTodoSection({
  waitMe,
  waitStudentParent,
  waitSupervisor,
  sleeping,
}: {
  waitMe: TodoItem[];
  waitStudentParent: TodoItem[];
  waitSupervisor: TodoItem[];
  sleeping: TodoItem[];
}) {
  return (
    <section className="rounded-2xl bg-surface shadow-card">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="text-lg font-semibold text-text">今天该做什么</h2>
      </div>
      <div className="grid gap-4 px-6 py-5 lg:grid-cols-3">
        <TodoTrack
          title="🔴 等我动手"
          items={waitMe}
          emptyText="所有学生待办都不在你这里 ✓"
          accentClass="text-rush"
        />
        <TodoTrack
          title="📤 等学生家长"
          items={waitStudentParent}
          emptyText="学生家长侧无待办"
          accentClass="text-primary"
        />
        <TodoTrack
          title="⏳ 等主管审核"
          items={waitSupervisor}
          emptyText="无方案在主管手上"
          accentClass="text-accent"
        />
      </div>
      {sleeping.length > 0 ? (
        <div className="border-t border-border-subtle bg-bg/40 px-6 py-4">
          <h3 className="mb-2 text-sm font-semibold text-rush">
            ⚠️ 沉默学生 ({sleeping.length})
          </h3>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {sleeping.map((item) => (
              <TodoCard key={item.key} item={item} dim />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// 三轨各自的列
function TodoTrack({
  title,
  items,
  emptyText,
  accentClass,
}: {
  title: string;
  items: TodoItem[];
  emptyText: string;
  accentClass: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={`text-sm font-semibold ${accentClass}`}>
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">{emptyText}</p>
      ) : (
        items.slice(0, 6).map((item) => <TodoCard key={item.key} item={item} />)
      )}
      {items.length > 6 ? (
        <p className="text-xs text-text-muted">
          还有 {items.length - 6} 项 · 滚动列表见学生页
        </p>
      ) : null}
    </div>
  );
}

// 单条待办卡
function TodoCard({ item, dim }: { item: TodoItem; dim?: boolean }) {
  return (
    <Link
      href={item.primaryAction.href}
      className={`group flex items-center gap-3 rounded-lg border border-border-subtle bg-bg/40 px-3 py-2 no-underline transition hover:border-primary hover:bg-surface ${
        dim ? 'opacity-70' : ''
      }`}
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light text-xs font-semibold text-white">
        {item.initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="truncate text-sm font-medium text-text">{item.name}</span>
          <span className="text-[10px] text-text-muted">{item.label}</span>
        </div>
        <span className="block truncate text-[11px] text-text-muted">{item.detail}</span>
      </div>
      <Button size="small" type="text" className="flex-shrink-0">
        {item.primaryAction.label}
      </Button>
    </Link>
  );
}
