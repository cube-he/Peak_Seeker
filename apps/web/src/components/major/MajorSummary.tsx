'use client';

interface NamePercent {
  name: string;
  percent: number;
}

interface Props {
  whatIs?: string | null;
  electiveAdvice?: string | null;
  avgSalary?: number | null;
  setupYear?: number | null;
  industryDistribution?: NamePercent[] | null;
  employmentRanking?: string | null;
}

/** 从「专业是什么」长文本里截一句话定义（首句，最多 ~68 字）。 */
function oneLineDef(whatIs?: string | null): string | null {
  if (!whatIs) return null;
  const first = whatIs.split(/[。！\n]/)[0].trim();
  if (!first) return null;
  return first.length > 68 ? first.slice(0, 68) + '…' : first + '。';
}

/**
 * 专业速览卡——把分散在各处的关键判断点聚成 30 秒认知：
 * 一句话定义 + 选考要求 + 薪资 + 主要就业 + 就业排名 + 增设年份。
 */
export default function MajorSummary(p: Props) {
  const def = oneLineDef(p.whatIs);
  const topIndustry = p.industryDistribution?.[0]?.name ?? null;

  const items: { label: string; value: string; highlight?: boolean }[] = [];
  items.push({ label: '选考要求', value: p.electiveAdvice || '不限选考' });
  if (typeof p.avgSalary === 'number' && p.avgSalary > 0) {
    items.push({ label: '平均薪资', value: `¥${p.avgSalary.toLocaleString()}` });
  }
  if (topIndustry) {
    items.push({ label: '主要就业行业', value: topIndustry });
  }
  if (p.employmentRanking) {
    items.push({ label: '就业排名', value: p.employmentRanking });
  }
  if (typeof p.setupYear === 'number') {
    const emerging = p.setupYear >= 2024;
    items.push({
      label: '增设年份',
      value: emerging ? `${p.setupYear} 年 · 新兴专业` : `${p.setupYear} 年`,
      highlight: emerging,
    });
  }

  if (!def && items.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl bg-surface p-6 shadow-card sm:p-7">
      <div className="mb-3 text-[11px] uppercase tracking-[1.5px] text-accent">
        Quick Look · 专业速览
      </div>
      {def && (
        <p className="m-0 mb-4 text-[15px] font-medium leading-relaxed text-text">{def}</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div
            key={it.label}
            className={`rounded-lg p-3 ${
              it.highlight ? 'bg-accent-fixed' : 'bg-bg-subtle'
            }`}
          >
            <div className="text-[11px] text-text-tertiary">{it.label}</div>
            <div
              className={`mt-1 text-sm font-semibold ${
                it.highlight ? 'text-accent' : 'text-text'
              }`}
            >
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
