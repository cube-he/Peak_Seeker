'use client';

import { useParams } from 'next/navigation';
import { Card, Tabs, Table, Space, Descriptions, Spin } from 'antd';
import {
  BankOutlined,
  BookOutlined,
  HistoryOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { universityService } from '@/services/university';

export default function UniversityDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const { data: university, isLoading } = useQuery({
    queryKey: ['university', id],
    queryFn: () => universityService.getById(id),
    enabled: !!id,
  });

  const { data: majors } = useQuery({
    queryKey: ['university-majors', id],
    queryFn: () => universityService.getMajors(id),
    enabled: !!id,
  });

  const { data: admissions } = useQuery({
    queryKey: ['university-admissions', id],
    queryFn: () => universityService.getAdmissions(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20"><Spin size="large" /></div>
      </MainLayout>
    );
  }

  if (!university) {
    return (
      <MainLayout>
        <div className="rounded-xl bg-surface-container-lowest shadow-card text-center py-16">
          <p className="text-on-surface-variant">院校不存在</p>
        </div>
      </MainLayout>
    );
  }

  const u = university;

  const planColumns = [
    {
      title: '专业组',
      key: 'group',
      width: 100,
      render: (_: any, r: any) => (
        <span className="text-on-surface-variant text-[13px]">{r.groupCode || '-'}</span>
      ),
    },
    {
      title: '专业名称',
      dataIndex: ['major', 'name'],
      key: 'majorName',
      render: (text: string, r: any) => (
        <Link href={`/majors/${r.majorId}`} className="text-primary font-medium hover:text-primary-container">
          {text}
        </Link>
      ),
    },
    { title: '计划数', dataIndex: 'planCount', key: 'planCount', width: 80, render: (v: number) => v ?? '-' },
    { title: '批次', dataIndex: 'batch', key: 'batch', width: 90 },
    { title: '选科', dataIndex: 'subjects', key: 'subjects', width: 110, ellipsis: true },
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
      title: '国家特色',
      dataIndex: 'isNationalFeature',
      key: 'isNationalFeature',
      width: 80,
      render: (v: boolean) => v ? (
        <span className="inline-block rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant text-xs font-medium px-3 py-0.5">是</span>
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
      title: '专业名称',
      dataIndex: ['major', 'name'],
      key: 'majorName',
      render: (text: string, r: any) => (
        <Link href={`/majors/${r.majorId}`} className="text-primary hover:text-primary-container">{text}</Link>
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
      key: 'info',
      label: <span><BankOutlined className="mr-1" />基本信息</span>,
      children: (
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="院校代码">{u.code || '-'}</Descriptions.Item>
          <Descriptions.Item label="省份/城市">{[u.province, u.city].filter(Boolean).join(' · ') || '-'}</Descriptions.Item>
          <Descriptions.Item label="类型">{u.type || '-'}</Descriptions.Item>
          <Descriptions.Item label="层次">{u.level || '-'}</Descriptions.Item>
          <Descriptions.Item label="办学性质">{u.runningNature || '-'}</Descriptions.Item>
          <Descriptions.Item label="主管部门">{u.department || '-'}</Descriptions.Item>
          <Descriptions.Item label="院校排名">{u.ranking ? <span className="font-semibold text-primary">第 {u.ranking} 名</span> : '-'}</Descriptions.Item>
          <Descriptions.Item label="考研率">{u.postgradRate || '-'}</Descriptions.Item>
          <Descriptions.Item label="转专业难度">{u.transferDifficulty || '-'}</Descriptions.Item>
          <Descriptions.Item label="学科评估">{u.disciplineEvaluationLevel || '-'}</Descriptions.Item>
          <Descriptions.Item label="硕士点">{u.hasMasterProgram ? `${u.masterProgramCount || ''}个` : '无'}</Descriptions.Item>
          <Descriptions.Item label="博士点">{u.hasDoctoralProgram ? `${u.doctoralProgramCount || ''}个` : '无'}</Descriptions.Item>
          {u.renameHistory && (
            <Descriptions.Item label="更名信息" span={2}>{u.renameHistory}</Descriptions.Item>
          )}
          {u.admissionGuide && (
            <Descriptions.Item label="招生章程" span={2}>
              <div className="max-h-[200px] overflow-auto whitespace-pre-wrap text-[13px] font-body">{u.admissionGuide}</div>
            </Descriptions.Item>
          )}
        </Descriptions>
      ),
    },
    {
      key: 'plans',
      label: <span><BookOutlined className="mr-1" />招生计划 ({majors?.length || 0})</span>,
      children: (
        <Table
          columns={planColumns}
          dataSource={majors || []}
          rowKey="id"
          scroll={{ x: 900 }}
          size="small"
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        />
      ),
    },
    {
      key: 'admissions',
      label: <span><HistoryOutlined className="mr-1" />历年录取 ({admissions?.length || 0})</span>,
      children: (
        <Table
          columns={admissionColumns}
          dataSource={admissions || []}
          rowKey="id"
          scroll={{ x: 600 }}
          size="small"
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        />
      ),
    },
  ];

  return (
    <MainLayout>
      {/* Breadcrumb */}
      <nav className="mb-4 font-body text-sm">
        <Link href="/universities" className="text-on-surface-variant hover:text-primary">院校库</Link>
        <span className="text-outline mx-2">/</span>
        <span className="text-on-surface">{u.name}</span>
      </nav>

      {/* Hero Header Card */}
      <div className="rounded-xl bg-surface-container-lowest shadow-card p-6 md:p-8 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-headline text-2xl font-bold text-on-surface m-0">{u.name}</h1>
              <Space size={4}>
                {u.is985 && (
                  <span className="inline-block rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant text-xs font-medium px-3 py-0.5">985</span>
                )}
                {u.is211 && (
                  <span className="inline-block rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-medium px-3 py-0.5">211</span>
                )}
                {u.isDoubleFirstClass && (
                  <span className="inline-block rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-medium px-3 py-0.5">双一流</span>
                )}
              </Space>
            </div>
            <div className="flex items-center gap-1 text-sm text-on-surface-variant font-body">
              <EnvironmentOutlined />
              {[u.province, u.city, u.type, u.level, u.runningNature].filter(Boolean).join(' · ')}
            </div>
          </div>
          {u.ranking && (
            <div className="text-center px-4">
              <div className="text-2xl font-bold text-primary font-headline">{u.ranking}</div>
              <div className="text-xs text-outline font-body">全国排名</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Card */}
      <Card styles={{ body: { padding: '4px 0 0' } }}>
        <Tabs items={tabItems} style={{ padding: '0 24px' }} />
      </Card>
    </MainLayout>
  );
}
