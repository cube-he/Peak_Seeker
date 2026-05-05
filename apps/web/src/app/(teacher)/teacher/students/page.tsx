'use client';

import { useMemo, useState } from 'react';
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
import { studentApi, type ProfileProgress } from '@/services/student-api';
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
  user?: { realName?: string; phone?: string };
  totalScore?: number;
  provincialRank?: number;
  progress?: ProfileProgress;
  planCount?: number;
  createdAt: string;
}

type ProgressFilter = 'all' | 'self_low' | 'self_mid' | 'teacher_pending' | 'recommendable';

export default function TeacherStudentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-students', search, statusFilter],
    queryFn: () => studentApi.getList({ search, status: statusFilter }),
  });

  const allStudents: Student[] = data?.data?.data ?? data?.data ?? [];

  // 进度筛选在前端做（数据量小，B 范围足够；后续如需要可下沉到后端 query）
  const students = useMemo(() => {
    if (progressFilter === 'all') return allStudents;
    return allStudents.filter((s) => {
      const p = s.progress;
      if (!p) return progressFilter === 'self_low';
      switch (progressFilter) {
        case 'self_low':
          return p.studentSelfCompleteness < 50;
        case 'self_mid':
          return p.studentSelfCompleteness >= 50 && p.studentSelfCompleteness < 80;
        case 'teacher_pending':
          return p.teacherDataCompleteness < 100;
        case 'recommendable':
          return p.isRecommendable;
        default:
          return true;
      }
    });
  }, [allStudents, progressFilter]);

  const renderProgress = (pct: number | undefined) => {
    const v = pct ?? 0;
    const color = v >= 80 ? '#276749' : v >= 50 ? '#b8860b' : '#c53030';
    return (
      <div className="flex items-center gap-2">
        <Progress
          percent={v}
          size="small"
          showInfo={false}
          strokeColor={color}
          className="flex-1"
        />
        <span className="w-8 text-right text-xs text-text-muted">{v}%</span>
      </div>
    );
  };

  const columns: ColumnsType<Student> = [
    {
      title: '学生',
      key: 'name',
      render: (_, record) => {
        const name = record.user?.realName || record.realName || record.username;
        const phone = record.user?.phone || record.phone;
        return (
          <div className="flex items-center gap-2">
            <Avatar
              size="small"
              icon={<UserOutlined />}
              className="flex-shrink-0 bg-primary"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text">{name}</div>
              {phone && (
                <div className="text-xs text-text-muted">{phone}</div>
              )}
            </div>
          </div>
        );
      },
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
          {record.totalScore ? (
            <span className="font-medium text-text">{record.totalScore}</span>
          ) : (
            <span className="text-text-faint">未填写</span>
          )}
          {record.provincialRank && (
            <span className="ml-1 text-xs text-text-muted">
              / {record.provincialRank}位
            </span>
          )}
        </div>
      ),
    },
    {
      title: '自填进度',
      key: 'selfProgress',
      width: 140,
      sorter: (a, b) =>
        (a.progress?.studentSelfCompleteness ?? 0) -
        (b.progress?.studentSelfCompleteness ?? 0),
      render: (_, r) => renderProgress(r.progress?.studentSelfCompleteness),
    },
    {
      title: '录入进度',
      key: 'teacherProgress',
      width: 140,
      sorter: (a, b) =>
        (a.progress?.teacherDataCompleteness ?? 0) -
        (b.progress?.teacherDataCompleteness ?? 0),
      render: (_, r) => renderProgress(r.progress?.teacherDataCompleteness),
    },
    {
      title: '可推荐',
      key: 'recommendable',
      width: 80,
      render: (_, r) =>
        r.progress?.isRecommendable ? (
          <Tag color="success">就绪</Tag>
        ) : (
          <Tag color="default">未达</Tag>
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
        <Select<ProgressFilter>
          value={progressFilter}
          onChange={setProgressFilter}
          className="sm:w-[200px]"
          options={[
            { value: 'all', label: '全部学生' },
            { value: 'self_low', label: '自填 < 50%（催学生）' },
            { value: 'self_mid', label: '自填 50%~80%' },
            { value: 'teacher_pending', label: '录入未完成（自己补）' },
            { value: 'recommendable', label: '可推荐' },
          ]}
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
