'use client';

import { useParams } from 'next/navigation';
import { Tabs, Table, Spin, Descriptions, Typography, Tag } from 'antd';
import { BankOutlined, HistoryOutlined, RocketOutlined, ReadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { majorService } from '@/services/major';
import CareerTab from '@/components/major/CareerTab';
import TrainingTab from '@/components/major/TrainingTab';
import MajorSummary from '@/components/major/MajorSummary';
import AdmissionRow from '@/components/admission/AdmissionRow';
import LowConfidenceBanner from '@/components/admission/LowConfidenceBanner';
import { useUserStore } from '@/stores/userStore';

// 热度值(人) → "X.X万"；非上榜专业返回 null（不显示）
function formatHeat(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${(value / 10000).toFixed(1)}万`;
}

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
  const employmentRate = m.employmentRate ? `${m.employmentRate}%` : '--';
  const avgSalary = m.avgSalary ? `¥${m.avgSalary.toLocaleString()}` : '--';
  const heroTags = [
    m.category,
    m.discipline,
    m.level,
    m.degree,
    m.softRating ? `${m.softRating} 评级` : null,
    m.isRestricted ? '限报提示' : null,
  ].filter(Boolean);
  const statItems = [
    { label: '就业率', value: employmentRate, sub: '毕业去向参考' },
    { label: '平均薪资', value: avgSalary, sub: '样本统计口径' },
    { label: '学制', value: m.standardDuration || '4年', sub: m.degree || '授予学位待补充' },
    { label: '开设院校', value: m.enrollmentPlans?.length || '-', sub: '当前招生计划记录' },
  ];


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
      key: 'training',
      label: <span><ReadOutlined className="mr-1" />培养方案</span>,
      children: (
        <TrainingTab
          trainingObjective={m.trainingObjective ?? null}
          trainingRequirements={m.trainingRequirements ?? null}
          disciplineReq={m.disciplineReq ?? null}
          knowledgeAbility={m.knowledgeAbility ?? null}
          similarMajors={m.similarMajors ?? null}
          professionalCerts={m.professionalCerts ?? null}
          famousPeople={m.famousPeople ?? null}
          internshipDesc={m.internshipDesc ?? null}
          postUpgradeDirection={m.postUpgradeDirection ?? null}
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
          avgSalary={m.avgSalary ?? null}
          topRegion={m.topRegion ?? null}
          topIndustry={m.topIndustry ?? null}
          employmentRanking={m.employmentRanking ?? null}
          employmentRankingDesc={m.employmentRankingDesc ?? null}
          employmentDirectionDesc={m.employmentDirectionDesc ?? null}
          historicalSalary={m.historicalSalary ?? null}
          salaryDistribution={m.salaryDistribution ?? null}
          experienceDistribution={m.experienceDistribution ?? null}
          educationDistribution={m.educationDistribution ?? null}
          regionDistribution={m.regionDistribution ?? null}
          industryDistribution={m.industryDistribution ?? null}
          positionTop={m.positionTop ?? null}
          yearSalaryMap={m.yearSalaryMap ?? null}
        />
      ),
    },
  ];

  return (
    <MainLayout noPadding>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-[#15212e] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(700px_360px_at_90%_110%,rgba(184,134,11,0.2),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-[1200px] gap-6 px-4 py-9 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end lg:px-12">
          <div className="min-w-0">
            <nav className="mb-3 text-xs text-white/50">
              <Link href="/majors" className="text-white/60 no-underline hover:text-white">
                专业库
              </Link>
              <span className="mx-2">/</span>
              <span>{m.name}</span>
            </nav>
            <div className="mb-2 text-[11px] uppercase tracking-[1.8px] text-white/45">
              Major · {m.category || '未分类'} · {m.discipline || '专业类待补充'}
            </div>
            <h1 className="m-0 flex flex-wrap items-baseline gap-3 font-serif text-[42px] font-semibold leading-tight text-white">
              {m.name}
              {m.code && (
                <span className="rounded-md bg-accent/20 px-3 py-1 font-mono text-sm font-normal text-accent-light">
                  {m.code}
                </span>
              )}
              {/* 新兴专业徽章：2024 年起教育部增设的专业 */}
              {typeof m.setupYear === 'number' && m.setupYear >= 2024 && (
                <span className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-white">
                  新兴专业 · {m.setupYear} 年增设
                </span>
              )}
              {/* 热度徽章：仅 2025 本科热度 TOP50 显示 */}
              {typeof m.popularityRank === 'number' && (
                <span className="rounded-md bg-[#fa541c] px-3 py-1 text-sm font-medium text-white">
                  🔥 {m.popularityYear ?? 2025} 本科热度 全国第 {m.popularityRank}
                  {formatHeat(m.popularityHeat) ? ` · ${formatHeat(m.popularityHeat)}` : ''}
                </span>
              )}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {heroTags.map((tag) => (
                <span key={String(tag)} className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs text-white/78">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/15 bg-white/8 p-4 backdrop-blur-md sm:grid-cols-4 lg:grid-cols-2">
            {statItems.map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-[10px] uppercase tracking-[1.4px] text-white/50">{item.label}</div>
                <div className="mt-1 font-serif text-[26px] font-bold leading-none text-accent-light tabular-nums">
                  {item.value}
                </div>
                <div className="mt-1 text-[10px] text-white/45">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12">
        <main className="min-w-0">
          <MajorSummary
            whatIs={m.whatIs ?? null}
            electiveAdvice={m.electiveAdvice ?? null}
            avgSalary={m.avgSalary ?? null}
            setupYear={m.setupYear ?? null}
            industryDistribution={m.industryDistribution ?? null}
            employmentRanking={m.employmentRanking ?? null}
          />
          <section className="mb-6 rounded-2xl bg-surface p-6 shadow-card sm:p-7">
            <div className="mb-2 text-[11px] uppercase tracking-[1.5px] text-accent">Overview · 专业概览</div>
            <h2 className="m-0 font-serif text-[24px] font-semibold text-text">
              {m.name} 的培养路径
            </h2>
            {m.description ? (
              <Typography.Paragraph
                ellipsis={{ rows: 4, expandable: true, symbol: '展开' }}
                className="!mb-0 !mt-3 !text-sm !leading-relaxed !text-text-tertiary"
              >
                {m.description}
              </Typography.Paragraph>
            ) : !m.whatIs && !m.whatStudy && !m.whatDo ? (
              <p className="m-0 mt-3 text-sm leading-relaxed text-text-tertiary">
                当前专业介绍暂未补充，页面优先展示已接入的开设院校、历年录取、课程与就业方向数据。
              </p>
            ) : null}

            {(m.whatIs || m.whatStudy || m.whatDo) && (
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                {m.whatIs && (
                  <div className="rounded-lg bg-bg-subtle p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2">
                      是什么
                    </div>
                    <Typography.Paragraph
                      ellipsis={{ rows: 6, expandable: true, symbol: '展开' }}
                      className="!mb-0 !text-[13px] !leading-6 !text-text-secondary"
                    >
                      {m.whatIs}
                    </Typography.Paragraph>
                  </div>
                )}
                {m.whatStudy && (
                  <div className="rounded-lg bg-bg-subtle p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2">
                      学什么
                    </div>
                    <Typography.Paragraph
                      ellipsis={{ rows: 6, expandable: true, symbol: '展开' }}
                      className="!mb-0 !text-[13px] !leading-6 !text-text-secondary"
                    >
                      {m.whatStudy}
                    </Typography.Paragraph>
                  </div>
                )}
                {m.whatDo && (
                  <div className="rounded-lg bg-bg-subtle p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2">
                      干什么
                    </div>
                    <Typography.Paragraph
                      ellipsis={{ rows: 6, expandable: true, symbol: '展开' }}
                      className="!mb-0 !text-[13px] !leading-6 !text-text-secondary"
                    >
                      {m.whatDo}
                    </Typography.Paragraph>
                  </div>
                )}
              </div>
            )}

            {m.firstImpression && (
              <div className="mt-4">
                <div className="text-text-tertiary text-xs mb-1.5">第一印象 / 关键词</div>
                <div className="flex flex-wrap gap-1.5">
                  {String(m.firstImpression)
                    .split(/[,，、\s]+/)
                    .filter(Boolean)
                    .map((kw: string) => (
                      <Tag key={kw}>{kw}</Tag>
                    ))}
                </div>
              </div>
            )}
          </section>

          <section className="mb-6 rounded-2xl bg-surface p-5 shadow-card sm:p-6">
            <div className="mb-4 text-[11px] uppercase tracking-[1.5px] text-accent">Facts · 关键事实</div>
            <Descriptions bordered column={{ xs: 1, sm: 2, md: 4 }} size="small">
              <Descriptions.Item label="专业代码">{m.code || '-'}</Descriptions.Item>
              <Descriptions.Item label="门类">{m.category || '-'}</Descriptions.Item>
              <Descriptions.Item label="本地硕士点">
                {m.localMasterPoint ? <span className="rounded-full bg-stable-fixed px-3 py-0.5 text-xs font-medium text-stable">有</span> : <span className="text-text-muted">无</span>}
              </Descriptions.Item>
              <Descriptions.Item label="本地博士点">
                {m.localDoctoralPoint ? <span className="rounded-full bg-elite-fixed px-3 py-0.5 text-xs font-medium text-elite">有</span> : <span className="text-text-muted">无</span>}
              </Descriptions.Item>
              {m.degree && <Descriptions.Item label="授予学位">{m.degree}</Descriptions.Item>}
              {m.standardDuration && <Descriptions.Item label="学制">{m.standardDuration}</Descriptions.Item>}
              {typeof m.setupYear === 'number' && (
                <Descriptions.Item label="增设年份">
                  <span className={m.setupYear >= 2024 ? 'font-semibold text-accent' : ''}>
                    {m.setupYear} 年
                  </span>
                </Descriptions.Item>
              )}
              {m.electiveAdvice && (
                <Descriptions.Item label="选考建议">
                  <span className="font-semibold text-primary">{m.electiveAdvice}</span>
                </Descriptions.Item>
              )}
              {m.satisfactionScore && (
                <Descriptions.Item label="满意度">
                  <span className="font-semibold">{Number(m.satisfactionScore).toFixed(1)}/5</span>
                </Descriptions.Item>
              )}
              {m.studentScale && <Descriptions.Item label="毕业生规模">{m.studentScale}</Descriptions.Item>}
            </Descriptions>
          </section>

          <section className="rounded-2xl bg-surface p-2 shadow-card">
            <Tabs items={tabItems} style={{ padding: '0 18px' }} />
          </section>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl bg-surface p-5 shadow-card">
            <h3 className="m-0 font-serif text-base font-semibold text-text">填报提示</h3>
            <p className="m-0 mt-2 text-sm leading-relaxed text-text-tertiary">
              「就业与发展」标签页含历年薪资走势、工资段与地区行业分布；「培养方案」标签页含培养目标、相近专业与职业资格证书，可作为选科与志愿排序的参考。
            </p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-primary to-primary-light p-5 text-white shadow-card">
            <h3 className="m-0 font-serif text-base font-semibold text-white">基于你的当前位次</h3>
            <p className="m-0 mt-2 text-sm leading-relaxed text-white/75">
              查看哪些院校正在招收该专业，并把合适的院校专业组合加入志愿方案。
            </p>
            <Link href="/recommend" className="mt-4 inline-flex w-full justify-center rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-white/15">
              生成完整推荐 →
            </Link>
          </div>
        </aside>
      </div>
    </MainLayout>
  );
}
