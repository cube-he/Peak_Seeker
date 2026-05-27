'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Input, Modal, Segmented, Select, Space, Spin, Table, Tag, message } from 'antd';
import {
  AppstoreOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';

const BATCH_OPTIONS = [
  { label: '本科提前批', value: 'EARLY' },
  { label: '本科一批', value: 'BATCH_1' },
  { label: '本科二批', value: 'BATCH_2' },
  { label: '专科批', value: 'JUNIOR_COLLEGE' },
];

const STATUS_OPTIONS = [
  { label: '草稿', value: 'DRAFT' },
  { label: '待审核', value: 'PENDING_REVIEW' },
  { label: '已通过', value: 'APPROVED' },
  { label: '已定稿', value: 'FINALIZED' },
  { label: '已退回', value: 'REJECTED' },
  { label: '已归档', value: 'ARCHIVED' },
];

interface Plan {
  id: number;
  studentName: string;
  studentId: number;
  batch: string;
  examSource: string;
  status: string;
  version: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

function getBatchLabel(batch: string) {
  return BATCH_OPTIONS.find((option) => option.value === batch)?.label || batch;
}

function formatDate(value?: string) {
  if (!value) return '--';
  return new Date(value).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

// 方案当前所属的"任务轨"——与 Dashboard 三轨对齐
type PlanTrack =
  | 'wait-teacher'
  | 'wait-parent'
  | 'wait-supervisor'
  | 'delivered';

function getPlanTrack(plan: Plan): PlanTrack {
  const status = plan.status;
  if (status === 'PENDING_REVIEW' || status === 'REVIEWING') return 'wait-supervisor';
  if (status === 'APPROVED' || status === 'PARENT_CONFIRMED') return 'wait-parent';
  if (status === 'FINALIZED' || status === 'PUBLISHED' || status === 'OUTDATED') return 'delivered';
  return 'wait-teacher';
}

const TRACK_META: Record<
  PlanTrack,
  { label: string; emoji: string; toneClass: string; emptyText: string }
> = {
  'wait-teacher': {
    label: '等老师动手',
    emoji: '🔴',
    toneClass: 'text-rush',
    emptyText: '老师侧无待办',
  },
  'wait-parent': {
    label: '等学生家长',
    emoji: '📤',
    toneClass: 'text-primary',
    emptyText: '家长侧无待办',
  },
  'wait-supervisor': {
    label: '等主管审核',
    emoji: '⏳',
    toneClass: 'text-accent',
    emptyText: '主管侧无待审',
  },
  'delivered': {
    label: '终稿/已提交',
    emoji: '✓',
    toneClass: 'text-safe',
    emptyText: '尚无已交付方案',
  },
};

export default function TeacherPlansPage() {
  // useSearchParams 要求外层包 Suspense，否则 Next 14 build 会 prerender 失败
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
          <Spin size="large" />
        </div>
      }
    >
      <TeacherPlansPageInner />
    </Suspense>
  );
}

function TeacherPlansPageInner() {
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'kanban';
    const saved = window.localStorage.getItem('teacher-plans-view') as
      | 'table'
      | 'kanban'
      | null;
    return saved ?? 'kanban';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('teacher-plans-view', viewMode);
    }
  }, [viewMode]);
  // Dashboard 跳转过来时会带 ?status=PENDING_REVIEW 或 ?batch=xxx 作为初始 filter
  const [search, setSearch] = useState(() => searchParams.get('keyword') ?? '');
  const [batchFilter, setBatchFilter] = useState<string | undefined>(
    () => searchParams.get('batch') ?? undefined,
  );
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    () => searchParams.get('status') ?? undefined,
  );
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-plans', search, batchFilter, statusFilter],
    queryFn: () => planApi.getTeacherPlans({ search, batch: batchFilter, status: statusFilter }),
  });

  const plans: Plan[] = data?.data || [];

  const counts = useMemo(
    () => ({
      all: plans.length,
      pending: plans.filter((plan) => plan.status === 'PENDING_REVIEW').length,
      approved: plans.filter((plan) => plan.status === 'APPROVED').length,
      finalized: plans.filter((plan) => plan.status === 'FINALIZED').length,
      rejected: plans.filter((plan) => plan.status === 'REJECTED').length,
    }),
    [plans],
  );

  const trackCounts = useMemo(() => {
    const c: Record<PlanTrack, number> = {
      'wait-teacher': 0,
      'wait-parent': 0,
      'wait-supervisor': 0,
      'delivered': 0,
    };
    plans.forEach((p) => {
      c[getPlanTrack(p)] += 1;
    });
    return c;
  }, [plans]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => planApi.deletePlan(id),
    onSuccess: () => {
      void message.success('方案已删除');
      void queryClient.invalidateQueries({ queryKey: ['teacher-plans'] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '删除失败'),
  });

  const confirmDeletePlan = (plan: Plan) => {
    Modal.confirm({
      title: '删除草稿方案',
      content: `确认删除 ${plan.studentName} 的 ${getBatchLabel(plan.batch)} v${plan.version} 草稿方案？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMutation.mutateAsync(plan.id),
    });
  };

  const columns: ColumnsType<Plan> = [
    {
      title: '学生',
      dataIndex: 'studentName',
      key: 'studentName',
      render: (name: string, record) => (
        <Link href={`/teacher/students/${record.studentId}`} className="text-primary no-underline hover:underline">
          {name}
        </Link>
      ),
    },
    {
      title: '批次',
      dataIndex: 'batch',
      key: 'batch',
      width: 130,
      render: (batch: string) => <span className="text-sm">{getBatchLabel(batch)}</span>,
    },
    {
      title: '来源',
      dataIndex: 'examSource',
      key: 'examSource',
      width: 120,
      render: (source: string) =>
        source === 'GAOKAO' ? <Tag color="green">高考正式</Tag> : <Tag color="default">模拟预案</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => <PlanStatusBadge status={status} />,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (version: number) => <span className="text-xs text-text-muted">v{version}</span>,
    },
    {
      title: '志愿数',
      dataIndex: 'itemCount',
      key: 'itemCount',
      width: 90,
      render: (count: number) => <span className="text-sm">{count}</span>,
    },
    {
      title: '更新',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 110,
      render: (updatedAt: string) => <span className="text-xs text-text-muted">{formatDate(updatedAt)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_, record) => (
        <Space size={4}>
          <Link href={`/teacher/plans/${record.id}`}>
            <Button type="text" size="small" icon={<EyeOutlined />}>
              查看
            </Button>
          </Link>
          {record.status === 'DRAFT' ? (
            <Button
              danger
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              loading={deleteMutation.isPending && deleteMutation.variables === record.id}
              onClick={() => confirmDeletePlan(record)}
            >
              删除
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">Plan Review</p>
          <h1 className="font-serif text-3xl font-semibold text-text">方案管理</h1>
          <p className="mt-2 text-sm text-text-muted">
            {counts.all} 份方案 · {counts.pending} 份待审核 · {counts.finalized} 份已定稿
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} className="w-fit border-0" title="批量生成待接入">
          批量生成
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {(['wait-teacher', 'wait-parent', 'wait-supervisor', 'delivered'] as PlanTrack[]).map(
          (track) => {
            const meta = TRACK_META[track];
            return (
              <div
                key={track}
                className="rounded-2xl border-l-[3px] border-l-primary bg-surface px-4 py-3 shadow-card"
              >
                <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
                  {meta.emoji} {meta.label}
                </p>
                <p className="mt-1 font-serif text-2xl font-semibold text-text">
                  {trackCounts[track]}
                </p>
              </div>
            );
          },
        )}
      </div>

      <section className="rounded-2xl bg-surface px-4 py-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Input
            placeholder="搜索学生姓名"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="xl:w-[260px]"
            allowClear
          />
          <Select
            placeholder="批次"
            value={batchFilter}
            onChange={setBatchFilter}
            allowClear
            className="xl:w-[150px]"
            options={BATCH_OPTIONS}
          />
          <Select
            placeholder="状态"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            className="xl:w-[140px]"
            options={STATUS_OPTIONS}
          />
          <div className="xl:ml-auto">
            <Segmented
              options={[
                { label: '看板', value: 'kanban', icon: <AppstoreOutlined /> },
                { label: '表格', value: 'table', icon: <UnorderedListOutlined /> },
              ]}
              value={viewMode}
              onChange={(value) => setViewMode(value as 'table' | 'kanban')}
            />
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
          <Spin size="large" />
        </div>
      ) : viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={plans}
          rowKey="id"
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 个方案` }}
          scroll={{ x: 900 }}
          className="rounded-2xl bg-surface shadow-card"
        />
      ) : (
        <KanbanBoard
          plans={plans}
          onDelete={confirmDeletePlan}
          deletePendingId={
            deleteMutation.isPending ? (deleteMutation.variables as number | undefined) : undefined
          }
        />
      )}

      <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-4 text-sm text-text-muted">
        批量审核、导出全量报告需要后端补充批处理接口；当前已保留单方案查看与筛选能力。
      </div>
    </div>
  );
}

