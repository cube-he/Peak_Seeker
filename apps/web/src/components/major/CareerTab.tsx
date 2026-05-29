'use client';
import { Tag, Typography, Divider, Empty, Statistic, Row, Col, Tooltip } from 'antd';
import LazyEChart from '@/components/ui/LazyEChart';

const { Title } = Typography;

interface NamePercent {
  name: string;
  percent: number;
}

interface YearSalary {
  year: number;
  salary: number;
}

interface YearsSalary {
  years: string;
  salary: number;
}

interface Props {
  // 老字段（保留）
  careerDirections?: string[] | null;
  postgraduateDirections?: string[] | null;
  coreCourses?: string[] | null;
  // P3 新增
  avgSalary?: number | null;
  topRegion?: string | null;
  topIndustry?: string | null;
  employmentRanking?: string | null;
  employmentRankingDesc?: string | null;
  employmentDirectionDesc?: string | null;
  historicalSalary?: YearSalary[] | null;
  salaryDistribution?: NamePercent[] | null;
  experienceDistribution?: NamePercent[] | null;
  educationDistribution?: NamePercent[] | null;
  regionDistribution?: NamePercent[] | null;
  industryDistribution?: NamePercent[] | null;
  positionTop?: string[] | null;
  yearSalaryMap?: YearsSalary[] | null;
}

const MAX_CAREER_TAGS = 12;

