'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Segmented, Spin, Table } from 'antd';
import Link from 'next/link';
import { consultationApi } from '@/services/consultation-api';

const CHANNEL_NAME: Record<string, string> = {
  phone: '电话',
  wechat: '微信',
  in_person: '线下',
  video: '视频',
};

export default function MyInsightsPage() {
  const [range, setRange] = useState<'week' | 'month'>('month');
  const { data, isLoading } = useQuery({
    queryKey: ['insights-me', range],
    queryFn: () => consultationApi.getMyInsights(range),
  });

  if (isLoading || !data) {
    return <div className="py-20 text-center"><Spin /></div>;
  }

  const hours = Math.floor(data.totalMinutes / 60);
  const mins = data.totalMinutes % 60;
  const diff =
    data.estimation.avgEst != null && data.estimation.avgAct != null
      ? data.estimation.avgAct - data.estimation.avgEst
      : null;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="m-0 text-xl font-semibold">我的沟通复盘</h1>
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
          <p className="m-0 text-xs text-text-muted">沟通次数</p>
          <p className="m-0 text-3xl font-semibold">{data.totalCount}</p>
        </Card>
        <Card>
          <p className="m-0 text-xs text-text-muted">累计时长</p>
          <p className="m-0 text-3xl font-semibold">{hours}<span className="text-base">h</span>{mins}<span className="text-base">m</span></p>
        </Card>
        <Card>
          <p className="m-0 text-xs text-text-muted">预估偏差(平均)</p>
          <p className="m-0 text-3xl font-semibold">
            {diff === null ? '--' : diff > 0 ? `+${diff}` : `${diff}`}
            <span className="text-base">分</span>
          </p>
          <p className="m-0 text-[10px] text-text-muted">
            {data.estimation.sampleSize > 0 ? `基于 ${data.estimation.sampleSize} 次` : '无样本'}
          </p>
        </Card>
      </div>

      <Card title="按学生分布">
        <Table
          rowKey="studentId"
          dataSource={data.byStudent}
          pagination={false}
          size="small"
          columns={[
            {
              title: '学生',
              dataIndex: 'name',
              render: (name: string, r: { studentId: number }) => (
                <Link href={`/teacher/students/${r.studentId}`}>{name}</Link>
              ),
            },
            { title: '沟通次数', dataIndex: 'count', width: 100 },
            {
              title: '累计时长(分)',
              dataIndex: 'minutes',
              width: 130,
              render: (m: number) => `${Math.floor(m / 60)}h${m % 60}m`,
            },
          ]}
        />
      </Card>

      <Card title="按沟通方式">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(data.byChannel).map(([ch, v]) => (
            <div key={ch} className="rounded-md border border-border-subtle p-3">
              <p className="m-0 text-xs text-text-muted">{CHANNEL_NAME[ch] ?? ch}</p>
              <p className="m-0 text-2xl font-semibold">{v.count}</p>
              <p className="m-0 text-[10px] text-text-muted">{Math.floor(v.minutes / 60)}h{v.minutes % 60}m</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