function KanbanBoard({
  plans,
  onDelete,
  deletePendingId,
}: {
  plans: Plan[];
  onDelete: (plan: Plan) => void;
  deletePendingId: number | undefined;
}) {
  const grouped: Record<PlanTrack, Plan[]> = {
    'wait-teacher': [],
    'wait-parent': [],
    'wait-supervisor': [],
    'delivered': [],
  };
  plans.forEach((p) => {
    grouped[getPlanTrack(p)].push(p);
  });

  (Object.keys(grouped) as PlanTrack[]).forEach((track) => {
    grouped[track].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  });

  const tracks: PlanTrack[] = ['wait-teacher', 'wait-parent', 'wait-supervisor', 'delivered'];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tracks.map((track) => {
        const meta = TRACK_META[track];
        const items = grouped[track];
        return (
          <div key={track} className="rounded-2xl bg-surface p-3 shadow-card">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className={`m-0 text-sm font-semibold ${meta.toneClass}`}>
                {meta.emoji} {meta.label}
              </h3>
              <span className="text-xs text-text-muted">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="m-0 px-2 py-4 text-xs text-text-muted">{meta.emptyText}</p>
              ) : (
                items.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onDelete={onDelete}
                    deletePending={deletePendingId === plan.id}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanCard({
  plan,
  onDelete,
  deletePending,
}: {
  plan: Plan;
  onDelete: (plan: Plan) => void;
  deletePending: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg/30 p-3 transition hover:border-primary hover:bg-surface">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <Link
          href={`/teacher/plans/${plan.id}`}
          className="truncate text-sm font-medium text-text no-underline hover:text-primary"
        >
          {plan.studentName}
        </Link>
        <span className="flex-shrink-0 text-[10px] text-text-muted">v{plan.version}</span>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <PlanStatusBadge status={plan.status} />
        <span className="text-[10px] text-text-muted">{getBatchLabel(plan.batch)}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span>志愿 {plan.itemCount} 条</span>
        <span>{formatDate(plan.updatedAt)}</span>
      </div>
      {plan.status === 'DRAFT' ? (
        <div className="mt-2 flex justify-end">
          <Button
            danger
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            loading={deletePending}
            onClick={() => onDelete(plan)}
          >
            删除草稿
          </Button>
        </div>
      ) : null}
    </div>
  );
}
