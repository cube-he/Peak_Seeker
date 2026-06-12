'use client';
import { useMemo, useState } from 'react';
import UniversityRankBanner from './UniversityRankBanner';
import BatchSubjectSwitcher from './BatchSubjectSwitcher';
import GroupCard from './GroupCard';
import { categorizeBatch } from '@/utils/batch-categorize';
import { groupAdmissions, type GroupedAdmission } from '@/utils/group-admissions';
import { classifyRank, getTier, isHistorical } from '@/utils/classify-rank';
import { pickScoreRank } from '@/app/(main)/universities/lib/admission';
import type { Subject } from './types';

interface Props {
  universityId: number;
  universityFlags: { is985: boolean; is211: boolean };
  /** 由 service findAdmissions 返回的 raw rows (含 extras chip 字段) */
  rawAdmissions: any[];
  /** University 表上的院校层最低分位次（已透传） */
  universityScores: {
    minScorePhysics: number | null;
    minRankPhysics: number | null;
    minScoreHistory: number | null;
    minRankHistory: number | null;
  };
  /** 生效位次: 工作台学生 ?? 手填 (由页面统一计算注入, 不再各自读 store) */
  userRank: number | null;
  /** 受控科类: 页级单一开关, 与走势图/统计条联动 */
  subject: Subject;
  onSubjectChange: (s: Subject) => void;
}

/** 2025 四川批次结构表的标准批次序（投档顺序）。数据里出现的新批次会追加在尾部。 */
const STANDARD_BATCHES = [
  '本科提前批(国家专项)',
  '本科提前批A段',
  '本科提前批(高校专项)',
  '本科提前批B段',
  '本科批A段',
  '本科批(高校专项)',
  '本科批B段',
  '本科批(区域教育均衡发展专项)',
  '高职(专科)提前批',
  '高职(专科)批',
] as const;

/** 批次说明（批次结构表的招生类型/志愿设置摘要） */
const BATCH_HINTS: Record<string, string> = {
  '本科提前批(国家专项)': '国家专项计划 · 2个平行志愿',
  '本科提前批A段': '军事/飞行/公安司法/航海/消防/综评等 · 3个志愿',
  '本科提前批(高校专项)': '高校专项计划 · 1个顺序志愿',
  '本科提前批B段': '公费师范/优师/农村医学/乡村振兴等 · 30个平行志愿',
  '本科批A段': '国家专项/地方专项 · 20个平行志愿',
  '本科批(高校专项)': '高校专项计划 · 2个志愿',
  '本科批B段': '普通类本科主批次 · 45个平行志愿',
  '本科批(区域教育均衡发展专项)': '三州七县一区 · 20个平行志愿',
  '高职(专科)提前批': '定向军士/公安司法/航海 · 3个志愿',
  '高职(专科)批': '普通类高职(专科) · 45个平行志愿',
};

function formatDiff(diff: number, isAhead: boolean): string {
  const abs = Math.abs(diff).toLocaleString();
  return isAhead ? `高出 ${abs} 名` : `差 ${abs} 名`;
}

