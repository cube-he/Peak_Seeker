'use client';
import { useMemo, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import UniversityRankBanner from './UniversityRankBanner';
import BatchSubjectSwitcher from './BatchSubjectSwitcher';
import GroupCard from './GroupCard';
import { categorizeBatch, type BatchCategory } from '@/utils/batch-categorize';
import { groupAdmissions, type GroupedAdmission } from '@/utils/group-admissions';
import { classifyRank, getTier, isHistorical } from '@/utils/classify-rank';
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
}

function pickDefaultSubject(userSubjects?: string): Subject {
  if (userSubjects && /历史|文/.test(userSubjects)) return '历史类';
  return '物理类';
}

function formatDiff(diff: number, isAhead: boolean): string {
  const abs = Math.abs(diff).toLocaleString();
  return isAhead ? `高出 ${abs} 名` : `差 ${abs} 名`;
}

export default function AdmissionDetailTab({
  universityFlags,
  rawAdmissions,
  universityScores,
}: Props) {
  const { examInfo } = useUserStore();
  const userRank = examInfo.rank ?? null;
  const [subject, setSubject] = useState<Subject>(() => pickDefaultSubject(examInfo.subjects[0]));
  const [batchCategory, setBatchCategory] = useState<BatchCategory>('本科批');

  // 1. 全聚合一次（按 (year, subjects, batch, groupCode)）
  const allGroups: GroupedAdmission[] = useMemo(() => groupAdmissions(rawAdmissions ?? []), [rawAdmissions]);

  // 2. 过滤到当前 subject + batchCategory
  const filteredGroups = useMemo(
    () => allGroups.filter(g =>
      ((subject === '物理类' && !isHistorical(g.subjects)) || (subject === '历史类' && isHistorical(g.subjects))) &&
      categorizeBatch(g.batch) === batchCategory
    ),
    [allGroups, subject, batchCategory]
  );

  // 3. Banner 数据：当前 subject + batchCategory 下，跨年汇总院校层最低位次
  const bannerInput = useMemo(() => {
    const rawsInScope = (rawAdmissions ?? []).filter(r =>
      ((subject === '物理类' && !isHistorical(r.subjects)) || (subject === '历史类' && isHistorical(r.subjects))) &&
      categorizeBatch(r.batch) === batchCategory
    );
    // (year) -> min universityMinRank
    const byYear = new Map<number, { score: number | null; rank: number | null }>();
    for (const r of rawsInScope) {
      const cur = byYear.get(r.year);
      const newRank = r.universityMinRank;
      const newScore = r.universityMinScore;
      if (!cur || (newRank != null && (cur.rank == null || newRank < cur.rank))) {
        byYear.set(r.year, { score: newScore, rank: newRank });
      }
    }
    const sorted = Array.from(byYear.entries()).sort(([a], [b]) => b - a);
    if (sorted.length === 0) {
      // Fallback：用 University 表上冗余字段（仅本科批）
      if (batchCategory === '本科批') {
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
  }, [rawAdmissions, subject, batchCategory, universityScores]);

  // 4. 院校层 tier
  const universityTier = useMemo(() => {
    if (userRank == null) return 'unknown' as const;
    if (bannerInput.latestUniversityMinRank == null) return 'unknown' as const;
    const baseTier = getTier({
      is985: universityFlags.is985,
      is211: universityFlags.is211,
      batch: batchCategory === '高职专科' ? '高职(专科)批' : '本科批',
    });
    return classifyRank(userRank, bannerInput.latestUniversityMinRank, baseTier, subject === '历史类');
  }, [userRank, bannerInput, universityFlags, batchCategory, subject]);

  const universityDiffText = useMemo(() => {
    if (userRank == null || bannerInput.latestUniversityMinRank == null) return null;
    const diff = bannerInput.latestUniversityMinRank - userRank;
    return formatDiff(diff, diff > 0);
  }, [userRank, bannerInput]);

  // 5. 同 (subjects, batch, groupCode) 跨年映射 — 给 GroupCard 用
  const multiYearByGroup = useMemo(() => {
    const m = new Map<string, GroupedAdmission[]>();
    for (const g of allGroups) {
      const k = `${g.subjects}|${g.batch}|${g.groupCode}`;
      const arr = m.get(k) ?? [];
      arr.push(g);
      m.set(k, arr);
    }
    return m;
  }, [allGroups]);

  // 6. 渲染：每个 (subjects, batch, groupCode) 只渲染最新年作卡头
  const cardsToRender = useMemo(() => {
    const seen = new Set<string>();
    const out: GroupedAdmission[] = [];
    for (const g of filteredGroups) {
      const k = `${g.subjects}|${g.batch}|${g.groupCode}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(g);
    }
    return out;
  }, [filteredGroups]);

  return (
    <div className="py-4">
      <div className="mb-3">
        <BatchSubjectSwitcher
          subject={subject}
          batchCategory={batchCategory}
          onSubjectChange={setSubject}
          onBatchChange={setBatchCategory}
        />
      </div>

      <UniversityRankBanner
        subject={subject}
        batchCategory={batchCategory}
        rankInput={bannerInput}
        tier={universityTier}
        userRank={userRank}
        diffText={universityDiffText}
      />

      {cardsToRender.length === 0 ? (
        <div className="rounded-lg bg-gray-50 p-6 text-center text-text-tertiary text-sm">
          暂无 {subject} · {batchCategory} 的招录数据
        </div>
      ) : (
        cardsToRender.map(g => {
          const k = `${g.subjects}|${g.batch}|${g.groupCode}`;
          const multiYears = multiYearByGroup.get(k) ?? [g];
          const groupTier = userRank == null || g.groupMinRank == null
            ? 'unknown' as const
            : classifyRank(
                userRank,
                g.groupMinRank,
                getTier({ is985: universityFlags.is985, is211: universityFlags.is211, batch: g.batch }),
                isHistorical(g.subjects),
              );
          const diff = userRank != null && g.groupMinRank != null ? g.groupMinRank - userRank : null;
          const diffText = diff != null ? formatDiff(diff, diff > 0) : null;
          return (
            <GroupCard
              key={`${g.year}-${k}`}
              group={g}
              multiYearGroups={multiYears}
              tier={groupTier}
              diffText={diffText}
              userRank={userRank}
            />
          );
        })
      )}
    </div>
  );
}
