'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar, Button, Input, Progress, Select, Space, Spin, Table, Tag } from 'antd';
import {
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { studentApi, type ProfileProgress } from '@/services/student-api';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  COLLECTING: { label: '待采集', color: 'default' },
  GENERATING: { label: '待生成', color: 'blue' },
  REVIEWING: { label: '待审核', color: 'orange' },
  FINALIZED: { label: '已定稿', color: 'green' },
  SUBMITTED: { label: '已填报', color: 'cyan' },
};

interface Student {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  // 后端派生的工作流状态：COLLECTING/GENERATING/REVIEWING/FINALIZED/SUBMITTED
  workflowStatus?: string;
  // 原始 StudentStatus (ACTIVE/GRADUATED/...)，业务上不直接用
  status: string;
  user?: { realName?: string; phone?: string };
  totalScore?: number;
  provincialRank?: number;
  progress?: ProfileProgress;
  planCount?: number;
  latestPlanStatus?: string | null;
  latestPlanId?: number | null;
  createdAt: string;
}

function getWorkflowStatus(student: Student): string {
  return student.workflowStatus ?? 'COLLECTING';
}

type ProgressFilter = 'all' | 'self_low' | 'self_mid' | 'teacher_pending' | 'recommendable';

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
}

export default function TeacherStudentsPage() {
  // useSearchParams 要求外层包 Suspense，否则 Next 14 build 会 prerender 失败
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

function TeacherStudentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Dashboard 跳转过来时会带 ?workflowStatus=... 或 ?keyword=... 作为初始 filter
  // 也兼容老链接 ?status=...
  const [search, setSearch] = useState(() => searchParams.get('keyword') ?? '');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    () => searchParams.get('workflowStatus') ?? searchParams.get('status') ?? undefined,
  );
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');

  // status 不再发给后端（后端的 status 字段是 ACTIVE/GRADUATED，与教师工作流无关）
  // workflowStatus 在前端按派生字段本地过滤
  const { data, isLoading } = useQuery({
    queryKey: ['teacher-students', search],
    queryFn: () => studentApi.getList({ search, pageSize: 200 }),
  });

  const allStudents: Student[] = data?.data?.data ?? data?.data ?? [];

  const students = useMemo(() => {
    let list = allStudents;
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
    return list;
  }, [allStudents, statusFilter, progressFilter]);

  const counts = useMemo(
    () => ({
      all: allStudents.length,
      attention: allStudents.filter((student) => (student.progress?.studentSelfCompleteness ?? 0) < 60).length,
      noPlan: allStudents.filter((student) => !student.planCount).length,
      reviewing: allStudents.filter((student) => getWorkflowStatus(student) === 'REVIEWING').length,
      highScore: allStudents.filter((student) => (student.totalScore ?? 0) >= 640).length,
    }),
    [allStudents],
  );

  const renderProgress = (percent: number | undefined) => {
    const value = percent ?? 0;
    const color = value >= 80 ? '#276749' : value >= 50 ? '#b8860b' : '#c53030';
    return (
      <div className="flex items-center gap-2">
        <Progress percent={value} size="small" showInfo={false} strokeColor={color} className="flex-1" />
        <span className="w-8 text-right text-xs text-text-muted">{value}%</span>
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
      width: 100,
      render: (_, record) => {
        const ws = getWorkflowStatus(record);
        const state = STATUS_MAP[ws] || { label: ws, color: 'default' };
        return <Tag color={state.color}>{state.label}</Tag>;
      },
    },
    {
      title: '分数/位次',
      key: 'scoreRank',
      width: 140,
      render: (_, record) => (
        <div className="text-sm">
          {record.totalScore ? (
            <span className="font-medium text-text">{record.totalScore}</span>
          ) : (
            <span className="text-text-faint">未填写</span>
          )}
          {record.provincialRank ? (
            <span className="ml-1 text-xs text-text-muted">/ {formatNumber(record.provincialRank)} 位</span>
          ) : null}
        </div>
      ),
    },
    {
      title: '自填进度',
      key: 'selfProgress',
      width: 150,
      sorter: (a, b) => (a.progress?.studentSelfCompleteness ?? 0) - (b.progress?.studentSelfCompleteness ?? 0),
      render: (_, record) => renderProgress(record.progress?.studentSelfCompleteness),
    },
    {
      title: '录入进度',
      key: 'teacherProgress',
      width: 150,
      sorter: (a, b) => (a.progress?.teacherDataCompleteness ?? 0) - (b.progress?.teacherDataCompleteness ?? 0),
      render: (_, record) => renderProgress(record.progress?.teacherDataCompleteness),
    },
    {
      title: '可推荐',
      key: 'recommendable',
      width: 90,
      render: (_, record) =>
        record.progress?.isRecommendable ? <Tag color="success">就绪</Tag> : <Tag color="default">未达</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size="small" onClick={(event) => event.stopPropagation()}>
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
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">Class Roster</p>
          <h1 className="font-serif text-3xl font-semibold text-text">学生管理</h1>
          <p className="mt-2 text-sm text-text-muted">
            {allStudents.length} 名学生 · {counts.attention} 名需要关注 · {counts.reviewing} 份待审核
          </p>
        </div>
        <Space wrap>
          <Button icon={<UploadOutlined />}>批量导入</Button>
          <Link href="/teacher/students/create">
            <Button type="primary" icon={<PlusOutlined />} className="border-0">
              创建学生
            </Button>
          </Link>
        </Space>
      </header>

      <section className="rounded-2xl bg-surface px-4 py-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Input
            placeholder="按姓名、学号或手机号搜索"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
            className="xl:w-[220px]"
            options={[
              { value: 'all', label: '全部学生' },
              { value: 'self_low', label: '自填 < 50%' },
              { value: 'self_mid', label: '自填 50%~80%' },
              { value: 'teacher_pending', label: '老师录入未完成' },
              { value: 'recommendable', label: '可推荐' },
            ]}
          />
          <div className="text-sm text-text-muted xl:ml-auto">
            当前显示 <strong className="text-text">{students.length}</strong> 名
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          ['全部', counts.all, progressFilter === 'all'],
          ['需关注', counts.attention, false],
          ['未建方案', counts.noPlan, false],
          ['待审核', counts.reviewing, statusFilter === 'REVIEWING'],
          ['≥640 分', counts.highScore, false],
        ].map(([label, count, active]) => (
          <span
            key={label as string}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              active ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text-secondary'
            }`}
          >
            {label} <span className="ml-1 opacity-70">{count}</span>
          </span>
        ))}
        <span className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-muted">
          自定义筛选待接入
        </span>
      </div>

      <Table
        columns={columns}
        dataSource={students}
        loading={isLoading}
        rowKey="id"
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 名学生`,
        }}
        scroll={{ x: 900 }}
        className="rounded-2xl bg-surface shadow-card"
        onRow={(record) => ({
          className: 'cursor-pointer',
          onClick: () => router.push(`/teacher/students/${record.id}`),
        })}
      />
    </div>
  );
}