export default function AdmissionDetailTab({
  universityFlags,
  rawAdmissions,
  universityScores,
  userRank,
  subject,
  onSubjectChange,
}: Props) {
  // 科类数据可用性: 空科类的切换按钮禁用 (与走势图同款逻辑)
  const physicsAvailable = useMemo(
    () => (rawAdmissions ?? []).some(r => !isHistorical(r.subjects)),
    [rawAdmissions],
  );
  const historyAvailable = useMemo(
    () => (rawAdmissions ?? []).some(r => isHistorical(r.subjects)),
    [rawAdmissions],
  );

  // 1. 全聚合一次（按 (year, subjects, batch, groupCode)）
  const allGroups: GroupedAdmission[] = useMemo(() => groupAdmissions(rawAdmissions ?? []), [rawAdmissions]);

  // 2. 当前科类下的组
  const subjectGroups = useMemo(
    () => allGroups.filter(g =>
      (subject === '物理类' && !isHistorical(g.subjects)) || (subject === '历史类' && isHistorical(g.subjects))
    ),
    [allGroups, subject]
  );

  // 3. Banner：本科整体（无本科数据的高职院校退回高职口径）
  const bannerCategory = useMemo(() => {
    const hasUndergrad = (rawAdmissions ?? []).some(r => categorizeBatch(r.batch) !== '高职专科');
    return hasUndergrad ? '本科批' : '高职专科';
  }, [rawAdmissions]);

  const bannerInput = useMemo(() => {
    const rawsInScope = (rawAdmissions ?? []).filter(r =>
      ((subject === '物理类' && !isHistorical(r.subjects)) || (subject === '历史类' && isHistorical(r.subjects))) &&
      categorizeBatch(r.batch) === bannerCategory
    );
    // 每年取最低门槛: pickScoreRank 四口径兜底 (filing>university>group>major)。
    // 此前只读恒空的 universityMinRank, banner 常年显示 '—' 且物化列 fallback 永不可达
    const byYear = new Map<number, { score: number | null; rank: number | null }>();
    for (const r of rawsInScope) {
      const sr = pickScoreRank(r);
      if (!sr || !r.year) continue;
      const cur = byYear.get(r.year);
      if (!cur || cur.score == null || sr.score < cur.score) {
        byYear.set(r.year, { score: sr.score, rank: sr.rank });
      }
    }
    const sorted = Array.from(byYear.entries()).sort(([a], [b]) => b - a);
    if (sorted.length === 0) {
      if (bannerCategory === '本科批') {
        const score = subject === '物理类' ? universityScores.minScorePhysics : universityScores.minScoreHistory;
        const rank = subject === '物理类' ? universityScores.minRankPhysics : universityScores.minRankHistory;
        if (rank != null || score != null) {
          return { latestYear: null, latestUniversityMinScore: score, latestUniversityMinRank: rank, trendYears: [] };
        }
      }
      return { latestYear: null, latestUniversityMinScore: null, latestUniversityMinRank: null, trendYears: [] };
    }
    const [latestYear, latest] = sorted[0];
    return {
      latestYear,
      latestUniversityMinScore: latest.score,
      latestUniversityMinRank: latest.rank,
      trendYears: sorted.slice(1, 4).map(([y, v]) => ({ year: y, universityMinScore: v.score, universityMinRank: v.rank })),
    };
  }, [rawAdmissions, subject, bannerCategory, universityScores]);

  // 4. 院校层 tier
  const universityTier = useMemo(() => {
    if (userRank == null) return 'unknown' as const;
    if (bannerInput.latestUniversityMinRank == null) return 'unknown' as const;
    const baseTier = getTier({
      is985: universityFlags.is985,
      is211: universityFlags.is211,
      batch: bannerCategory === '高职专科' ? '高职(专科)批' : '本科批',
    });
    return classifyRank(userRank, bannerInput.latestUniversityMinRank, baseTier, subject === '历史类');
  }, [userRank, bannerInput, universityFlags, bannerCategory, subject]);

  const universityDiffText = useMemo(() => {
    if (userRank == null || bannerInput.latestUniversityMinRank == null) return null;
    const diff = bannerInput.latestUniversityMinRank - userRank;
    return formatDiff(diff, diff > 0);
  }, [userRank, bannerInput]);

  // 5. 同 (subjects, batch, recruitType, groupCode) 跨年映射 — 给 GroupCard 用
  const multiYearByGroup = useMemo(() => {
    const m = new Map<string, GroupedAdmission[]>();
    for (const g of allGroups) {
      const k = `${g.subjects}|${g.batch}|${g.recruitType}|${g.groupCode}`;
      const arr = m.get(k) ?? [];
      arr.push(g);
      m.set(k, arr);
    }
    return m;
  }, [allGroups]);

  // 6. 按批次结构表分桶：batch → 跨年去重后的卡片列表
  const batchBuckets = useMemo(() => {
    const buckets = new Map<string, GroupedAdmission[]>();
    const seen = new Set<string>();
    for (const g of subjectGroups) {
      const k = `${g.subjects}|${g.batch}|${g.recruitType}|${g.groupCode}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const arr = buckets.get(g.batch) ?? [];
      arr.push(g);
      buckets.set(g.batch, arr);
    }
    // 标准批次在前（含无数据的，灰显），数据里出现的非标准批次名追加尾部
    const ordered: Array<{ batch: string; cards: GroupedAdmission[] }> = [];
    for (const b of STANDARD_BATCHES) {
      ordered.push({ batch: b, cards: buckets.get(b) ?? [] });
    }
    for (const [b, cards] of buckets) {
      if (!STANDARD_BATCHES.includes(b as any)) ordered.push({ batch: b, cards });
    }
    return ordered;
  }, [subjectGroups]);

  // 7. 展开状态：默认展开第一个有数据的批次
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const firstWithData = useMemo(
    () => batchBuckets.find(b => b.cards.length > 0)?.batch ?? null,
    [batchBuckets],
  );
  const isExpanded = (batch: string) =>
    expanded.has(batch) || (expanded.size === 0 && batch === firstWithData);
  const toggle = (batch: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      // 首次交互时把默认展开项固化进 state，避免 toggle 后状态跳变
      if (prev.size === 0 && firstWithData) next.add(firstWithData);
      if (next.has(batch)) next.delete(batch);
      else next.add(batch);
      return next;
    });
  };

  // 组级 tier (荐组与排序共用)
  const tierOf = (g: GroupedAdmission) =>
    userRank == null || g.groupMinRank == null
      ? ('unknown' as const)
      : classifyRank(
          userRank,
          g.groupMinRank,
          getTier({ is985: universityFlags.is985, is211: universityFlags.is211, batch: g.batch }),
          isHistorical(g.subjects),
        );

  // 8.「为学生荐组」: 老师的核心问题是"报这学校报哪个组" — 系统把 22 张卡的扫描工作做掉,
  //    冲/稳/保各取位次最接近的 2 个, 点击直达对应组卡
  const recommendations = useMemo(() => {
    if (userRank == null) return null;
    const cards = batchBuckets.flatMap(b => b.cards);
    const out: Record<'rush' | 'stable' | 'safe', Array<{ g: GroupedAdmission; diff: number }>> = {
      rush: [], stable: [], safe: [],
    };
    for (const g of cards) {
      if (g.groupMinRank == null) continue;
      const t = tierOf(g);
      const slot = t === 'elite' ? 'safe' : t; // 远超线归入"保"
      if (slot === 'rush' || slot === 'stable' || slot === 'safe') {
        out[slot].push({ g, diff: g.groupMinRank - userRank });
      }
    }
    for (const k of ['rush', 'stable', 'safe'] as const) {
      out[k].sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
      out[k] = out[k].slice(0, 2);
    }
    return out.rush.length + out.stable.length + out.safe.length > 0 ? out : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRank, batchBuckets, universityFlags]);

  const groupAnchor = (g: GroupedAdmission) =>
    `adm-group-${g.subjects}-${g.batch}-${g.recruitType}-${g.groupCode}`;
  const jumpToGroup = (g: GroupedAdmission) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (prev.size === 0 && firstWithData) next.add(firstWithData);
      next.add(g.batch);
      return next;
    });
    setTimeout(() => {
      document.getElementById(groupAnchor(g))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const REC_META = {
    rush: { title: '冲一冲', cls: 'text-red-600', border: 'border-red-200' },
    stable: { title: '稳一稳', cls: 'text-blue-600', border: 'border-blue-200' },
    safe: { title: '保一保', cls: 'text-green-700', border: 'border-green-200' },
  } as const;

  return (
    <div className="py-4">
      <div className="mb-3">
        <BatchSubjectSwitcher
          subject={subject}
          onSubjectChange={onSubjectChange}
          physicsAvailable={physicsAvailable}
          historyAvailable={historyAvailable}
        />
      </div>

      <UniversityRankBanner
        subject={subject}
        batchCategory={bannerCategory}
        rankInput={bannerInput}
        tier={universityTier}
        userRank={userRank}
        diffText={universityDiffText}
      />

      {/* 为学生荐组: 冲/稳/保各 2 个位次最接近的组, 点击直达组卡 */}
      {recommendations && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-[10px] tracking-[1.5px] text-amber-800 font-bold mb-2">
            为该位次荐组 · 点击直达专业组
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['rush', 'stable', 'safe'] as const).map(k => (
              <div key={k} className={`rounded border ${REC_META[k].border} bg-white p-2`}>
                <div className={`text-[11px] font-bold mb-1 ${REC_META[k].cls}`}>{REC_META[k].title}</div>
                {recommendations[k].length === 0 ? (
                  <div className="text-[11px] text-text-muted py-1.5">无匹配组</div>
                ) : (
                  recommendations[k].map(({ g, diff }) => (
                    <button
                      key={groupAnchor(g)}
                      type="button"
                      onClick={() => jumpToGroup(g)}
                      className="w-full text-left border-0 bg-transparent cursor-pointer rounded px-1.5 py-1 hover:bg-amber-50"
                    >
                      <div className="text-[12px] font-semibold text-text truncate">
                        组{g.groupCode}{g.groupName ? ` · ${g.groupName}` : ''}
                      </div>
                      <div className="text-[10px] text-text-tertiary">
                        {g.batch} · {g.year} 位次 {g.groupMinRank?.toLocaleString()} ·{' '}
                        {diff > 0 ? `余 ${diff.toLocaleString()}` : `差 ${Math.abs(diff).toLocaleString()}`} 名
                      </div>
                    </button>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 按 2025 批次结构表逐批次展示：有数据可展开，无数据灰显 */}
      <div className="flex flex-col gap-2">
        {batchBuckets.map(({ batch, cards }) => {
          const has = cards.length > 0;
          const open = has && isExpanded(batch);
          return (
            <div
              key={batch}
              className={`rounded-lg border ${has ? 'border-amber-200 bg-white' : 'border-gray-200 bg-gray-50'}`}
            >
              <button
                type="button"
                onClick={() => has && toggle(batch)}
                disabled={!has}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left ${
                  has ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className={`text-sm font-semibold ${has ? 'text-text' : 'text-gray-400'}`}>
                    {batch}
                  </span>
                  <span className={`text-[11px] truncate ${has ? 'text-text-tertiary' : 'text-gray-300'}`}>
                    {BATCH_HINTS[batch] ?? ''}
                  </span>
                </span>
                <span className={`text-xs flex-shrink-0 ${has ? 'text-amber-700' : 'text-gray-300'}`}>
                  {has ? `${cards.length} 个专业组 ${open ? '▲' : '▼'}` : '暂无招录数据'}
                </span>
              </button>

              {open && (
                <div className="px-3 pb-3">
                  {(userRank == null
                    ? cards
                    : // 学生模式: 可达的组在前, 够不着的沉底
                      [...cards].sort((a, b) => {
                        const w: Record<string, number> = { stable: 0, safe: 1, rush: 2, elite: 3, unknown: 4, unreachable: 5 };
                        return (w[tierOf(a)] ?? 9) - (w[tierOf(b)] ?? 9);
                      })
                  ).map(g => {
                    const k = `${g.subjects}|${g.batch}|${g.recruitType}|${g.groupCode}`;
                    const multiYears = multiYearByGroup.get(k) ?? [g];
                    const groupTier = tierOf(g);
                    const diff = userRank != null && g.groupMinRank != null ? g.groupMinRank - userRank : null;
                    const diffText = diff != null ? formatDiff(diff, diff > 0) : null;
                    return (
                      <div
                        key={`${g.year}-${k}`}
                        id={groupAnchor(g)}
                        style={groupTier === 'unreachable' ? { opacity: 0.55 } : undefined}
                      >
                        <GroupCard
                          group={g}
                          multiYearGroups={multiYears}
                          tier={groupTier}
                          diffText={diffText}
                          userRank={userRank}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
