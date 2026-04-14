'use client';

import { useState } from 'react';
import { Table, Input, Select, Button, Tag, Space, Progress, Avatar } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  UserOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import type { ColumnsType } from 'antd/es/table';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  COLLECTING: { label: '待采集', color: 'default' },
  GENERATING: { label: '待生成', color: 'blue' },
  REVIEWING: { label: '待审核', color: 'orange' },
  FINALIZED: { label: '已定版', color: 'green' },
  SUBMITTED: { label: '已填报', color: 'cyan' },
};

interface Student {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  status: string;
  score?: number;
  rank?: number;
  completeness?: number;
  planCount?: number;
  createdAt: string;
}

export default function TeacherStudentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-students', search, statusFilter],
    queryFn: () => studentApi.getList({ search, status: statusFilter }),
  });

  const students: Student[] = data?.data || [];

  const columns: ColumnsType<Student> = [
    {
      title: '学生',
      key: 'name',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Avatar size="small" icon={<UserOutlined />} className="bg-primary flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-text truncate">
              {record.realName || record.username}
            </div>
            {record.phone && (
              <div className="text-xs text-text-muted">{record.phone}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '分数/位次',
      key: 'scoreRank',
      width: 120,
      render: (_, record) => (
        <div className="text-sm">
          {record.score ? (
            <span className="font-medium text-text">{record.score}</span>
          ) : (
            <span className="text-text-faint">未填写</span>
          )}
          {record.rank && (
            <span className="text-text-muted text-xs ml-1">/ {record.rank}位</span>
          )}
        </div>
      ),
    },
    {
      title: '信息完善度',
      key: 'completeness',
      width: 150,
      render: (_, record) => {
        const pct = record.completeness ?? 0;
        return (
          <div className="flex items-center gap-2">
            <Progress
              percent={pct}
              size="small"
              showInfo={false}
              strokeColor={pct >= 80 ? '#276749' : pct >= 50 ? '#b8860b' : '#c53030'}
              className="flex-1"
            />
            <span className="text-xs text-text-muted w-8 text-right">{pct}%</span>
          </div>
        );
      },
    },
    {
      title: '方案数',
      dataIndex: 'planCount',
      key: 'planCount',
      width: 80,
      render: (count: number) => (
        <span className="text-sm text-text-secondary">{count ?? 0}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size="small">
          <Link href={`/teacher/students/${record.id}`}>
            <Button type="text" size="small" icon={<EditOutlined />}>
              详情
            </Button>
          </Link>
          <Link href={`/teacher/plans/generate/${record.id}`}>
            <Button type="text" size="small" icon={<FileTextOutlined />}>
              生成方案
            </Button>
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-xl font-semibold text-text">学生管理</h1>
          <p className="text-sm text-text-muted mt-1">管理您负责的学生信息</p>
        </div>
        <Space>
          <Button icon={<UploadOutlined />}>批量导入</Button>
          <Link href="/teacher/students/create">
            <Button type="primary" icon={<PlusOutlined />}>
              创建学生
            </Button>
          </Link>
        </Space>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="搜索学生姓名或手机号"
          prefix={<SearchOutlined className="text-text-muted" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-[280px]"
          allowClear
        />
        <Select
          placeholder="筛选状态"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          className="sm:w-[160px]"
          options={Object.entries(STATUS_MAP).map(([k, v]) => ({
            value: k,
            label: v.label,
          }))}
        />
      </div>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={students}
        loading={isLoading}
        rowKey="id"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 名学生` }}
        scroll={{ x: 800 }}
        onRow={(record) => ({
          className: 'cursor-pointer',
          onClick: () => router.push(`/teacher/students/${record.id}`),
        })}
      />
    </div>
  );
}
