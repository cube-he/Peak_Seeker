'use client';

import { useState } from 'react';
import { Card, Tag, Button, Avatar, Empty, Spin } from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import StatCard from '@/components/ui/StatCard';

// Kanban column definitions with status mapping
const KANBAN_COLUMNS = [
  { key: 'COLLECTING', label: '待采集', color: 'text-text-muted', bgColor: 'bg-surface-dim' },
  { key: 'GENERATING', label: '待生成', color: 'text-stable', bgColor: 'bg-stable-fixed' },
  { key: 'REVIEWING', label: '待审核', color: 'text-accent', bgColor: 'bg-accent-fixed' },
  { key: 'FINALIZED', label: '已定版', color: 'text-safe', bgColor: 'bg-safe-fixed' },
  { key: 'SUBMITTED', label: '已填报', color: 'text-primary', bgColor: 'bg-primary-fixed' },
] as const;

interface StudentCard {
  id: number;
  realName: string;
  username: string;
  status: string;
  score?: number;
  rank?: number;
  completeness?: number;
  planCount?: number;
}

export default function TeacherDashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ['teacher-students', refreshKey],
    queryFn: () => studentApi.getList(),
  });

  const students: StudentCard[] = studentsData?.data || [];

  // Group students by status for kanban
  const groupedStudents = KANBAN_COLUMNS.reduce((acc, col) => {
    acc[col.key] = students.filter((s) => s.status === col.key);
    return acc;
  }, {} as Record<string, StudentCard[]>);

  // Summary stats
  const totalStudents = students.length;
  const collectingCount = groupedStudents['COLLECTING']?.length || 0;
  const reviewingCount = groupedStudents['REVIEWING']?.length || 0;
  const finalizedCount = groupedStudents['FINALIZED']?.length || 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-text">教师看板</h1>
          <p className="text-sm text-text-muted mt-1">学生进度一览</p>
        </div>
        <div className="flex gap-2">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            刷新
          </Button>
          <Link href="/teacher/students/create">
            <Button type="primary" icon={<PlusOutlined />}>
              新建学生
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="学生总数" value={totalStudents} accentColor="primary" />
        <StatCard label="待采集" value={collectingCount} accentColor="accent" />
        <StatCard label="待审核" value={reviewingCount} accentColor="rush" />
        <StatCard label="已定版" value={finalizedCount} accentColor="safe" />
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spin size="large" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((col) => {
            const items = groupedStudents[col.key] || [];
            return (
              <div key={col.key} className="flex-shrink-0 w-[260px]">
                {/* Column Header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className={`w-2 h-2 rounded-full ${col.bgColor}`} />
                  <span className={`text-sm font-medium ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-text-faint ml-auto">
                    {items.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className={`${col.bgColor} rounded-xl p-2 min-h-[200px] space-y-2`}>
                  {items.length === 0 ? (
                    <div className="text-center py-8">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span className="text-xs text-text-faint">暂无学生</span>}
                      />
                    </div>
                  ) : (
                    items.map((student) => (
                      <Link
                        key={student.id}
                        href={`/teacher/students/${student.id}`}
                        className="no-underline"
                      >
                        <Card
                          size="small"
                          className="cursor-pointer hover:shadow-card-hover transition-shadow"
                          bodyStyle={{ padding: '12px' }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Avatar size="small" icon={<UserOutlined />} className="bg-primary" />
                            <span className="text-sm font-medium text-text truncate">
                              {student.realName || student.username}
                            </span>
                          </div>
                          {student.score && (
                            <div className="flex items-center gap-2 text-xs text-text-muted">
                              <span>分数: {student.score}</span>
                              {student.rank && <span>位次: {student.rank}</span>}
                            </div>
                          )}
                          {student.completeness !== undefined && (
                            <div className="mt-2">
                              <div className="h-1 bg-border rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${student.completeness}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-text-faint mt-0.5">
                                信息完成 {student.completeness}%
                              </span>
                            </div>
                          )}
                          {student.planCount !== undefined && student.planCount > 0 && (
                            <Tag color="blue" className="mt-1 text-[10px]">
                              {student.planCount} 个方案
                            </Tag>
                          )}
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
