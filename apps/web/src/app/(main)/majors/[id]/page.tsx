'use client';

import { useParams } from 'next/navigation';
import { Card, Tabs, Table, Tag, Spin, Descriptions } from 'antd';
import { BankOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { majorService } from '@/services/major';

export default function MajorDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const { data: major, isLoading } = useQuery({
    queryKey: ['major', id],
    queryFn: () => majorService.getById(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20"><Spin size="large" /></div>
      </MainLayout>
    );
  }

  if (!major) {
    return (
      <MainLayout>
        <Card className="text-center py-16">
          <p style={{ color: '#64748B' }}>专业不存在</p>
        </Card>
      </MainLayout>
    );
  }

  const m = major;

  const universityColumns = [
    {
      title: '院校名称',
      dataIndex: ['university', 'name'],
      key: 'uniName',
      render: (text: string, r: any) => (
        <Link href={`/universities/${r.universityId}`} style={{ color: '#2563EB', fontWeight: 500 }}>
          {text}
        </Link>
      ),
    },
    {
      title: '专业组',
      key: 'group',
      width: 100,
      render: (_: any, r: any) => (
        <span style={{ color: '#64748B', fontSize: 13 }}>{r.groupCode || '-'}</span>
      ),
    },
    { title: '计划数', dataIndex: 'planCount', key: 'planCount', width: 80, render: (v: number) => v ?? '-' },
    {
      title: '学费',
      dataIndex: 'tuition',
      key: 'tuition',
      width: 90,
      render: (v: number) => v ? <span style={{ color: '#0F172A' }}>{v}</span> : '-',
    },
    {
      title: '学科评估',
      dataIndex: 'disciplineEval',
      key: 'disciplineEval',
      width: 90,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-',
    },
    {
      title: '专业排名',
      dataIndex: 'majorRanking',
      key: 'majorRanking',
      width: 90,
      render: (v: string) => v ? <span className="font-medium">{v}</span> : '-',
    },
  ];

  const admissionColumns = [
    {
      title: '院校名称',
      dataIndex: ['university', 'name'],
      key: 'uniName',
      render: (text: string, r: any) => (
        <Link href={`/universities/${r.universityId}`} style={{ color: '#2563EB' }}>{text}</Link>
      ),
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 70 },
    {
      title: '最低分',
      dataIndex: 'majorMinScore',
      key: 'majorMinScore',
      width: 80,
      render: (v: number) => v ? <span className="font-medium" style={{ color: '#0F172A' }}>{v}</span> : '-',
    },
    {
      title: '最低位次',
      dataIndex: 'majorMinRank',
      key: 'majorMinRank',
      width: 100,
      render: (v: number) => v ? <span style={{ color: '#64748B' }}>{v.toLocaleString()}</span> : '-',
    },
    {
      title: '录取人数',
      dataIndex: 'majorAdmissionCount',
      key: 'majorAdmissionCount',
      width: 90,
      render: (v: number) => v ?? '-',
    },
  ];

  const tabItems = [
    {
      key: 'universities',
      label: <span><BankOutlined className="mr-1" />开设院校 ({m.enrollmentPlans?.length || 0})</span>,
      children: (
        <Table
          columns={universityColumns}
          dataSource={m.enrollmentPlans || []}
          rowKey="id"
          scroll={{ x: 700 }}
          size="small"
          pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        />
      ),
    },
    {
      key: 'admissions',
      label: <span><HistoryOutlined className="mr-1" />历年录取 ({m.admissionRecords?.length || 0})</span>,
      children: (
        <Table
          columns={admissionColumns}
          dataSource={m.admissionRecords || []}
          rowKey="id"
          scroll={{ x: 600 }}
          size="small"
          pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        />
      ),
    },
  ];

  return (
    <MainLayout>
      {/* Header Card */}
      <Card className="mb-4" styles={{ body: { padding: '24px 28px' } }}>
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-2xl font-bold m-0" style={{ color: '#0F172A' }}>{m.name}</h1>
          {m.code && <Tag style={{ fontSize: 13 }}>{m.code}</Tag>}
          {m.level && <Tag color={m.level === '本科' ? 'blue' : 'green'}>{m.level}</Tag>}
        </div>
        {(m.category || m.discipline) && (
          <p className="text-sm mb-4" style={{ color: '#64748B' }}>
            {[m.category, m.discipline].filter(Boolean).join(' · ')}
          </p>
        )}
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 4 }} size="small">
          <Descriptions.Item label="专业代码">{m.code || '-'}</Descriptions.Item>
          <Descriptions.Item label="门类">{m.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="本地硕士点">
            {m.localMasterPoint ? <Tag color="blue">有</Tag> : <span style={{ color: '#94A3B8' }}>无</span>}
          </Descriptions.Item>
          <Descriptions.Item label="本地博士点">
            {m.localDoctoralPoint ? <Tag color="purple">有</Tag> : <span style={{ color: '#94A3B8' }}>无</span>}
          </Descriptions.Item>
          {m.employmentRate && (
            <Descriptions.Item label="就业率">
              <span className="font-semibold" style={{ color: '#059669' }}>{`${m.employmentRate}%`}</span>
            </Descriptions.Item>
          )}
          {m.avgSalary && (
            <Descriptions.Item label="平均薪资">
              <span className="font-semibold">¥{m.avgSalary.toLocaleString()}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card styles={{ body: { padding: '4px 0 0' } }}>
        <Tabs items={tabItems} style={{ padding: '0 24px' }} />
      </Card>
    </MainLayout>
  );
}
