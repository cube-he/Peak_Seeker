'use client';

import { useParams } from 'next/navigation';
import { Tabs, Space, Spin } from 'antd';
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
  const latestAdmission = u.admissionRecords?.[0] ?? admissions?.[0] ?? null;
  const locationText = [u.province, u.city, u.type, u.level, u.runningNature].filter(Boolean).join(' · ');
  const badgeItems = [
    u.is985 ? '985 工程' : null,
    u.is211 ? '211 工程' : null,
    u.isDoubleFirstClass ? '双一流' : null,
    u.type,
    u.runningNature,
  ].filter(Boolean);
  const statItems = [
    { label: '院校代码', value: u.code || '-', sub: u.department || '主管部门待补充' },
    { label: '最近最低分', value: latestAdmission?.majorMinScore || latestAdmission?.minScore || '-', sub: latestAdmission?.year ? `${latestAdmission.year} 年录取` : '等待录取数据' },
    { label: '最近最低位次', value: latestAdmission?.majorMinRank || latestAdmission?.minRank || '-', sub: userSubject ? `${userSubject} 类参考` : '按已选科类参考' },
    { label: '招生专业', value: majors?.length || '-', sub: '当前可查计划数' },
    { label: '综合排名', value: u.rankingSoft || u.ranking || '-', sub: '软科/综合口径' },
    { label: '建校时间', value: u.createdYear || '-', sub: u.campusArea ? `校园面积 ${u.campusArea} 亩` : '基础信息' },
  ];

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
    <MainLayout noPadding>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-[#15212e] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(800px_380px_at_82%_120%,rgba(184,134,11,0.2),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-[1200px] gap-6 px-4 py-9 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_280px] lg:items-center lg:px-12">
          <UniversityLogo name={u.name} logoUrl={u.logoUrl} size={96} />
          <div className="min-w-0">
            <nav className="mb-3 text-xs text-white/50">
              <Link href="/universities" className="text-white/60 no-underline hover:text-white">
                院校库
              </Link>
              <span className="mx-2">/</span>
              <span>{u.name}</span>
            </nav>
            <div className="mb-2 text-[11px] uppercase tracking-[1.8px] text-white/45">
              院校 ID · {u.code || u.id} · 在川招生
            </div>
            <h1 className="m-0 truncate font-serif text-[38px] font-semibold leading-tight text-white">
              {u.name}
            </h1>
            <div className="mt-2 flex items-center gap-1 text-sm text-white/65">
              <EnvironmentOutlined />
              <span>{locationText || '院校基础信息待补充'}</span>
            </div>
            <Space size={8} wrap className="mt-4">
              {badgeItems.map((item) => (
                <span
                  key={String(item)}
                  className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-white/80"
                >
                  {item}
                </span>
              ))}
            </Space>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 p-4 text-left backdrop-blur-md lg:text-right">
            <div className="text-[10px] uppercase tracking-[1.5px] text-white/50">基于你的当前位次</div>
            <div className="mt-2 font-serif text-[34px] font-bold leading-none text-accent-light">
              {u.bestPrediction?.acceptRate ? `${Math.round(u.bestPrediction.acceptRate * 100)}%` : '--'}
            </div>
            <div className="mt-2 text-xs text-white/50">
              {u.bestPrediction ? '预测命中率 · 可加入方案' : '输入分数后生成预测'}
            </div>
            <div className="mt-4 flex gap-2 lg:justify-end">
              <button className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/15">
                收藏
              </button>
              <button className="rounded-lg border-0 bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-light">
                加入方案
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border-subtle bg-surface">
        <div className="mx-auto grid max-w-[1200px] gap-4 px-4 py-5 sm:px-6 md:grid-cols-3 lg:grid-cols-6 lg:px-12">
          {statItems.map((item) => (
            <div key={item.label} className="border-border-subtle lg:border-r lg:pr-4 last:border-r-0">
              <div className="text-[10px] uppercase tracking-[1.4px] text-text-muted">{item.label}</div>
              <div className="mt-1 truncate font-serif text-[22px] font-semibold leading-none text-text tabular-nums">
                {item.value}
              </div>
              <div className="mt-1 truncate text-[11px] text-text-tertiary">{item.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="sticky top-16 z-30 border-b border-border bg-bg/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] gap-7 overflow-x-auto px-4 sm:px-6 lg:px-12">
          {[
            ['info', '概览'],
            ['plans', '招生计划'],
            ['admissions', '历年录取'],
            ['assist', '位次辅助'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={`#${href}`}
              className="whitespace-nowrap border-b-2 border-transparent py-3 text-sm text-text-tertiary no-underline transition-colors hover:text-primary"
            >
              {label}
            </a>
          ))}
        </div>
      </section>

      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12">
        <main className="min-w-0">
          <section className="mb-6 rounded-2xl bg-surface p-5 shadow-card sm:p-7">
            <div className="mb-2 text-[11px] uppercase tracking-[1.5px] text-accent">Overview · 院校概览</div>
            <h2 className="m-0 font-serif text-[24px] font-semibold text-text">
              {u.name} 的核心信息
            </h2>
            <p className="m-0 mt-3 text-sm leading-relaxed text-text-tertiary">
              {u.description || '该院校的介绍信息暂未补充，当前页面优先展示已接入的院校基本信息、招生计划、历年录取、校区位置和评价数据。'}
            </p>
          </section>

          <section id="info" className="rounded-2xl bg-surface p-2 shadow-card">
            <Tabs items={tabItems} style={{ padding: '0 18px' }} />
          </section>
        </main>

        <aside id="assist" className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          <RankInput variant="compact" className="!border-border !bg-surface" />
          <div className="rounded-xl bg-surface p-5 shadow-card">
            <HeroBanner
              university={{ is985: u.is985, is211: u.is211 }}
              prediction={u.bestPrediction ?? null}
              userRank={examInfo.rank}
            />
          </div>
          <div className="rounded-xl bg-surface p-5 shadow-card">
            <h3 className="m-0 font-serif text-base font-semibold text-text">下一步</h3>
            <p className="m-0 mt-2 text-sm leading-relaxed text-text-tertiary">
              详情页设计稿里的“相似院校”和“问答社区”需要额外接口；当前先保留院校已有数据模块，后续接入接口后再展开。
            </p>
          </div>
        </aside>
      </div>
    </MainLayout>
  );
}
