'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Empty, Input, Modal, Segmented, Select, Space, Spin, Table, Tag, message } from 'antd';
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

export default function TeacherPlansPage() {
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
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

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {[
          ['全部', counts.all, 'border-l-primary'],
          ['待审核', counts.pending, 'border-l-rush'],
          ['已通过', counts.approved, 'border-l-accent'],
          ['已定稿', counts.finalized, 'border-l-safe'],
          ['已退回', counts.rejected, 'border-l-border'],
        ].map(([label, count, tone]) => (
          <div key={label as string} className={`rounded-2xl border-l-[3px] ${tone} bg-surface px-4 py-3 shadow-card`}>
            <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">{label}</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-text">{count}</p>
          </div>
        ))}
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
                { value: 'table', icon: <UnorderedListOutlined /> },
                { value: 'card', icon: <AppstoreOutlined /> },
              ]}
              value={viewMode}
              onChange={(value) => setViewMode(value as 'table' | 'card')}
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.length === 0 ? (
            <div className="col-span-full rounded-2xl bg-surface py-16 shadow-card">
              <Empty description="暂无方案" />
            </div>
          ) : (
            plans.map((plan) => (
              <Card
                key={plan.id}
                hoverable
                size="small"
                className="h-full border-l-[3px] border-l-accent"
                bodyStyle={{ padding: '16px' }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">{plan.studentName}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {getBatchLabel(plan.batch)} · v{plan.version}
                    </p>
                  </div>
                  <PlanStatusBadge status={plan.status} />
                </div>
                <div className="grid grid-cols-3 rounded-xl bg-bg py-3 text-center">
                  <div className="border-r border-border-subtle px-2">
                    <p className="text-[10px] uppercase tracking-[1.2px] text-text-muted">志愿</p>
                    <p className="font-serif text-lg font-semibold text-text">{plan.itemCount}</p>
                  </div>
                  <div className="border-r border-border-subtle px-2">
                    <p className="text-[10px] uppercase tracking-[1.2px] text-text-muted">来源</p>
                    <p className="text-xs text-text-secondary">{plan.examSource === 'GAOKAO' ? '高考' : '模拟'}</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[10px] uppercase tracking-[1.2px] text-text-muted">更新</p>
                    <p className="text-xs text-text-secondary">{formatDate(plan.updatedAt)}</p>
                  </div>
                </div>
                <Space className="mt-4" size={8}>
                  <Link href={`/teacher/plans/${plan.id}`}>
                    <Button size="small" icon={<EyeOutlined />}>
                      查看
                    </Button>
                  </Link>
                  {plan.status === 'DRAFT' ? (
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      loading={deleteMutation.isPending && deleteMutation.variables === plan.id}
                      onClick={() => confirmDeletePlan(plan)}
                    >
                      删除草稿
                    </Button>
                  ) : null}
                </Space>
              </Card>
            ))
          )}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-4 text-sm text-text-muted">
        批量审核、导出全量报告需要后端补充批处理接口；当前已保留单方案查看与筛选能力。
      </div>
    </div>
  );
}
