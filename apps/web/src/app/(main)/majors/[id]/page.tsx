'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Tabs, Table, Spin, Descriptions, Typography, Tag, Tooltip } from 'antd';
import { DurationLabel } from '../DurationLabel';
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
  // 历年录取筛选: 科类 + 办学性质 (公办/民办)
  const [subjectFilter, setSubjectFilter] = useState<'全部' | '物理' | '历史'>('全部');
  const [natureFilter, setNatureFilter] = useState<'全部' | '公办' | '民办'>('全部');
  const [batchFilter, setBatchFilter] = useState<string>('全部');
  // 透视表年份: 默认近 3 年, 可展开到 5 年 (15 列在 1440 容器内也需横滚)
  const [showAllYears, setShowAllYears] = useState(false);

  // 同门类同层次专业, 页尾横向推荐
  const { data: relatedData } = useQuery({
    queryKey: ['majors-related', major?.discipline, major?.level],
    queryFn: () =>
      majorService.getList({ discipline: major?.discipline, level: major?.level, pageSize: 24 }),
    enabled: !!major?.discipline,
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
  // 开设院校: 同校同组同批次跨年份各有一条计划记录, 展示与计数按去重口径
  // (后端按 year desc 返回, 首遇即最新年份, 预测位次随之取最新)
  const uniqPlans: any[] = [];
  const seenPlanKeys = new Set<string>();
  for (const ep of m.enrollmentPlans ?? []) {
    const k = `${ep.universityId}|${ep.groupCode}|${ep.batch}|${ep.recruitType}|${ep.subjects}`;
    if (!seenPlanKeys.has(k)) {
      seenPlanKeys.add(k);
      uniqPlans.push(ep);
    }
  }
  const planUniCount = new Set(uniqPlans.map((p: any) => p.universityId)).size;

  // 就业率缺失时顶替为最新年在川计划人数 (有招生计划的专业都有值, 对填报更有参考价值)
  const latestPlanYear = (m.enrollmentPlans ?? []).reduce(
    (mx: number, ep: any) => Math.max(mx, ep.year ?? 0), 0,
  );
  const latestPlanTotal = (m.enrollmentPlans ?? [])
    .filter((ep: any) => ep.year === latestPlanYear)
    .reduce((s: number, ep: any) => s + (ep.planCount ?? 0), 0);

  const statItems = [
    m.employmentRate
      ? { label: '就业率', value: employmentRate, sub: '毕业去向参考' }
      : {
          label: '在川计划',
          value: latestPlanTotal > 0 ? latestPlanTotal : '-',
          sub: latestPlanYear ? `${latestPlanYear} 年计划人数` : '招生计划待公布',
        },
    {
      label: '平均薪资',
      value: m.avgSalary ? (
        <Tooltip title="基于全国就业样本统计的平均月薪（不限毕业年限），适合专业间横向比较，不代表应届起薪">
          <span style={{ cursor: 'help', borderBottom: '1px dashed rgba(255,255,255,0.35)' }}>{avgSalary}</span>
        </Tooltip>
      ) : '--',
      sub: '样本统计口径',
    },
    { label: '学制', value: <DurationLabel value={m.standardDuration || '4年'} />, sub: m.degree || '授予学位待补充' },
    { label: '开设院校', value: planUniCount || '-', sub: '近年在川招生院校数' },
  ];

  // 同类专业: 同名多 code 去重, 排除自身
  const relatedMajors = (() => {
    const list: any[] = (relatedData as any)?.data || [];
    const seen = new Set<string>([m.name]);
    const out: any[] = [];
    for (const r of list) {
      if (r.id === m.id || seen.has(r.name)) continue;
      seen.add(r.name);
      out.push(r);
    }
    return out;
  })();



  // 历年录取: 科类(subjects 含物理/历史) + 办学性质 + 批次 筛选
  const allAdmissions: any[] = m.admissionRecords || [];
  // 该专业实际出现过的批次, 按 2025 批次结构表投档顺序排列
  const BATCH_ORDER = [
    '本科提前批(国家专项)', '本科提前批A段', '本科提前批(高校专项)', '本科提前批B段',
    '本科批A段', '本科批(高校专项)', '本科批B段', '本科批(区域教育均衡发展专项)',
    '高职(专科)提前批', '高职(专科)批',
  ];
  const majorBatches = Array.from(new Set(allAdmissions.map((r) => r.batch).filter(Boolean))).sort(
    (a, b) => {
      const ia = BATCH_ORDER.indexOf(a), ib = BATCH_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    },
  );
  const filteredAdmissions = allAdmissions.filter((r) => {
    if (subjectFilter !== '全部' && !(r.subjects || '').includes(subjectFilter)) return false;
    if (natureFilter !== '全部' && r.university?.runningNature !== natureFilter) return false;
    if (batchFilter !== '全部' && r.batch !== batchFilter) return false;
    return true;
  });
  // 透视: 按 (院校, 科类, 批次) 一行, 年份横向平铺对比 (同键同年多条则: 分/位次取最低, 人数/征集求和)
  const allPivotYears: number[] = Array.from(new Set(filteredAdmissions.map((r) => r.year))).sort((a: number, b: number) => b - a).slice(0, 5);
  const pivotYears: number[] = showAllYears ? allPivotYears : allPivotYears.slice(0, 3);
  const pivotMap = new Map<string, any>();
  for (const r of filteredAdmissions) {
    const k = `${r.universityId}|${r.subjects}|${r.batch}`;
    if (!pivotMap.has(k)) {
      pivotMap.set(k, { key: k, universityId: r.universityId, university: r.university, subjects: r.subjects, batch: r.batch, byYear: {} as Record<number, any> });
    }
    const row = pivotMap.get(k);
    const cell = row.byYear[r.year] ?? { score: null, rank: null, count: 0, suppl: 0 };
    if (r.majorMinScore != null && (cell.score == null || r.majorMinScore < cell.score)) cell.score = r.majorMinScore;
    if (r.majorMinRank != null && (cell.rank == null || r.majorMinRank < cell.rank)) cell.rank = r.majorMinRank;
    cell.count += r.majorAdmissionCount ?? 0;
    cell.suppl += r.supplementaryCount ?? 0;
    row.byYear[r.year] = cell;
  }
  const pivotRows = Array.from(pivotMap.values());
  // 默认按最新年最低分降序 (分高的院校在前), 无分数据垫底
  const newestYear = pivotYears[0];
  pivotRows.sort((a, b) => {
    const sa = newestYear != null ? a.byYear[newestYear]?.score ?? null : null;
    const sb = newestYear != null ? b.byYear[newestYear]?.score ?? null : null;
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa;
  });
  // tab 计数 = 全量透视行数 (院校×科类×批次 组合数), 与表格所见一致, 不随筛选变
  const totalPivotCount = new Set(allAdmissions.map((r) => `${r.universityId}|${r.subjects}|${r.batch}`)).size;

  // 同行内与更早一年比较的涨跌标记 (分数涨↑红 / 跌↓绿)
  const diffArrow = (row: any, year: number, field: 'score' | 'count') => {
    const prevYear = pivotYears.find((y) => y < year && row.byYear[y]?.[field] != null);
    const cur = row.byYear[year]?.[field];
    if (prevYear == null || cur == null) return null;
    const prev = row.byYear[prevYear][field];
    if (prev == null || cur === prev) return null;
    return cur > prev
      ? <span className="ml-0.5 text-[10px] text-red-500">↑</span>
      : <span className="ml-0.5 text-[10px] text-green-600">↓</span>;
  };

  const pivotColumns: any[] = [
    {
      title: '院校名称',
      key: 'uni',
      fixed: 'left' as const,
      width: 170,
      render: (_: any, r: any) => (
        <Link href={`/universities/${r.universityId}`} className="text-primary hover:text-primary-light">{r.university?.name}</Link>
      ),
    },
    {
      title: '科类', key: 'subjects', width: 64,
      render: (_: any, r: any) => (
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${(r.subjects || '').includes('物理') ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>{r.subjects}</span>
      ),
    },
    { title: '批次', key: 'batch', width: 118, render: (_: any, r: any) => <span className="text-xs text-text-secondary">{r.batch}</span> },
    ...pivotYears.map((y) => ({
      title: `${y} 年`,
      children: [
        {
          title: '最低分', key: `s${y}`, width: 76, align: 'center' as const,
          sorter: (a: any, b: any) => (a.byYear[y]?.score ?? Infinity) - (b.byYear[y]?.score ?? Infinity),
          render: (_: any, r: any) => {
            const c = r.byYear[y];
            return c?.score != null ? <span className="font-medium text-text">{c.score}{diffArrow(r, y, 'score')}</span> : <span className="text-text-muted">-</span>;
          },
        },
        {
          title: '最低位次', key: `r${y}`, width: 88, align: 'center' as const,
          sorter: (a: any, b: any) => (a.byYear[y]?.rank ?? Infinity) - (b.byYear[y]?.rank ?? Infinity),
          render: (_: any, r: any) => {
            const c = r.byYear[y];
            return c?.rank != null ? <span className="text-text-secondary">{c.rank.toLocaleString()}</span> : <span className="text-text-muted">-</span>;
          },
        },
        {
          title: '录取', key: `c${y}`, width: 76, align: 'center' as const,
          render: (_: any, r: any) => {
            const c = r.byYear[y];
            if (!c || (!c.count && !c.suppl)) return <span className="text-text-muted">-</span>;
            return (
              <span>
                {c.count || '-'}{diffArrow(r, y, 'count')}
                {c.suppl > 0 && (
                  <Tooltip title={`当年该批次征集志愿（补录）计划 ${c.suppl} 人 — 第一轮未录满`}>
                    <div className="text-[10px] leading-tight text-amber-700" style={{ cursor: 'help' }}>征集 {c.suppl}</div>
                  </Tooltip>
                )}
              </span>
            );
          },
        },
      ],
    })),
  ];

  const filterBtn = (active: boolean) =>
    `rounded px-2.5 py-0.5 text-xs font-medium border ${
      active ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-text-tertiary border-amber-300'
    }`;

  // 空内容 tab 置灰: 与 TrainingTab/CareerTab 内部 Empty 兜底同口径, 避免点进去才发现空白
  const filled = (v: any) =>
    Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null;
  const hasTraining = [
    m.trainingObjective, m.trainingRequirements, m.disciplineReq, m.knowledgeAbility,
    m.similarMajors, m.professionalCerts, m.famousPeople, m.internshipDesc, m.postUpgradeDirection,
  ].some(filled);
  const hasCareer = [
    m.careerDirections, m.postgraduateDirections, m.coreCourses, m.avgSalary,
    m.topRegion, m.topIndustry, m.employmentRanking, m.employmentRankingDesc,
    m.employmentDirectionDesc, m.historicalSalary, m.salaryDistribution,
    m.experienceDistribution, m.educationDistribution, m.regionDistribution,
    m.industryDistribution, m.positionTop, m.yearSalaryMap,
  ].some(filled);

  const tabItems = [
    {
      key: 'universities',
      label: <span><BankOutlined className="mr-1" />开设院校 ({planUniCount})</span>,
      children: (
        <div className="px-4 py-2">
          <LowConfidenceBanner
            show={uniqPlans.some((ep: any) => ep.predictedMinRank?.confidence === 'low')}
          />
          {uniqPlans.length === 0 ? (
            <div className="text-center text-text-muted py-12">暂无开设院校数据</div>
          ) : (
            uniqPlans.map((ep: any) => (
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
                  year: ep.year ?? null,
                  planCount: ep.planCount ?? null,
                  tuition: ep.tuition ?? null,
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
      label: <span><HistoryOutlined className="mr-1" />历年录取 ({totalPivotCount})</span>,
      children: (
        <div>
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            {(['全部', '物理', '历史'] as const).map((sv) => {
              const count = sv === '全部' ? allAdmissions.length
                : allAdmissions.filter((r) => (r.subjects || '').includes(sv)).length;
              return (
                <button key={sv} type="button" className={filterBtn(subjectFilter === sv)} onClick={() => setSubjectFilter(sv)}>
                  {sv === '全部' ? '全部科类' : `${sv}类`}{sv !== '全部' ? ` ${count}` : ''}
                </button>
              );
            })}
            <span className="mx-1 text-border">|</span>
            {(['全部', '公办', '民办'] as const).map((nv) => (
              <button key={nv} type="button" className={filterBtn(natureFilter === nv)} onClick={() => setNatureFilter(nv)}>
                {nv === '全部' ? '全部院校' : nv}
              </button>
            ))}
            {majorBatches.length > 1 && (
              <>
                <span className="mx-1 text-border">|</span>
                <button type="button" className={filterBtn(batchFilter === '全部')} onClick={() => setBatchFilter('全部')}>
                  全部批次
                </button>
                {majorBatches.map((b) => (
                  <button key={b} type="button" className={filterBtn(batchFilter === b)} onClick={() => setBatchFilter(b)}>
                    {b}
                  </button>
                ))}
              </>
            )}
            {allPivotYears.length > 3 && (
              <button type="button" className={filterBtn(showAllYears)} onClick={() => setShowAllYears(!showAllYears)}>
                {showAllYears ? '收起早年' : `更早年份 +${allPivotYears.length - 3}`}
              </button>
            )}
            <span className="ml-auto text-xs text-text-muted">{pivotRows.length} 行</span>
          </div>
          <Table
            columns={pivotColumns}
            dataSource={pivotRows}
            rowKey="key"
            scroll={{ x: 380 + pivotYears.length * 240 }}
            size="small"
            bordered
            pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 行` }}
          />
        </div>
      ),
    },
    {
      key: 'training',
      disabled: !hasTraining,
      label: (
        <span className={hasTraining ? undefined : 'text-text-faint'}>
          <ReadOutlined className="mr-1" />培养方案{hasTraining ? '' : ' · 待补充'}
        </span>
      ),
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
      disabled: !hasCareer,
      label: (
        <span className={hasCareer ? undefined : 'text-text-faint'}>
          <RocketOutlined className="mr-1" />就业与发展{hasCareer ? '' : ' · 待补充'}
        </span>
      ),
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
        <div className="relative mx-auto grid max-w-[1440px] gap-6 px-4 py-9 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end lg:px-12">
          <div className="min-w-0">
            <nav className="mb-3 text-xs text-white/50">
              <Link href="/majors" className="text-white/60 no-underline hover:text-white">
                专业库
              </Link>
              <span className="mx-2">/</span>
              {m.category && (
                <>
                  <Link
                    href={`/majors?category=${encodeURIComponent(m.category)}${m.level ? `&level=${encodeURIComponent(m.level)}` : ''}`}
                    className="text-white/60 no-underline hover:text-white"
                  >
                    {m.category}
                  </Link>
                  <span className="mx-2">/</span>
                </>
              )}
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
            {/* 本/专科同名专业层次切换: 双目录同名(如中医学)时显示, 点击跳兄弟层次 */}
            {m.sibling && (
              <div className="mt-3 inline-flex overflow-hidden rounded-lg border border-white/25 text-sm">
                {(['本科', '专科'] as const).map((lv) => {
                  const active = m.level === lv;
                  const targetId = active ? m.id : m.sibling.id;
                  return active ? (
                    <span key={lv} className="bg-accent px-4 py-1.5 font-medium text-white">{lv}</span>
                  ) : (
                    <Link key={lv} href={`/majors/${targetId}`} className="bg-white/10 px-4 py-1.5 text-white/75 hover:bg-white/20 hover:text-white">
                      {lv}
                    </Link>
                  );
                })}
                <span className="bg-white/10 px-3 py-1.5 text-[11px] text-white/55">本专科均在招生</span>
              </div>
            )}
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

      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-12">
        <main className="min-w-0">
          <MajorSummary
            whatIs={m.whatIs ?? null}
            electiveAdvice={m.electiveAdvice ?? null}
            avgSalary={m.avgSalary ?? null}
            setupYear={m.setupYear ?? null}
            industryDistribution={m.industryDistribution ?? null}
            employmentRanking={m.employmentRanking ?? null}
          />

          {/* 招录数据是本页核心诉求 (哪些学校在川招/多少分/招几人), 置于介绍类内容之前 */}
          <section className="mb-6 rounded-2xl bg-surface p-2 shadow-card">
            <Tabs items={tabItems} style={{ padding: '0 18px' }} />
          </section>

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
              {m.standardDuration && <Descriptions.Item label="学制"><DurationLabel value={m.standardDuration} /></Descriptions.Item>}
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

          {relatedMajors.length > 0 && (
            <section className="rounded-2xl bg-surface p-5 shadow-card sm:p-6">
              <div className="mb-1 text-[11px] uppercase tracking-[1.5px] text-accent">Related · 同类专业</div>
              <h2 className="m-0 mb-4 font-serif text-lg font-semibold text-text">
                {m.discipline} · 其他{m.level}专业
              </h2>
              <div className="flex flex-wrap gap-2">
                {relatedMajors.map((r: any) => (
                  <Link
                    key={r.id}
                    href={`/majors/${r.id}`}
                    className="rounded-full border border-border bg-bg px-3.5 py-1.5 text-[13px] text-text-secondary no-underline transition-colors hover:border-primary hover:text-primary"
                  >
                    {r.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </MainLayout>
  );
}
