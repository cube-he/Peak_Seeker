'use client';

import { useState } from 'react';
import { Table, Input, Select, Button, Tag, Card, Segmented, Empty, Spin } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';
import type { ColumnsType } from 'antd/es/table';

const BATCH_OPTIONS = [
  { label: '本科提前批', value: 'EARLY' },
  { label: '本科一批', value: 'BATCH_1' },
  { label: '本科二批', value: 'BATCH_2' },
  { label: '专科批', value: 'JUNIOR_COLLEGE' },
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

export default function TeacherPlansPage() {
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-plans', search, batchFilter, statusFilter],
    queryFn: () =>
      planApi.getTeacherPlans({ search, batch: batchFilter, status: statusFilter }),
  });

  const plans: Plan[] = data?.data || [];

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
      width: 120,
      render: (batch: string) => {
        const found = BATCH_OPTIONS.find((b) => b.value === batch);
        return <span className="text-sm">{found?.label || batch}</span>;
      },
    },
    {
      title: '来源',
      dataIndex: 'examSource',
      key: 'examSource',
      width: 100,
      render: (source: string) =>
        source === 'GAOKAO' ? (
          <Tag color="green">高考正式</Tag>
        ) : (
          <Tag color="default">二诊预案</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <PlanStatusBadge status={status} />,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 60,
      render: (v: number) => <span className="text-xs text-text-muted">v{v}</span>,
    },
    {
      title: '志愿数',
      dataIndex: 'itemCount',
      key: 'itemCount',
      width: 80,
      render: (count: number) => <span className="text-sm">{count}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Link href={`/teacher/plans/${record.id}`}>
          <Button type="text" size="small" icon={<EyeOutlined />}>
            查看
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-xl font-semibold text-text">方案管理</h1>
          <p className="text-sm text-text-muted mt-1">查看和管理所有学生的志愿方案</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />}>
          批量生成
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Input
          placeholder="搜索学生姓名"
          prefix={<SearchOutlined className="text-text-muted" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-[240px]"
          allowClear
        />
        <Select
          placeholder="批次"
          value={batchFilter}
          onChange={setBatchFilter}
          allowClear
          className="sm:w-[140px]"
          options={BATCH_OPTIONS}
        />
        <Select
          placeholder="状态"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          className="sm:w-[120px]"
          options={[
            { label: '草稿', value: 'DRAFT' },
            { label: '待审核', value: 'PENDING_REVIEW' },
            { label: '已通过', value: 'APPROVED' },
            { label: '已定版', value: 'FINALIZED' },
          ]}
        />
        <div className="ml-auto">
          <Segmented
            options={[
              { value: 'table', icon: <UnorderedListOutlined /> },
              { value: 'card', icon: <AppstoreOutlined /> },
            ]}
            value={viewMode}
            onChange={(v) => setViewMode(v as 'table' | 'card')}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spin size="large" />
        </div>
      ) : viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={plans}
          rowKey="id"
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个方案` }}
          scroll={{ x: 800 }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.length === 0 ? (
            <div className="col-span-full py-16">
              <Empty description="暂无方案" />
            </div>
          ) : (
            plans.map((plan) => (
              <Link key={plan.id} href={`/teacher/plans/${plan.id}`} className="no-underline">
                <Card
                  hoverable
                  size="small"
                  className="h-full"
                  bodyStyle={{ padding: '16px' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-text">{plan.studentName}</span>
                    <PlanStatusBadge status={plan.status} />
                  </div>
                  <div className="text-xs text-text-muted space-y-1">
                    <div>批次: {BATCH_OPTIONS.find((b) => b.value === plan.batch)?.label || plan.batch}</div>
                    <div className="flex items-center gap-2">
                      <span>志愿数: {plan.itemCount}</span>
                      <span>v{plan.version}</span>
                    </div>
                    {plan.examSource === 'GAOKAO' ? (
                      <Tag color="green" className="text-[10px] mt-1">高考正式</Tag>
                    ) : (
                      <Tag color="default" className="text-[10px] mt-1">二诊预案</Tag>
                    )}
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
