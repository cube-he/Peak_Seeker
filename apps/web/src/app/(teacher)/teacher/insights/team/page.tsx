'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Segmented, Spin, Table } from 'antd';
import { consultationApi } from '@/services/consultation-api';

export default function TeamInsightsPage() {
  const [range, setRange] = useState<'week' | 'month'>('month');
  const { data, isLoading, error } = useQuery({
    queryKey: ['insights-team', range],
    queryFn: () => consultationApi.getTeamInsights(range),
    retry: false,
  });

  if (isLoading) return <div className="py-20 text-center"><Spin /></div>;

  if (error) {
    return (
      <div className="p-6">
        <Alert
          type="error"
          message="无权访问"
          description={(error as any)?.response?.data?.message ?? '需要主管权限'}
        />
      </div>
    );
  }

  if (!data) return null;

  const hours = Math.floor(data.totalMinutes / 60);
  const mins = data.totalMinutes % 60;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="m-0 text-xl font-semibold">团队沟通报表</h1>
        <Segmented
          value={range}
          onChange={(v) => setRange(v as 'week' | 'month')}
          options={[
            { label: '最近 7 天', value: 'week' },
            { label: '最近 30 天', value: 'month' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <p className="m-0 text-xs text-text-muted">活跃老师</p>
          <p className="m-0 text-3xl font-semibold">{data.totalTeachers}</p>
        </Card>
        <Card>
          <p className="m-0 text-xs text-text-muted">沟通总次数</p>
          <p className="m-0 text-3xl font-semibold">{data.totalCount}</p>
        </Card>
        <Card>
          <p className="m-0 text-xs text-text-muted">累计时长</p>
          <p className="m-0 text-3xl font-semibold">{hours}<span className="text-base">h</span>{mins}<span className="text-base">m</span></p>
        </Card>
      </div>

      {data.alerts.lowProductivity.length > 0 ? (
        <Alert
          type="warning"
          message={`${data.alerts.lowProductivity.length} 位老师沟通时长低于 ${data.alerts.threshold} 分钟阈值`}
          description={data.alerts.lowProductivity
            .map((t) => `${t.name}(${t.minutes} 分)`)
            .join(' · ')}
        />
      ) : null}

      <Card title="老师工时榜">
        <Table
          rowKey="teacherId"
          dataSource={data.byTeacher}
          pagination={false}
          size="small"
          columns={[
            { title: '老师', dataIndex: 'name' },
            { title: '沟通次数', dataIndex: 'count', width: 100 },
            {
              title: '累计时长',
              dataIndex: 'minutes',
              width: 130,
              render: (m: number) => `${Math.floor(m / 60)}h${m % 60}m`,
            },
            { title: '服务学生数', dataIndex: 'studentCount', width: 110 },
          ]}
        />
      </Card>
    </div>
  );
}
