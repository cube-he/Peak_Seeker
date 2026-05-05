'use client';

import { useParams } from 'next/navigation';
import { Card, Tabs, Space, Descriptions, Spin } from 'antd';
import {
  BankOutlined,
  BookOutlined,
  HistoryOutlined,
  EnvironmentOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { RankInput } from '@/components/score/RankInput';
import { universityService } from '@/services/university';
import RankingCard from '@/components/university/RankingCard';
import SatisfactionCard from '@/components/university/SatisfactionCard';
import EmploymentCard from '@/components/university/EmploymentCard';
import QiangjiTable from '@/components/university/QiangjiTable';
import UniversityLogo from '@/components/university/UniversityLogo';
import PlanPivotTable from '@/components/university/PlanPivotTable';
import AdmissionPivotTable from '@/components/university/AdmissionPivotTable';
import HeroBanner from '@/components/admission/HeroBanner';
import { useUserStore } from '@/stores/userStore';

export default function UniversityDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const { examInfo } = useUserStore();
  const userSubject = examInfo.subjects?.[0];

  const { data: university, isLoading } = useQuery({
    queryKey: ['university', id, userSubject],
    queryFn: () => universityService.getById(id, userSubject),
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
        <div className="rounded-xl bg-surface shadow-card text-center py-16">
          <p className="text-text-tertiary">院校不存在</p>
        </div>
      </MainLayout>
    );
  }

  const u = university;

  const tabItems = [
    {
      key: 'info',
      label: <span><BankOutlined className="mr-1" />基本信息</span>,
      children: (
        <>
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
                <div className="max-h-[200px] overflow-auto whitespace-pre-wrap text-[13px]">{u.admissionGuide}</div>
              </Descriptions.Item>
            )}
          </Descriptions>
          <RankingCard
            rankingSoft={u.rankingSoft ?? null}
            rankingAlumni={u.rankingAlumni ?? null}
            rankingQS={u.rankingQS ?? null}
            rankingUSNews={u.rankingUSNews ?? null}
            aClassDisciplineCount={u.aClassDisciplineCount ?? null}
          />
          <SatisfactionCard
            overall={u.satisfactionOverall ?? null}
            life={u.satisfactionLife ?? null}
            environ={u.satisfactionEnviron ?? null}
            count={u.satisfactionCount ?? null}
          />
          <EmploymentCard
            employmentRate={u.employmentRate ?? null}
            furtherStudyRate={u.furtherStudyRate ?? null}
            avgSalary={u.avgSalary ?? null}
            topEmployers={u.topEmployers ?? null}
          />
        </>
      ),
    },
    {
      key: 'plans',
      label: <span><BookOutlined className="mr-1" />招生计划 ({majors?.length || 0})</span>,
      children: <PlanPivotTable data={majors} />,
    },
    {
      key: 'admissions',
      label: <span><HistoryOutlined className="mr-1" />历年录取 ({admissions?.length || 0})</span>,
      children: <AdmissionPivotTable data={admissions} />,
    },
    // Only show the tab when there is qiangji data
    ...(u.qiangjiAdmissions?.length > 0
      ? [
          {
            key: 'qiangji',
            label: <span><TrophyOutlined className="mr-1" />强基计划</span>,
            children: <QiangjiTable data={u.qiangjiAdmissions} />,
          },
        ]
      : []),
  ];

  return (
    <MainLayout>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link href="/universities" className="text-text-tertiary hover:text-primary">院校库</Link>
        <span className="text-text-faint mx-2">/</span>
        <span className="text-text">{u.name}</span>
      </nav>

      {/* Hero Header Card */}
      <div className="rounded-xl bg-surface shadow-card p-6 md:p-8 mb-4">
        <div className="flex items-start gap-5 flex-wrap">
          <UniversityLogo name={u.name} logoUrl={u.logoUrl} size={80} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="font-serif text-[32px] font-semibold text-text m-0">{u.name}</h1>
              <Space size={4}>
                {u.is985 && (
                  <span className="inline-block rounded-full bg-surface-dim text-text-secondary text-xs font-medium px-3 py-0.5">985</span>
                )}
                {u.is211 && (
                  <span className="inline-block rounded-full bg-surface-dim text-text-secondary text-xs font-medium px-3 py-0.5">211</span>
                )}
                {u.isDoubleFirstClass && (
                  <span className="inline-block rounded-full bg-surface-dim text-text-secondary text-xs font-medium px-3 py-0.5">双一流</span>
                )}
              </Space>
            </div>
            <div className="flex items-center gap-1 text-sm text-text-tertiary">
              <EnvironmentOutlined />
              {[u.province, u.city, u.type, u.level, u.runningNature].filter(Boolean).join(' · ')}
              {u.ranking && <span className="ml-2">· 全国排名 #{u.ranking}</span>}
            </div>
          </div>
          <div className="w-[280px]">
            <RankInput variant="compact" className="!bg-surface !border-border" />
          </div>
        </div>

        <HeroBanner
          university={{ is985: u.is985, is211: u.is211 }}
          prediction={u.bestPrediction ?? null}
          userRank={examInfo.rank}
        />
      </div>

      {/* Tabs Card */}
      <Card styles={{ body: { padding: '4px 0 0' } }}>
        <Tabs items={tabItems} style={{ padding: '0 24px' }} />
      </Card>
    </MainLayout>
  );
}
