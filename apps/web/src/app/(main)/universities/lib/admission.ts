/**
 * 详情页 admission 数据共享 helper:
 *
 * pickScoreRank — 一条 admission record 4 个口径优先级 fallback
 *   投档 filing > 院校 university > 组 group > 专业 major
 *
 * deriveYearly — 按科类筛 + groupBy year,每年取最低门槛 score 那条
 *   返回按年份升序排列的数组,空表示该科类没数据
 */
import type { ExamType } from '@/services/score-segment';

export interface YearPoint {
  year: number;
  score: number;
  rank: number;
}

export interface AdmissionRecordLike {
  year?: number | null;
  subjects?: string | null;
  subject?: string | null;
  examType?: string | null;
  filingMinScore?: number | null;
  filingMinRank?: number | null;
  universityMinScore?: number | null;
  universityMinRank?: number | null;
  groupMinScore?: number | null;
  groupMinRank?: number | null;
  majorMinScore?: number | null;
  majorMinRank?: number | null;
  minScore?: number | null;
  minRank?: number | null;
}

export function pickScoreRank(r: AdmissionRecordLike): { score: number; rank: number } | null {
  const score =
    r.filingMinScore ??
    r.universityMinScore ??
    r.groupMinScore ??
    r.majorMinScore ??
    r.minScore ??
    null;
  const rank =
    r.filingMinRank ??
    r.universityMinRank ??
    r.groupMinRank ??
    r.majorMinRank ??
    r.minRank ??
    null;
  if (score == null || rank == null) return null;
  return { score, rank };
}

export function deriveYearly(records: AdmissionRecordLike[], subject: ExamType): YearPoint[] {
  if (!records?.length) return [];
  const matched = records.filter((r) => {
    const t = (r.subjects ?? r.subject ?? r.examType ?? '') as string;
    return t.includes(subject);
  });
  if (matched.length === 0) return [];
  const m = new Map<number, YearPoint>();
  for (const r of matched) {
    if (!r.year) continue;
    const sr = pickScoreRank(r);
    if (!sr) continue;
    const cur = m.get(r.year);
    if (!cur || sr.score < cur.score) m.set(r.year, { year: r.year, score: sr.score, rank: sr.rank });
  }
  return Array.from(m.values()).sort((a, b) => a.year - b.year);
}

/** 取最近一年的 YearPoint(用于详情页 stats 显示) */
export function getLatestYearly(
  records: AdmissionRecordLike[],
  subject: ExamType,
): YearPoint | null {
  const years = deriveYearly(records, subject);
  return years.length > 0 ? years[years.length - 1] : null;
}
