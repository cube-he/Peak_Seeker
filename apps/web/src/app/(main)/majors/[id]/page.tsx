'use client';

import { useParams } from 'next/navigation';
import { Card, Tabs, Table, Spin, Descriptions, Typography } from 'antd';
import { BankOutlined, HistoryOutlined, RocketOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { RankInput } from '@/components/score/RankInput';
import { majorService } from '@/services/major';
import CareerTab from '@/components/major/CareerTab';
import AdmissionRow from '@/components/admission/AdmissionRow';
import LowConfidenceBanner from '@/components/admission/LowConfidenceBanner';
import { useUserStore } from '@/stores/userStore';

export default function MajorDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const { data: major, isLoading } = useQuery({
    queryKey: ['major', id],
    queryFn: () => majorService.getById(id),
    enabled: !!id,
  });

  const { examInfo } = useUserStore();

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
        <div className="rounded-xl bg-surface shadow-card text-center py-16">
          <p className="text-text-secondary">专业不存在</p>
        </div>
      </MainLayout>
    );
  }

  const m = major;


  const admissionColumns = [
    {
      title: '院校名称',
      dataIndex: ['university', 'name'],
      key: 'uniName',
      render: (text: string, r: any) => (
        <Link href={`/universities/${r.universityId}`} className="text-primary hover:text-primary-light">{text}</Link>
      ),
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 70 },
    {
      title: '最低分',
      dataIndex: 'majorMinScore',
      key: 'majorMinScore',
      width: 80,
      render: (v: number) => v ? <span className="font-medium text-text">{v}</span> : '-',
    },
    {
      title: '最低位次',
      dataIndex: 'majorMinRank',
      key: 'majorMinRank',
      width: 100,
      render: (v: number) => v ? <span className="text-text-secondary">{v.toLocaleString()}</span> : '-',
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
        <div className="px-4 py-2">
          <LowConfidenceBanner
            show={(m.enrollmentPlans ?? []).some((ep: any) => ep.predictedMinRank?.confidence === 'low')}
          />
          {(m.enrollmentPlans ?? []).length === 0 ? (
            <div className="text-center text-text-muted py-12">暂无开设院校数据</div>
          ) : (
            m.enrollmentPlans.map((ep: any) => (
              <AdmissionRow
                key={ep.id}
                data={{
                  university: {
                    id: ep.universityId,
                    name: ep.university?.name ?? '',
                    logoUrl: ep.university?.logoUrl,
                    is985: ep.university?.is985 ?? false,
                    is211: ep.university?.is211 ?? false,
                    isDoubleFirstClass: ep.university?.isDoubleFirstClass ?? false,
                  },
                  majorName: m.name,
                  groupCode: ep.groupCode ?? '',
                  batch: ep.batch ?? '',
                  recruitType: ep.recruitType ?? '',
                  subjects: ep.subjects ?? '',
                  predictedMinRank: ep.predictedMinRank,
                }}
                userRank={examInfo.rank}
              />
            ))
          )}
        </div>
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
    {
      key: 'career',
      label: <span><RocketOutlined className="mr-1" />就业与发展</span>,
      children: (
        <CareerTab
          careerDirections={m.careerDirections}
          postgraduateDirections={m.postgraduateDirections}
          coreCourses={m.coreCourses}
        />
      ),
    },
  ];

  return (
    <MainLayout>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link href="/majors" className="text-text-tertiary hover:text-primary">专业库</Link>
        <span className="text-text-muted mx-2">/</span>
        <span className="text-text">{m.name}</span>
      </nav>

      {/* Hero Header Card */}
      <div className="rounded-xl bg-surface shadow-card p-6 md:p-8 mb-4 flex flex-col md:flex-row md:gap-6 md:items-start">
        <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="font-serif text-[36px] font-semibold text-text m-0">{m.name}</h1>
          {m.code && (
            <span className="inline-block rounded-full bg-surface-dim text-text-secondary text-[13px] font-medium px-3 py-0.5">{m.code}</span>
          )}
          {m.level && (
            <span className={`inline-block rounded-full text-xs font-medium px-3 py-0.5 ${
              m.level === '本科'
                ? 'bg-primary-fixed text-primary'
                : 'bg-accent-fixed text-accent'
            }`}>
              {m.level}
            </span>
          )}
        </div>
        {(m.category || m.discipline) && (
          <p className="text-sm text-text-secondary mb-4">
            {[m.category, m.discipline].filter(Boolean).join(' · ')}
          </p>
        )}
        {m.description && (
          <Typography.Paragraph
            ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
            className="text-text-secondary text-sm mb-4"
          >
            {m.description}
          </Typography.Paragraph>
        )}
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 4 }} size="small">
          <Descriptions.Item label="专业代码">{m.code || '-'}</Descriptions.Item>
          <Descriptions.Item label="门类">{m.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="本地硕士点">
            {m.localMasterPoint ? (
              <span className="inline-block rounded-full bg-stable-fixed text-stable text-xs font-medium px-3 py-0.5">有</span>
            ) : (
              <span className="text-text-muted">无</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="本地博士点">
            {m.localDoctoralPoint ? (
              <span className="inline-block rounded-full bg-elite-fixed text-elite text-xs font-medium px-3 py-0.5">有</span>
            ) : (
              <span className="text-text-muted">无</span>
            )}
          </Descriptions.Item>
          {m.degree && (
            <Descriptions.Item label="授予学位">{m.degree}</Descriptions.Item>
          )}
          {m.standardDuration && (
            <Descriptions.Item label="学制">{m.standardDuration}年</Descriptions.Item>
          )}
          {m.satisfactionScore && (
            <Descriptions.Item label="满意度">
              <span className="font-semibold">{Number(m.satisfactionScore).toFixed(1)}/5</span>
            </Descriptions.Item>
          )}
          {m.studentScale && (
            <Descriptions.Item label="毕业生规模">{m.studentScale}</Descriptions.Item>
          )}
          {m.employmentRate && (
            <Descriptions.Item label="就业率">
              <span className="font-semibold text-safe">{`${m.employmentRate}%`}</span>
            </Descriptions.Item>
          )}
          {m.avgSalary && (
            <Descriptions.Item label="平均薪资">
              <span className="font-serif font-semibold text-accent [font-variant-numeric:tabular-nums]">{'\u00a5'}{m.avgSalary.toLocaleString()}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
        </div>
        <div className="md:w-[300px] md:flex-shrink-0 mt-4 md:mt-0">
          <RankInput variant="compact" className="!bg-surface-dim !border-border" />
        </div>
      </div>

      {/* Tabs Card */}
      <Card styles={{ body: { padding: '4px 0 0' } }}>
        <Tabs items={tabItems} style={{ padding: '0 24px' }} />
      </Card>
    </MainLayout>
  );
}
