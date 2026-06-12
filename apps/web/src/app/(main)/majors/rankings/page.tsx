'use client';

/**
 * 专业排行榜: 考公友好 / 热度 / 录取分 / 招生计划 / 征集捡漏 / 薪酬 / 就业率 / 满意度。
 * 数据全部来自 majors 表物化列(GET /majors/rankings), 默认只看在川有招生的专业。
 * 设计原则: 每个榜单的口径一句话讲清(榜单头的说明行), 家长能看懂名次怎么来的。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Spin, Switch, Tooltip } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import MainLayout from '@/components/layout/MainLayout';
import { majorService } from '@/services/major';

const BOARDS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'CIVIL_SERVICE', label: '考公友好', desc: '按 2026 届公务员可报岗位数排序(国考+省考岗位表按专业匹配, 全国口径)。竞争比为报名热度逆指标, 越低越好上岸。' },
  { key: 'POPULARITY', label: '热度', desc: '全国本科专业关注热度榜(上榜 TOP50), 热度值为关注人数。' },
  { key: 'SCORE', label: '录取分', desc: '按在川录取分数带的带顶排序(带顶=该专业录取线最高的院校)。仅统计在川 ≥3 所院校招生的专业, 防单校失真。' },
  { key: 'PLAN', label: '招生计划', desc: '最新计划年在川招生计划人数, 可切物理/历史科类口径。' },
  { key: 'SUPPLEMENTARY', label: '征集捡漏', desc: '最新年征集志愿计划人数。征集多 = 没录满, 征集阶段常有降分机会。' },
  { key: 'SALARY', label: '薪酬', desc: '毕业生平均月薪(全国就业数据)。' },
  // EMPLOYMENT(就业率)榜暂不开放: majors 表 employmentRate 列尚无数据, API 已支持, 数据导入后加回
  { key: 'SATISFACTION', label: '满意度', desc: '在校生/毕业生综合满意度评分, 仅统计评价人数 ≥100 的专业。' },
];

const CS_SUBS = [
  { key: 'JOBS_2026', label: '2026 岗位数' },
  { key: 'JOBS_TOTAL', label: '四年合计' },
  { key: 'COMPETITION', label: '好上岸(竞争比低)' },
];

const LANES = [
  { key: '', label: '全部' },
  { key: 'PHYSICS', label: '物理类' },
  { key: 'HISTORY', label: '历史类' },
];

function wan(n?: number | null): string {
  if (n == null) return '—';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

function fmt(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

/** 考公榜行: 主指标 + 决策辅助指标 + 系统/地区 TOP */
function CivilServiceRow({ m, sub }: { m: any; sub: string }) {
  const competitionHot = (m.csCompetition ?? 0) > 100;
  const lowConfidence = m.csConfidence != null && m.csConfidence < 0.8;
  const trendUp = (m.csTrendDelta ?? 0) > 0;
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-text-secondary">
        <span>
          2026 可报岗位{' '}
          <strong className={`font-serif text-base tabular-nums ${sub === 'JOBS_2026' ? 'text-accent' : 'text-text'}`}>
            {fmt(m.csJobs2026)}
          </strong>
          {m.csTrendDelta != null && m.csTrendDelta !== 0 ? (
            <span className={`ml-1 text-xs ${trendUp ? 'text-safe' : 'text-rush'}`}>
              {trendUp ? '↑' : '↓'}{Math.abs(m.csTrendDelta).toLocaleString()}
              <span className="ml-0.5 text-text-faint">vs 2023</span>
            </span>
          ) : null}
        </span>
        <span>
          四年合计 <strong className={`tabular-nums ${sub === 'JOBS_TOTAL' ? 'text-accent' : ''}`}>{fmt(m.csJobsTotal)}</strong>
        </span>
        <span>
          招考 <strong className="tabular-nums">{fmt(m.csRecruitTotal)}</strong> 人
        </span>
        <Tooltip title="2026 届平均报名竞争比: 多少人抢 1 个岗位。报名热度逆指标, 越低越好上岸">
          <span>
            竞争比{' '}
            <strong className={`tabular-nums ${competitionHot ? 'text-rush' : sub === 'COMPETITION' ? 'text-accent' : ''}`}>
              {m.csCompetition != null ? `${m.csCompetition}:1` : '—'}
            </strong>
            {competitionHot ? <span className="ml-1 text-xs text-rush">拥挤</span> : null}
          </span>
        </Tooltip>
        {m.csScJobs2026 != null ? (
          <Tooltip title="2026 届岗位表中工作地点在四川的可报岗位条目数">
            <span>
              在川岗位 <strong className="tabular-nums text-accent">{fmt(m.csScJobs2026)}</strong>
            </span>
          </Tooltip>
        ) : null}
        {lowConfidence ? (
          <Tooltip title={`岗位-专业匹配平均置信度 ${m.csConfidence}, 部分按专业大类匹配, 数字仅供参考`}>
            <span className="rounded bg-bg px-1.5 py-0.5 text-xs text-text-muted">参考</span>
          </Tooltip>
        ) : null}
      </div>
      {m.csSystemTop3 || m.csRegionTop3 ? (
        <div className="text-xs text-text-faint">
          {m.csSystemTop3 ? <>主要系统: {m.csSystemTop3}</> : null}
          {m.csSystemTop3 && m.csRegionTop3 ? ' · ' : ''}
          {m.csRegionTop3 ? <>岗位最多地区: {m.csRegionTop3}</> : null}
        </div>
      ) : null}
    </div>
  );
}

