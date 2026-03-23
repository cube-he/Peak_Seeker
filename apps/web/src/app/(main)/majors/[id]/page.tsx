'use client';

import { useParams } from 'next/navigation';
import { Card, Tabs, Table, Spin, Descriptions } from 'antd';
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
        <div className="rounded-xl bg-surface-container-lowest shadow-card text-center py-16">
          <p className="text-on-surface-variant">专业不存在</p>
        </div>
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
        <Link href={`/universities/${r.universityId}`} className="text-primary font-medium hover:text-primary-container">
          {text}
        </Link>
      ),
    },
    {
      title: '专业组',
      key: 'group',
      width: 100,
      render: (_: any, r: any) => (
        <span className="text-on-surface-variant text-[13px]">{r.groupCode || '-'}</span>
      ),
    },
    { title: '计划数', dataIndex: 'planCount', key: 'planCount', width: 80, render: (v: number) => v ?? '-' },
    {
      title: '学费',
      dataIndex: 'tuition',
      key: 'tuition',
      width: 90,
      render: (v: number) => v ? <span className="text-on-surface">{v}</span> : '-',
    },
    {
      title: '学科评估',
      dataIndex: 'disciplineEval',
      key: 'disciplineEval',
      width: 90,
      render: (v: string) => v ? (
        <span className="inline-block rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-medium px-3 py-0.5">{v}</span>
      ) : '-',
    },
    {
      title: '专业排名',
      dataIndex: 'majorRanking',
      key: 'majorRanking',
      width: 90,
      render: (v: string) => v ? <span className="font-medium text-on-surface">{v}</span> : '-',
    },
  ];

  const admissionColumns = [
    {
      title: '院校名称',
      dataIndex: ['university', 'name'],
      key: 'uniName',
      render: (text: string, r: any) => (
        <Link href={`/universities/${r.universityId}`} className="text-primary hover:text-primary-container">{text}</Link>
      ),
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 70 },
    {
      title: '最低分',
      dataIndex: 'majorMinScore',
      key: 'majorMinScore',
      width: 80,
      render: (v: number) => v ? <span className="font-medium text-on-surface">{v}</span> : '-',
    },
    {
      title: '最低位次',
      dataIndex: 'majorMinRank',
      key: 'majorMinRank',
      width: 100,
      render: (v: number) => v ? <span className="text-on-surface-variant">{v.toLocaleString()}</span> : '-',
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
      {/* Breadcrumb */}
      <nav className="mb-4 font-body text-sm">
        <Link href="/majors" className="text-on-surface-variant hover:text-primary">专业库</Link>
        <span className="text-outline mx-2">/</span>
        <span className="text-on-surface">{m.name}</span>
      </nav>

      {/* Hero Header Card */}
      <div className="rounded-xl bg-surface-container-lowest shadow-card p-6 md:p-8 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="font-headline text-2xl font-bold text-on-surface m-0">{m.name}</h1>
          {m.code && (
            <span className="inline-block rounded-full bg-surface-container-high text-on-surface-variant text-[13px] font-medium px-3 py-0.5">{m.code}</span>
          )}
          {m.level && (
            <span className={`inline-block rounded-full text-xs font-medium px-3 py-0.5 ${
              m.level === '本科'
                ? 'bg-primary-fixed text-on-primary-fixed-variant'
                : 'bg-secondary-fixed text-on-secondary-fixed-variant'
            }`}>
              {m.level}
            </span>
          )}
        </div>
        {(m.category || m.discipline) && (
          <p className="text-sm text-on-surface-variant mb-4 font-body">
            {[m.category, m.discipline].filter(Boolean).join(' · ')}
          </p>
        )}
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 4 }} size="small">
          <Descriptions.Item label="专业代码">{m.code || '-'}</Descriptions.Item>
          <Descriptions.Item label="门类">{m.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="本地硕士点">
            {m.localMasterPoint ? (
              <span className="inline-block rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-medium px-3 py-0.5">有</span>
            ) : (
              <span className="text-outline">无</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="本地博士点">
            {m.localDoctoralPoint ? (
              <span className="inline-block rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-medium px-3 py-0.5">有</span>
            ) : (
              <span className="text-outline">无</span>
            )}
          </Descriptions.Item>
          {m.employmentRate && (
            <Descriptions.Item label="就业率">
              <span className="font-semibold text-secondary">{`${m.employmentRate}%`}</span>
            </Descriptions.Item>
          )}
          {m.avgSalary && (
            <Descriptions.Item label="平均薪资">
              <span className="font-semibold text-on-surface">{'\u00a5'}{m.avgSalary.toLocaleString()}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* Tabs Card */}
      <Card styles={{ body: { padding: '4px 0 0' } }}>
        <Tabs items={tabItems} style={{ padding: '0 24px' }} />
      </Card>
    </MainLayout>
  );
}
