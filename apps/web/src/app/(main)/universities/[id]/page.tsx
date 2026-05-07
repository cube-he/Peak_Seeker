'use client';

import { useParams } from 'next/navigation';
import { Card, Tabs, Space, Spin } from 'antd';
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
import OverviewCard from '@/components/university/OverviewCard';
import DisciplineCard from '@/components/university/DisciplineCard';
import CampusCard from '@/components/university/CampusCard';
import CharterCard from '@/components/university/CharterCard';
import QiangjiTable from '@/components/university/QiangjiTable';
import CampusLocationTab from '@/components/university/campus-location/CampusLocationTab';
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
        <div className="py-4 space-y-4">
          <CharterCard
            renameHistory={u.renameHistory ?? null}
            admissionGuide={u.admissionGuide ?? null}
            charterInfo={u.charterInfo ?? null}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OverviewCard
              code={u.code ?? null}
              province={u.province ?? null}
              city={u.city ?? null}
              type={u.type ?? null}
              level={u.level ?? null}
              runningLevel={u.runningLevel ?? null}
              runningNature={u.runningNature ?? null}
              department={u.department ?? null}
              createdYear={u.createdYear ?? null}
              campusArea={u.campusArea ?? null}
              maleRatio={u.maleRatio ?? null}
              femaleRatio={u.femaleRatio ?? null}
              tags={u.tags ?? null}
            />
            <DisciplineCard
              disciplineEvaluationLevel={u.disciplineEvaluationLevel ?? null}
              aClassDisciplineCount={u.aClassDisciplineCount ?? null}
              hasMasterProgram={!!u.hasMasterProgram}
              masterProgramCount={u.masterProgramCount ?? null}
              masterPrograms={u.masterPrograms ?? null}
              hasDoctoralProgram={!!u.hasDoctoralProgram}
              doctoralProgramCount={u.doctoralProgramCount ?? null}
              doctoralPrograms={u.doctoralPrograms ?? null}
              postgradRate={u.postgradRate ?? null}
              transferDifficulty={u.transferDifficulty ?? null}
            />
            <CampusCard
              militaryTrainingDuration={u.militaryTrainingDuration ?? null}
            />
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
          </div>
          {u.campuses && u.campuses.length > 0 && (
            <CampusLocationTab universityId={u.id} campuses={u.campuses} />
          )}
        </div>
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
