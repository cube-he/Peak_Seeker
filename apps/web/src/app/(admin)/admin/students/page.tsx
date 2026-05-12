'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Input,
  message,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import {
  CheckOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin-api';

type AssignmentStatus = 'ALL' | 'ASSIGNED' | 'UNASSIGNED';

interface TeacherProfile {
  id: number;
  school?: string | null;
  user?: {
    id: number;
    username: string;
    realName?: string | null;
  } | null;
  _count?: {
    students: number;
  };
}

interface StudentAssignmentRecord {
  id: number;
  teacherId?: number | null;
  highSchool?: string | null;
  city?: string | null;
  createdAt?: string;
  user?: {
    id: number;
    username: string;
    realName?: string | null;
    phone?: string | null;
  } | null;
  teacher?: TeacherProfile | null;
}

interface AssignmentMutationVars {
  studentId: number;
  teacherProfileId: number | null;
}

const assignmentOptions = [
  { label: '全部', value: 'ALL' },
  { label: '未分配', value: 'UNASSIGNED' },
  { label: '已分配', value: 'ASSIGNED' },
];

function getStudentName(record: StudentAssignmentRecord) {
  return record.user?.realName || record.user?.username || `学生 #${record.id}`;
}

function getTeacherLabel(teacher?: TeacherProfile | null) {
  if (!teacher) return '未分配';
  const name = teacher.user?.realName || teacher.user?.username || `老师 #${teacher.id}`;
  return teacher.school ? `${name} · ${teacher.school}` : name;
}

function hasOwnDraft(
  drafts: Record<number, number | null>,
  studentId: number,
) {
  return Object.prototype.hasOwnProperty.call(drafts, studentId);
}

export default function AdminStudentAssignmentPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [assignmentStatus, setAssignmentStatus] = useState<AssignmentStatus>('UNASSIGNED');
  const [teacherProfileId, setTeacherProfileId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [draftAssignments, setDraftAssignments] = useState<Record<number, number | null>>({});

  const { data: studentResponse, isLoading: studentsLoading } = useQuery({
    queryKey: [
      'admin-student-assignments',
      { search, assignmentStatus, teacherProfileId, page, pageSize },
    ],
    queryFn: () =>
      adminApi.getStudents({
        search,
        assignmentStatus,
        teacherProfileId,
        page,
        pageSize,
      }),
  });

  const { data: teacherResponse, isLoading: teachersLoading } = useQuery({
    queryKey: ['admin-teachers'],
    queryFn: () => adminApi.getTeachers(),
  });

  const students: StudentAssignmentRecord[] = studentResponse?.data || [];
  const total = studentResponse?.total || 0;
  const teachers: TeacherProfile[] = Array.isArray(teacherResponse)
    ? teacherResponse
    : teacherResponse?.data || [];

  const teacherOptions = useMemo(
    () =>
      teachers.map((teacher) => ({
        label: getTeacherLabel(teacher),
        value: teacher.id,
      })),
    [teachers],
  );

  const pageStats = useMemo(() => {
    const assigned = students.filter((student) => student.teacherId).length;
    return {
      total: students.length,
      assigned,
      unassigned: students.length - assigned,
    };
  }, [students]);

  const assignmentMutation = useMutation({
    mutationFn: ({ studentId, teacherProfileId: nextTeacherId }: AssignmentMutationVars) =>
      adminApi.assignStudentTeacher(studentId, nextTeacherId),
    onSuccess: (_data, variables) => {
      message.success('学生归属已更新');
      setDraftAssignments((current) => {
        const next = { ...current };
        delete next[variables.studentId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['admin-student-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-teachers'] });
    },
    onError: () => message.error('归属更新失败'),
  });

  const columns: ColumnsType<StudentAssignmentRecord> = [
    {
      title: '学生',
      key: 'student',
      fixed: 'left',
      width: 240,
      render: (_, record) => {
        const name = getStudentName(record);
        return (
          <div className="flex items-center gap-3">
            <Avatar size="small" icon={<UserOutlined />} className="bg-primary">
              {name.charAt(0)}
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text">{name}</div>
              <div className="text-xs text-text-muted">{record.user?.username || '-'}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: '手机号',
      key: 'phone',
      width: 150,
      render: (_, record) => record.user?.phone || '-',
    },
    {
      title: '学校 / 城市',
      key: 'school',
      width: 220,
      render: (_, record) => (
        <div>
          <div className="text-sm text-text">{record.highSchool || '-'}</div>
          <div className="text-xs text-text-muted">{record.city || '-'}</div>
        </div>
      ),
    },
    {
      title: '当前老师',
      key: 'teacher',
      width: 220,
      render: (_, record) =>
        record.teacherId ? (
          <Tag color="blue">{getTeacherLabel(record.teacher)}</Tag>
        ) : (
          <Tag>未分配</Tag>
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (value: string) =>
        value
          ? new Date(value).toLocaleDateString('zh-CN', {
              month: 'short',
              day: 'numeric',
            })
          : '-',
    },
    {
      title: '分配老师',
      key: 'actions',
      width: 320,
      render: (_, record) => {
        const originalTeacherId = record.teacherId ?? null;
        const hasDraft = hasOwnDraft(draftAssignments, record.id);
        const draftTeacherId = hasDraft ? draftAssignments[record.id] : originalTeacherId;
        const changed = hasDraft && draftTeacherId !== originalTeacherId;

        return (
          <Space.Compact className="w-full">
            <Select
              className="min-w-0 flex-1"
              allowClear
              showSearch
              placeholder="选择老师"
              loading={teachersLoading}
              optionFilterProp="label"
              options={teacherOptions}
              value={draftTeacherId ?? undefined}
              onChange={(value) =>
                setDraftAssignments((current) => ({
                  ...current,
                  [record.id]: value ?? null,
                }))
              }
            />
            <Tooltip title={draftTeacherId === null ? '保存为未分配' : '保存归属'}>
              <Button
                type={changed ? 'primary' : 'default'}
                icon={<CheckOutlined />}
                disabled={!changed}
                loading={assignmentMutation.isPending}
                onClick={() =>
                  assignmentMutation.mutate({
                    studentId: record.id,
                    teacherProfileId: draftTeacherId,
                  })
                }
              >
                保存
              </Button>
            </Tooltip>
          </Space.Compact>
        );
      },
    },
  ];

  const handlePaginationChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1);
    setPageSize(pagination.pageSize || 20);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            Student Ownership
          </p>
          <h1 className="font-serif text-3xl font-semibold text-text">学生归属</h1>
          <p className="mt-2 text-sm text-text-muted">
            处理自注册学生、已有学生与老师账号之间的服务关系。
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['当前列表', pageStats.total],
          ['已分配', pageStats.assigned],
          ['未分配', pageStats.unassigned],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl bg-surface px-5 py-4 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
              {label}
            </p>
            <p className="mt-2 font-serif text-2xl font-semibold text-text">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl bg-surface px-4 py-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Segmented
            options={assignmentOptions}
            value={assignmentStatus}
            onChange={(value) => {
              const nextStatus = value as AssignmentStatus;
              setAssignmentStatus(nextStatus);
              setPage(1);
              if (nextStatus === 'UNASSIGNED') {
                setTeacherProfileId(undefined);
              }
            }}
          />
          <Select
            className="xl:w-[260px]"
            allowClear
            showSearch
            disabled={assignmentStatus === 'UNASSIGNED'}
            loading={teachersLoading}
            placeholder="按老师筛选"
            optionFilterProp="label"
            options={teacherOptions}
            value={teacherProfileId}
            onChange={(value) => {
              setTeacherProfileId(value);
              setAssignmentStatus(value ? 'ASSIGNED' : 'ALL');
              setPage(1);
            }}
          />
          <Input
            placeholder="搜索学生姓名、账号"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="xl:ml-auto xl:w-[320px]"
            allowClear
          />
        </div>
      </section>

      <Table
        columns={columns}
        dataSource={students}
        loading={studentsLoading}
        rowKey="id"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 名学生`,
        }}
        onChange={handlePaginationChange}
        scroll={{ x: 1120 }}
        className="rounded-2xl bg-surface shadow-card"
      />

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-sm text-text-muted">
        <TeamOutlined className="mt-0.5 text-primary" />
        <span>
          学生自己注册后会先进入未分配状态；分配给老师后，该学生才会出现在对应老师的学生列表里。
        </span>
      </div>
    </div>
  );
}