/** 其余榜单的右侧主指标 */
function BoardMetric({ m, board, examType }: { m: any; board: string; examType: string }) {
  switch (board) {
    case 'POPULARITY':
      return (
        <span className="text-[13px] text-text-secondary">
          热度 <strong className="font-serif text-base tabular-nums text-accent">{wan(m.popularityHeat)}</strong>
          <span className="ml-2 text-xs text-text-faint">全国 #{m.popularityRank}</span>
        </span>
      );
    case 'SCORE': {
      const lo = examType === 'HISTORY' ? m.scHisScoreLo : m.scPhyScoreLo;
      const hi = examType === 'HISTORY' ? m.scHisScoreHi : m.scPhyScoreHi;
      return (
        <span className="text-[13px] text-text-secondary">
          在川分数带{' '}
          <strong className="font-serif text-base tabular-nums text-accent">
            {lo != null && hi != null ? (lo === hi ? lo : `${lo}~${hi}`) : '—'}
          </strong>
          <span className="ml-2 text-xs text-text-faint">{m.scPlanUnis ?? '—'} 校 · {m.scScoreYear ?? ''}</span>
        </span>
      );
    }
    case 'PLAN': {
      const n = examType === 'PHYSICS' ? m.scPhyPlanCount : examType === 'HISTORY' ? m.scHisPlanCount : m.scPlanCount;
      return (
        <span className="text-[13px] text-text-secondary">
          在川计划 <strong className="font-serif text-base tabular-nums text-accent">{fmt(n)}</strong> 人
          <span className="ml-2 text-xs text-text-faint">{m.scPlanUnis ?? '—'} 校 · {m.scPlanYear ?? ''}</span>
        </span>
      );
    }
    case 'SUPPLEMENTARY':
      return (
        <span className="text-[13px] text-text-secondary">
          征集 <strong className="font-serif text-base tabular-nums text-accent">{fmt(m.scSupplCount)}</strong> 人
        </span>
      );
    case 'SALARY':
      return (
        <span className="text-[13px] text-text-secondary">
          平均月薪 <strong className="font-serif text-base tabular-nums text-accent">¥{fmt(m.avgSalary)}</strong>
        </span>
      );
    case 'EMPLOYMENT':
      return (
        <span className="text-[13px] text-text-secondary">
          就业率 <strong className="font-serif text-base tabular-nums text-accent">{m.employmentRate != null ? `${m.employmentRate}%` : '—'}</strong>
        </span>
      );
    case 'SATISFACTION':
      return (
        <span className="text-[13px] text-text-secondary">
          满意度 <strong className="font-serif text-base tabular-nums text-accent">{m.satisfactionScore ?? '—'}</strong>
          <span className="ml-2 text-xs text-text-faint">{fmt(m.satisfactionOverallCount)} 人评价</span>
        </span>
      );
    default:
      return null;
  }
}

