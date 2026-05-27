'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar, Button, Empty, Input, Segmented, Select, Space, Spin, Table, Tag, Tooltip } from 'antd';
import {
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { studentApi, type ProfileProgress } from '@/services/student-api';
import PrerequisiteCheckModal from '@/components/plan/PrerequisiteCheckModal';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  COLLECTING: { label: '待采集', color: 'default' },
  GENERATING: { label: '待生成', color: 'cyan' },
  REVIEWING: { label: '待审核', color: 'gold' },
  FINALIZED: { label: '已定稿', color: 'green' },
  SUBMITTED: { label: '已填报', color: 'success' },
};

const PLAN_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审',
  REVIEWING: '审中',
  APPROVED: '已通过',
  PARENT_CONFIRMED: '家长确认',
  REJECTED: '已退回',
  FINALIZED: '已定稿',
  PUBLISHED: '已发布',
  OUTDATED: '已过期',
};

interface Student {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  workflowStatus?: string;
  status: string;
  user?: { realName?: string; phone?: string };
  totalScore?: number;
  provincialRank?: number;
  progress?: ProfileProgress;
  planCount?: number;
  latestPlanStatus?: string | null;
  latestPlanId?: number | null;
  latestPlanVersionNo?: number | null;
  updatedAt?: string;
  createdAt: string;
}

type ProgressFilter = 'all' | 'self_low' | 'self_mid' | 'teacher_pending' | 'recommendable';

function getWorkflowStatus(student: Student): string {
  return student.workflowStatus ?? 'COLLECTING';
}

function getDisplayName(student: Student): string {
  return student.user?.realName || student.realName || student.username;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
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

// 学生当前所属的"任务轨"——与 Dashboard 三轨对齐
type StudentTodoTrack =
  | 'wait-me'
  | 'wait-student-parent'
  | 'wait-supervisor'
  | 'sleeping'
  | 'delivered'
  | 'idle';

function getStudentTodoTrack(student: Student, now: Date): StudentTodoTrack {
  const status = getWorkflowStatus(student);
  const noActionDays = daysSince(student.updatedAt, now);
  const completeness = student.progress?.overallCompleteness ?? 0;

  if (status === 'SUBMITTED') return 'delivered';
  if (noActionDays !== null && noActionDays >= 7 && status !== 'FINALIZED') return 'sleeping';

  if (
    student.latestPlanStatus === 'PENDING_REVIEW' ||
    student.latestPlanStatus === 'REVIEWING'
  ) {
    return 'wait-supervisor';
  }

  if (status === 'COLLECTING' && completeness < 60) return 'wait-me';
  if (status === 'GENERATING') return 'wait-me';
  if (status === 'COLLECTING' && completeness >= 60) return 'wait-student-parent';
  if (status === 'FINALIZED') return 'wait-student-parent';

  return 'idle';
}

const TRACK_LABEL: Record<StudentTodoTrack, string> = {
  'wait-me': '等我动手',
  'wait-student-parent': '等学生家长',
  'wait-supervisor': '等主管审核',
  'sleeping': '沉默',
  'delivered': '已交付',
  'idle': '进行中',
};

const TRACK_TONE: Record<StudentTodoTrack, string> = {
  'wait-me': 'bg-rush text-white',
  'wait-student-parent': 'bg-primary text-white',
  'wait-supervisor': 'bg-accent text-white',
  'sleeping': 'bg-rush text-white',
  'delivered': 'bg-safe text-white',
  'idle': 'bg-text-muted text-white',
};

function SopMiniBar({ student }: { student: Student }) {
  const status = getWorkflowStatus(student);
  const stages: { key: string; done: boolean; active: boolean }[] = [
    { key: '签', done: !!student.createdAt, active: false },
    { key: '采', done: status !== 'COLLECTING', active: status === 'COLLECTING' },
    {
      key: '案',
      done: ['REVIEWING', 'FINALIZED', 'SUBMITTED'].includes(status),
      active: status === 'GENERATING',
    },
    {
      key: '审',
      done: ['FINALIZED', 'SUBMITTED'].includes(status),
      active: status === 'REVIEWING',
    },
    {
      key: '稿',
      done: status === 'SUBMITTED',
      active: status === 'FINALIZED',
    },
    { key: '交', done: status === 'SUBMITTED', active: false },
  ];

  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <span
            aria-label={s.key}
            className={`inline-block h-2 w-2 rounded-full ${
              s.done
                ? 'bg-safe'
                : s.active
                  ? 'bg-accent'
                  : 'border border-text-muted bg-surface'
            }`}
          />
          {i < stages.length - 1 ? (
            <span aria-hidden className="h-px w-2 bg-border-subtle" />
          ) : null}
        </span>
      ))}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// 导出为带 UTF-8 BOM 的 CSV，Excel 直接打开不乱码