function PercentList({ title, items, max = 10 }: { title: string; items: NamePercent[]; max?: number }) {
  const sorted = [...items].sort((a, b) => b.percent - a.percent).slice(0, max);
  const maxPct = sorted[0]?.percent ?? 1;
  return (
    <div>
      <div className="text-text-tertiary text-xs mb-2">{title}</div>
      <div className="space-y-1.5">
        {sorted.map((it) => (
          <div key={it.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-24 truncate" title={it.name}>{it.name}</span>
            <div className="flex-1 h-2 rounded-full bg-bg-subtle overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.max(2, (it.percent / maxPct) * 100)}%` }}
              />
            </div>
            <span className="font-mono tabular-nums text-text-tertiary w-12 text-right">
              {it.percent.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildSalaryLineOption(history: YearSalary[]) {
  const sorted = [...history].sort((a, b) => a.year - b.year);
  return {
    grid: { left: 50, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis' as const, valueFormatter: (v: any) => `¥${v}` },
    xAxis: { type: 'category' as const, data: sorted.map((d) => String(d.year)) },
    yAxis: {
      type: 'value' as const,
      name: '月薪 (¥)',
      nameTextStyle: { fontSize: 11 },
    },
    series: [
      {
        type: 'line' as const,
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: '#1f77b4' },
        areaStyle: { opacity: 0.15 },
        data: sorted.map((d) => d.salary),
      },
    ],
  };
}

export default function CareerTab(p: Props) {
  const hasCareer = p.careerDirections && p.careerDirections.length > 0;
  const hasPostgrad = p.postgraduateDirections && p.postgraduateDirections.length > 0;
  const hasCourses = p.coreCourses && p.coreCourses.length > 0;
  const hasStats =
    p.avgSalary != null || p.topRegion || p.topIndustry || p.employmentRanking;
  const hasSalaryHistory = p.historicalSalary && p.historicalSalary.length > 0;
  const hasDistributions =
    (p.salaryDistribution && p.salaryDistribution.length > 0) ||
    (p.experienceDistribution && p.experienceDistribution.length > 0) ||
    (p.educationDistribution && p.educationDistribution.length > 0);
  const hasRegions = p.regionDistribution && p.regionDistribution.length > 0;
  const hasIndustries = p.industryDistribution && p.industryDistribution.length > 0;
  const hasPositions = p.positionTop && p.positionTop.length > 0;
  const hasYearSalary = p.yearSalaryMap && p.yearSalaryMap.length > 0;

  // 从行业 / 岗位数据提炼「就业方向」一句话结论
  const employmentSummary = (() => {
    const parts: string[] = [];
    const ind = p.topIndustry || p.industryDistribution?.[0]?.name;
    if (ind) parts.push(`主要进入 ${ind} 等行业`);
    if (p.positionTop && p.positionTop.length > 0) {
      parts.push(`从事 ${p.positionTop.slice(0, 3).join('、')} 等岗位`);
    }
    return parts.length > 0 ? `毕业生${parts.join('，')}。` : null;
  })();

  // 历年薪资趋势结论
  const salaryTrend = (() => {
    if (!p.historicalSalary || p.historicalSalary.length < 2) return null;
    const sorted = [...p.historicalSalary].sort((a, b) => a.year - b.year);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return `薪资水平从 ${first.year} 年约 ¥${first.salary.toLocaleString()} 升至 ${last.year} 年约 ¥${last.salary.toLocaleString()}。`;
  })();

  const anything =
    hasCareer || hasPostgrad || hasCourses || hasStats || hasSalaryHistory ||
    hasDistributions || hasRegions || hasIndustries || hasPositions || hasYearSalary;
  if (!anything) {
    return <Empty description="暂无就业与发展数据" className="py-10" />;
  }

  return (
    <div className="py-4 space-y-5">
      {hasStats && (
        <section>
          <Row gutter={[16, 16]}>
            {p.avgSalary != null && (
              <Col xs={12} sm={6}>
                <Statistic title="平均月薪" value={p.avgSalary} prefix="¥" />
              </Col>
            )}
            {p.topRegion && (
              <Col xs={12} sm={6}>
                <Statistic title="就业最多地区" value={p.topRegion} />
              </Col>
            )}
            {p.topIndustry && (
              <Col xs={12} sm={6}>
                <Statistic title="就业最多行业" value={p.topIndustry} />
              </Col>
            )}
            {p.employmentRanking && (
              <Col xs={12} sm={6}>
                <Tooltip title={p.employmentRankingDesc ?? undefined}>
                  <div>
                    <Statistic title="就业排名" value={p.employmentRanking} />
                  </div>
                </Tooltip>
              </Col>
            )}
          </Row>
        </section>
      )}

      {employmentSummary && (
        <section className="rounded-lg bg-primary-fixed p-3 text-[13px] font-medium leading-6 text-primary">
          {employmentSummary}
        </section>
      )}

      {p.employmentDirectionDesc && (
        <section className="rounded-lg bg-bg-subtle p-3 text-[13px] leading-6 text-text-secondary">
          {p.employmentDirectionDesc}
        </section>
      )}

      {hasSalaryHistory && (
        <section>
          <Title level={5} className="!mb-2">历年薪资走势</Title>
          {salaryTrend && (
            <p className="m-0 mb-2 text-[13px] text-text-secondary">{salaryTrend}</p>
          )}
          <LazyEChart option={buildSalaryLineOption(p.historicalSalary!)} height={240} />
        </section>
      )}

      {hasYearSalary && (
        <section>
          <Title level={5} className="!mb-3">工作年限对应工资</Title>
          <Row gutter={[12, 12]}>
            {p.yearSalaryMap!.map((it) => (
              <Col key={it.years} xs={12} sm={8} md={6}>
                <Statistic title={it.years} value={it.salary} prefix="¥" />
              </Col>
            ))}
          </Row>
        </section>
      )}

      {hasDistributions && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {p.salaryDistribution && p.salaryDistribution.length > 0 && (
            <PercentList title="工资段分布" items={p.salaryDistribution} />
          )}
          {p.experienceDistribution && p.experienceDistribution.length > 0 && (
            <PercentList title="工作经验分布" items={p.experienceDistribution} />
          )}
          {p.educationDistribution && p.educationDistribution.length > 0 && (
            <PercentList title="学历要求分布" items={p.educationDistribution} />
          )}
        </section>
      )}

      {(hasRegions || hasIndustries) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hasRegions && <PercentList title="就业地区 TOP" items={p.regionDistribution!} />}
          {hasIndustries && <PercentList title="就业行业 TOP" items={p.industryDistribution!} />}
        </section>
      )}

      {hasPositions && (
        <section>
          <Title level={5} className="!mb-2">主要从事岗位</Title>
          <div className="flex flex-wrap gap-1.5">
            {p.positionTop!.slice(0, 30).map((pos) => (
              <Tag key={pos}>{pos}</Tag>
            ))}
            {p.positionTop!.length > 30 && (
              <Tag>+{p.positionTop!.length - 30} 更多</Tag>
            )}
          </div>
        </section>
      )}

      {(hasCareer || hasPostgrad || hasCourses) && <Divider className="!my-3" />}

      {hasCareer && (
        <section>
          <Title level={5} className="!mb-2">主要职业方向</Title>
          <div className="flex flex-wrap gap-2">
            {p.careerDirections!.slice(0, MAX_CAREER_TAGS).map((d) => (
              <Tag key={d} color="blue">{d}</Tag>
            ))}
            {p.careerDirections!.length > MAX_CAREER_TAGS && (
              <Tag color="blue">+{p.careerDirections!.length - MAX_CAREER_TAGS} 更多</Tag>
            )}
          </div>
        </section>
      )}

      {hasPostgrad && (
        <section>
          <Title level={5} className="!mb-2">考研方向</Title>
          <div className="flex flex-wrap gap-2">
            {p.postgraduateDirections!.map((d) => (
              <Tag key={d} color="purple">{d}</Tag>
            ))}
          </div>
        </section>
      )}

      {hasCourses && (
        <section>
          <Title level={5} className="!mb-2">核心课程</Title>
          <div className="flex flex-wrap gap-2">
            {p.coreCourses!.map((c) => (
              <Tag key={c}>{c}</Tag>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