export default function MajorRankingsPage() {
  const [board, setBoard] = useState('CIVIL_SERVICE');
  const [sub, setSub] = useState('JOBS_2026');
  const [examType, setExamType] = useState('');
  const [scopeAll, setScopeAll] = useState(false);

  const showLane = board === 'SCORE' || board === 'PLAN';
  // 分数榜必须选定科类(物理/历史分数不可混排), 默认物理
  const effectiveExamType = board === 'SCORE' && !examType ? 'PHYSICS' : examType;

  const { data, isFetching } = useQuery({
    queryKey: ['major-rankings', board, sub, effectiveExamType, scopeAll],
    queryFn: () => majorService.getRankings({
      board,
      sub: board === 'CIVIL_SERVICE' ? sub : undefined,
      examType: showLane ? (effectiveExamType || undefined) : undefined,
      scope: scopeAll ? 'ALL' : 'SC',
      limit: 50,
    }),
  });
  const payload = (data as any)?.data ?? data;
  const list: any[] = payload?.list ?? [];
  const activeBoard = BOARDS.find((b) => b.key === board)!;

  return (
    <MainLayout>
      <div className="pb-12">
        <div className="mb-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            Major Rankings · 专业排行榜
          </div>
          <h1 className="m-0 font-serif text-[32px] font-semibold leading-tight text-text sm:text-[36px]">
            {activeBoard.label}榜
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-text-tertiary">{activeBoard.desc}</p>
          <Link href="/majors" className="mt-2 inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary">
            <ArrowLeftOutlined /> 返回专业库
          </Link>
        </div>

        {/* 榜单切换 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {BOARDS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => { setBoard(b.key); if (b.key !== 'SCORE' && b.key !== 'PLAN') setExamType(''); }}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                board === b.key
                  ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'bg-bg text-text-tertiary hover:text-primary'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* 二级口径: 考公副排序 / 科类 / 范围 */}
        <div className="mb-5 flex flex-wrap items-center gap-4 text-sm">
          {board === 'CIVIL_SERVICE' ? (
            <div className="flex items-center gap-2">
              {CS_SUBS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSub(s.key)}
                  className={`rounded px-3 py-1 text-xs transition ${
                    sub === s.key ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'bg-bg text-text-tertiary hover:text-primary'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          {showLane ? (
            <div className="flex items-center gap-2">
              {LANES.filter((l) => board !== 'SCORE' || l.key !== '').map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setExamType(l.key)}
                  className={`rounded px-3 py-1 text-xs transition ${
                    effectiveExamType === l.key ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'bg-bg text-text-tertiary hover:text-primary'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          ) : null}
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Switch size="small" checked={!scopeAll} onChange={(on) => setScopeAll(!on)} />
            只看在川有招生
          </span>
          {board === 'CIVIL_SERVICE' ? (
            <span className="text-xs text-text-faint">考公数据仅覆盖本科专业 · 岗位数为全国口径</span>
          ) : null}
        </div>

        {/* 榜单列表 */}
        <Spin spinning={isFetching}>
          <div className="overflow-hidden rounded-xl border border-black/5 bg-surface shadow-card">
            {list.length === 0 && !isFetching ? (
              <div className="p-10 text-center text-sm text-text-muted">该榜单暂无数据</div>
            ) : (
              list.map((m, i) => (
                <Link
                  key={m.id}
                  href={`/majors/${m.id}`}
                  className="flex items-start gap-4 border-b border-black/5 px-5 py-3.5 transition last:border-b-0 hover:bg-bg"
                >
                  <span
                    className={`mt-0.5 w-9 shrink-0 text-center font-serif text-lg font-semibold tabular-nums ${
                      i < 3 ? 'text-accent' : 'text-text-faint'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text">{m.name}</span>
                      {m.code ? <span className="text-xs text-text-faint">{m.code}</span> : null}
                      {m.category ? (
                        <span className="rounded bg-bg px-1.5 py-0.5 text-xs text-text-tertiary">{m.category}</span>
                      ) : null}
                      {m.scPlanCount ? (
                        <span className="text-xs text-text-faint">在川 {m.scPlanUnis ?? '—'} 校 · 计划 {m.scPlanCount.toLocaleString()} 人</span>
                      ) : (
                        <span className="text-xs text-text-faint">在川暂无招生</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-start justify-between gap-4">
                      {board === 'CIVIL_SERVICE' ? (
                        <CivilServiceRow m={m} sub={sub} />
                      ) : (
                        <BoardMetric m={m} board={board} examType={effectiveExamType} />
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Spin>
      </div>
    </MainLayout>
  );
}