function exportStudentsCSV(students: Student[], filename: string) {
  const headers = ['姓名', '手机', '状态', '总分', '位次', '完整度%', '方案数', '最新方案', '最近更新'];
  const rows = students.map((s) => [
    getDisplayName(s),
    s.user?.phone || s.phone || '',
    STATUS_MAP[getWorkflowStatus(s)]?.label || '',
    s.totalScore ?? '',
    s.provincialRank ?? '',
    s.progress?.overallCompleteness ?? '',
    s.planCount ?? 0,
    s.latestPlanStatus
      ? `${s.latestPlanVersionNo ? `v${s.latestPlanVersionNo} ` : ''}${PLAN_STATUS_LABEL[s.latestPlanStatus] ?? s.latestPlanStatus}`
      : '',
    s.updatedAt ? new Date(s.updatedAt).toLocaleString('zh-CN') : '',
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TeacherStudentsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
          <Spin size="large" />
        </div>
      }
    >
      <TeacherStudentsPageInner />
    </Suspense>
  );
}

function StudentCardGrid({ students, now }: { students: Student[]; now: Date }) {
  if (students.length === 0) {
    return (
      <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有学生符合筛选条件" />
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {students.map((s) => (
        <StudentCard key={s.id} student={s} now={now} />
      ))}
    </div>
  );
}

function TaskChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? 'border-primary bg-primary text-white'
          : 'border-border-subtle bg-surface text-text hover:border-primary'
      }`}
    >
      {label} <span className="ml-1 opacity-80">{count}</span>
    </button>
  );
}

function StudentCard({ student, now }: { student: Student; now: Date }) {
  const track = getStudentTodoTrack(student, now);
  const name = getDisplayName(student);
  const completeness = student.progress?.overallCompleteness ?? 0;
  const lastUpdated = student.updatedAt ? new Date(student.updatedAt) : null;
  const lastActionStr = lastUpdated ? formatRelativeTime(lastUpdated, now) : '--';
  const totalScore = student.totalScore ?? null;
  const provincialRank = student.provincialRank ?? null;
  const planCount = student.planCount ?? 0;
  const latestPlanLabel = student.latestPlanStatus
    ? `v${student.latestPlanVersionNo ?? '?'} ${PLAN_STATUS_LABEL[student.latestPlanStatus] ?? student.latestPlanStatus}`
    : '无方案';

  // 沉默或已交付的卡片降低视觉权重，减少干扰
  const dimClass = track === 'sleeping' || track === 'delivered' ? 'opacity-70' : '';

  return (
    <Link
      href={`/teacher/students/${student.id}`}
      className={`block rounded-lg border border-border-subtle bg-surface p-4 no-underline shadow-card transition hover:border-primary hover:shadow-md ${dimClass}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 truncate font-medium text-text">{name}</p>
          <p className="m-0 text-xs text-text-muted">
            {totalScore != null ? `${totalScore} 分` : '--'} ·{' '}
            位次 {provincialRank != null ? provincialRank.toLocaleString('zh-CN') : '--'}
          </p>
        </div>
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TRACK_TONE[track]}`}
        >
          {TRACK_LABEL[track]}
        </span>
      </div>

      <div className="mb-2">
        <SopMiniBar student={student} />
      </div>

      <div className="space-y-0.5 text-xs text-text-muted">
        <p className="m-0">
          资料 {completeness}% · 方案 {planCount} 份 · 最新 {latestPlanLabel}
        </p>
        <p className="m-0">上次动作 {lastActionStr}</p>
      </div>
    </Link>
  );
}

function TeacherStudentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(() => searchParams.get('keyword') ?? '');
  const search = useDebouncedValue(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    () => searchParams.get('workflowStatus') ?? searchParams.get('status') ?? undefined,
  );
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');
  // 顶部快捷 chip 引入的两个独立 flag（其他 chip 复用 statusFilter / progressFilter）
  const [noPlanOnly, setNoPlanOnly] = useState(false);
  const [highScoreOnly, setHighScoreOnly] = useState(false);
  const [trackFilter, setTrackFilter] = useState<StudentTodoTrack | 'all'>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // 客户端启动后再产生 now / updatedAt，避免 SSR 时间不一致 hydration 警告
  const [clock, setClock] = useState<{ now: Date; updatedAt: Date } | null>(null);
  const [generateForStudent, setGenerateForStudent] = useState<Student | null>(null);

  // 视图切换:卡片 / 表格。默认卡片,localStorage 记忆上次选择
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    if (typeof window === 'undefined') return 'card';
    const saved = window.localStorage.getItem('teacher-students-view') as 'card' | 'table' | null;
    return saved ?? 'card';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('teacher-students-view', viewMode);
    }
  }, [viewMode]);

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-students', search],
    queryFn: () => studentApi.getList({ search, pageSize: 200 }),
  });

  useEffect(() => {
    if (data) {
      const stamp = new Date();
      setClock({ now: stamp, updatedAt: stamp });
    }
  }, [data]);

  const allStudents: Student[] = data?.data?.data ?? data?.data ?? [];

  const students = useMemo(() => {
    let list = allStudents;
    const now = clock?.now;
    if (trackFilter !== 'all' && now) {
      list = list.filter((s) => getStudentTodoTrack(s, now) === trackFilter);
    }
    if (statusFilter) {
      list = list.filter((s) => getWorkflowStatus(s) === statusFilter);
    }
    if (progressFilter !== 'all') {
      list = list.filter((student) => {
        const progress = student.progress;
        if (!progress) return progressFilter === 'self_low';
        switch (progressFilter) {
          case 'self_low':
            return progress.studentSelfCompleteness < 50;
          case 'self_mid':
            return progress.studentSelfCompleteness >= 50 && progress.studentSelfCompleteness < 80;
          case 'teacher_pending':
            return progress.teacherDataCompleteness < 100;
          case 'recommendable':
            return progress.isRecommendable;
          default:
            return true;
        }
      });
    }
    if (noPlanOnly) list = list.filter((s) => !s.planCount);
    if (highScoreOnly) list = list.filter((s) => (s.totalScore ?? 0) >= 640);
    return list;
  }, [allStudents, statusFilter, progressFilter, noPlanOnly, highScoreOnly, trackFilter, clock?.now]);

  const counts = useMemo(
    () => ({
      all: allStudents.length,
      attention: allStudents.filter((s) => (s.progress?.studentSelfCompleteness ?? 0) < 50).length,
      noPlan: allStudents.filter((s) => !s.planCount).length,
      reviewing: allStudents.filter((s) => getWorkflowStatus(s) === 'REVIEWING').length,
      highScore: allStudents.filter((s) => (s.totalScore ?? 0) >= 640).length,
    }),
    [allStudents],
  );

  const trackCounts = useMemo(() => {
    const now = clock?.now;
    if (!now) {
      return { 'wait-me': 0, 'wait-student-parent': 0, 'wait-supervisor': 0, sleeping: 0, delivered: 0, idle: 0 };
    }
    const c: Record<StudentTodoTrack, number> = {
      'wait-me': 0,
      'wait-student-parent': 0,
      'wait-supervisor': 0,
      sleeping: 0,
      delivered: 0,
      idle: 0,
    };
    allStudents.forEach((s) => {
      const t = getStudentTodoTrack(s, now);
      c[t] += 1;
    });
    return c;
  }, [allStudents, clock?.now]);

  const noActiveFilter =
    !statusFilter && progressFilter === 'all' && !noPlanOnly && !highScoreOnly;

  const chipActive = {
    all: noActiveFilter,
    attention: progressFilter === 'self_low',
    noPlan: noPlanOnly,
    reviewing: statusFilter === 'REVIEWING',
    highScore: highScoreOnly,
  };

  function clearAllFilters() {
    setStatusFilter(undefined);
    setProgressFilter('all');
    setNoPlanOnly(false);
    setHighScoreOnly(false);
    setTrackFilter('all');
  }

  function clickChip(chip: keyof typeof chipActive) {
    if (chip === 'all') {
      clearAllFilters();
      return;
    }
    if (chip === 'attention') {
      setProgressFilter(chipActive.attention ? 'all' : 'self_low');
    } else if (chip === 'noPlan') {
      setNoPlanOnly(!noPlanOnly);
    } else if (chip === 'reviewing') {
      setStatusFilter(chipActive.reviewing ? undefined : 'REVIEWING');
    } else if (chip === 'highScore') {
      setHighScoreOnly(!highScoreOnly);
    }
  }

  const now = clock?.now ?? new Date();

  const columns: ColumnsType<Student> = [
    {
      title: '学生',
      key: 'name',
      render: (_, record) => {
        const name = getDisplayName(record);
        const phone = record.user?.phone || record.phone;
        return (
          <div className="flex items-center gap-3">
            <Avatar size="small" icon={<UserOutlined />} className="flex-shrink-0 bg-primary">
              {name?.charAt(0)}
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text">{name}</div>
              {phone ? <div className="text-xs text-text-muted">{phone}</div> : null}
            </div>
          </div>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 90,
      render: (_, record) => {
        const ws = getWorkflowStatus(record);
        const state = STATUS_MAP[ws] || { label: ws, color: 'default' };
        return <Tag color={state.color}>{state.label}</Tag>;
      },
    },
    {
      title: '分数/位次',
      key: 'scoreRank',
      width: 130,
      sorter: (a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0),
      render: (_, record) => (
        <div className="text-sm">
          {record.totalScore ? (
            <span className="font-medium text-text">{record.totalScore}</span>
          ) : (
            <span className="text-text-faint">未填写</span>
          )}
          {record.provincialRank ? (
            <div className="text-xs text-text-muted">{formatNumber(record.provincialRank)} 位</div>
          ) : null}
        </div>
      ),
    },
    {
      title: '完整度',
      key: 'completeness',
      width: 140,
      sorter: (a, b) => (a.progress?.overallCompleteness ?? 0) - (b.progress?.overallCompleteness ?? 0),
      render: (_, record) => {
        const self = record.progress?.studentSelfCompleteness ?? 0;
        const teacher = record.progress?.teacherDataCompleteness ?? 0;
        const overall = record.progress?.overallCompleteness ?? 0;
        const isRecommendable = record.progress?.isRecommendable;
        return (
          <Tooltip
            title={
              <div className="text-xs">
                <div>综合：{overall}%</div>
                <div>学生自填：{self}%</div>
                <div>教师录入：{teacher}%</div>
                {isRecommendable ? <div className="mt-1 text-[#52c41a]">✓ 可推荐</div> : null}
              </div>
            }
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                  <div className="h-full bg-primary" style={{ width: `${self}%` }} />
                </div>
                <span className="w-7 text-right text-[10px] text-text-muted">{self}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                  <div className="h-full bg-accent" style={{ width: `${teacher}%` }} />
                </div>
                <span className="w-7 text-right text-[10px] text-text-muted">{teacher}%</span>
              </div>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: '方案',
      key: 'plan',
      width: 110,
      render: (_, record) => {
        const count = record.planCount ?? 0;
        if (count === 0) return <span className="text-xs text-text-faint">未生成</span>;
        const label = record.latestPlanStatus
          ? PLAN_STATUS_LABEL[record.latestPlanStatus] ?? record.latestPlanStatus
          : '';
        const version = record.latestPlanVersionNo ? `v${record.latestPlanVersionNo}` : '';
        const content = (
          <span className="text-sm">
            <strong className="text-text">{version}</strong>
            {version && label ? <span className="text-text-muted"> · {label}</span> : null}
            {count > 1 ? <span className="ml-1 text-[10px] text-text-faint">({count} 份)</span> : null}
          </span>
        );
        if (record.latestPlanId) {
          return (
            <Link
              href={`/teacher/plans/${record.latestPlanId}`}
              onClick={(e) => e.stopPropagation()}
              className="no-underline hover:underline"
            >
              {content}
            </Link>
          );
        }
        return content;
      },
    },
    {
      title: '最近更新',
      key: 'updatedAt',
      width: 100,
      sorter: (a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return aTime - bTime;
      },
      defaultSortOrder: 'descend',
      render: (_, record) => {
        if (!record.updatedAt) return <span className="text-xs text-text-faint">--</span>;
        const days = daysSince(record.updatedAt, now);
        const text = formatRelativeTime(new Date(record.updatedAt), now);
        const isStale = days !== null && days > 7;
        return <span className={`text-xs ${isStale ? 'font-medium text-rush' : 'text-text-muted'}`}>{text}</span>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Space size="small" onClick={(event) => event.stopPropagation()}>
          <Button
            type="text"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => setGenerateForStudent(record)}
          >
            生成方案
          </Button>
        </Space>
      ),
    },
  ];

  const selectedStudents = students.filter((s) => selectedRowKeys.includes(s.id));

  function handleExportSelected() {
    if (!selectedStudents.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    exportStudentsCSV(selectedStudents, `学生清单-${stamp}.csv`);
  }

  return (
    <div className="space-y-5">
      {/* 顶部 header — 精简后 */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text">学生管理</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
            <span>{allStudents.length} 名学生</span>
            <span aria-hidden>·</span>
            <span>{counts.attention} 名需要关注</span>
            <span aria-hidden>·</span>
            <span>{counts.reviewing} 份待审核</span>
            <span aria-hidden>·</span>
            <span>数据更新于 {clock ? formatRelativeTime(clock.updatedAt, clock.now) : '--'}</span>
          </p>
        </div>
        <Space wrap>
          <Tooltip title="批量导入功能待接入">
            <Button icon={<UploadOutlined />} disabled>
              批量导入
            </Button>
          </Tooltip>
          <Link href="/teacher/students/create">
            <Button type="primary" icon={<PlusOutlined />} className="border-0">
              创建学生
            </Button>
          </Link>
        </Space>
      </header>

      {/* 筛选条 */}
      <section className="rounded-2xl bg-surface px-4 py-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Input
            placeholder="按姓名、学号或手机号搜索"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="xl:w-[300px]"
            allowClear
          />
          <Select
            placeholder="筛选状态"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            className="xl:w-[160px]"
            options={Object.entries(STATUS_MAP).map(([value, state]) => ({ value, label: state.label }))}
          />
          <Select<ProgressFilter>
            value={progressFilter}
            onChange={setProgressFilter}
            className="xl:w-[200px]"
            options={[
              { value: 'all', label: '全部完整度' },
              { value: 'self_low', label: '自填 < 50%' },
              { value: 'self_mid', label: '自填 50%~80%' },
              { value: 'teacher_pending', label: '老师录入未完成' },
              { value: 'recommendable', label: '可推荐' },
            ]}
          />
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as 'card' | 'table')}
            options={[
              { label: '卡片', value: 'card' },
              { label: '表格', value: 'table' },
            ]}
          />
          <div className="text-sm text-text-muted xl:ml-auto">
            当前显示 <strong className="text-text">{students.length}</strong> 名
          </div>
        </div>
      </section>

      {/* 任务维度 chip — 与 Dashboard 三轨对齐 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-text-muted">按任务:</span>
        <TaskChip
          label="全部"
          count={allStudents.length}
          active={trackFilter === 'all'}
          onClick={() => setTrackFilter('all')}
        />
        <TaskChip
          label="🔴 等我"
          count={trackCounts['wait-me']}
          active={trackFilter === 'wait-me'}
          onClick={() => setTrackFilter('wait-me')}
        />
        <TaskChip
          label="📤 等学生家长"
          count={trackCounts['wait-student-parent']}
          active={trackFilter === 'wait-student-parent'}
          onClick={() => setTrackFilter('wait-student-parent')}
        />
        <TaskChip
          label="⏳ 等主管"
          count={trackCounts['wait-supervisor']}
          active={trackFilter === 'wait-supervisor'}
          onClick={() => setTrackFilter('wait-supervisor')}
        />
        <TaskChip
          label="⚠️ 沉默"
          count={trackCounts['sleeping']}
          active={trackFilter === 'sleeping'}
          onClick={() => setTrackFilter('sleeping')}
        />
        <TaskChip
          label="✓ 已交付"
          count={trackCounts['delivered']}
          active={trackFilter === 'delivered'}
          onClick={() => setTrackFilter('delivered')}
        />
      </div>

      {/* 快捷筛选 chip — 可点 */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', '全部', counts.all],
            ['attention', '需关注', counts.attention],
            ['noPlan', '未建方案', counts.noPlan],
            ['reviewing', '待审核', counts.reviewing],
            ['highScore', '≥640 分', counts.highScore],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => clickChip(key)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              chipActive[key]
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-surface text-text-secondary hover:border-primary hover:text-primary'
            }`}
          >
            {label} <span className="ml-1 opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {/* 批量操作栏 — 选中后浮现 */}
      {selectedRowKeys.length > 0 ? (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-primary-fixed px-4 py-3 shadow-card">
          <span className="text-sm font-medium text-primary">
            已选 {selectedRowKeys.length} 名学生
          </span>
          <Button size="small" type="primary" onClick={handleExportSelected}>
            导出 CSV
          </Button>
          <Tooltip title="批量催更功能待接入">
            <Button size="small" disabled>
              批量催更
            </Button>
          </Tooltip>
          <Button
            size="small"
            type="text"
            className="ml-auto"
            onClick={() => setSelectedRowKeys([])}
          >
            取消选择
          </Button>
        </div>
      ) : null}

      {viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={students}
          loading={isLoading}
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 名学生`,
          }}
          scroll={{ x: 980 }}
          className="rounded-2xl bg-surface shadow-card"
          onRow={(record) => ({
            className: 'cursor-pointer',
            onClick: () => router.push(`/teacher/students/${record.id}`),
          })}
        />
      ) : (
        <StudentCardGrid students={students} now={clock?.now ?? new Date()} />
      )}

      {generateForStudent ? (
        <PrerequisiteCheckModal
          open={!!generateForStudent}
          student={generateForStudent}
          onCancel={() => setGenerateForStudent(null)}
        />
      ) : null}
    </div>
  );
}
