import { Injectable, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScoreSegmentService } from '../score-segment/score-segment.service';
import { buildHardFilterWhere } from './filters/hard-filter';
import { GenderRule } from './filters/soft-rules/gender.rule';
import { HealthRestrictionRule } from './filters/soft-rules/health-restriction.rule';
import { HouseholdRule } from './filters/soft-rules/household.rule';
import { EthnicityRule } from './filters/soft-rules/ethnicity.rule';
import { TuitionRule } from './filters/soft-rules/tuition.rule';
import { NatureRule } from './filters/soft-rules/nature.rule';
import { SoftRule, SoftFailReason } from './filters/soft-rule.interface';
import { calcDynamicGradient, calcGradient } from './gradient-calculator';

interface GetCandidatesQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  includeSoftFails?: boolean;
  sort?: CandidateGroupSort;
}

type CandidateGroupSort =
  | 'MAJOR_MATCH'
  | 'RANK_FIT'
  | 'MAJOR_MIN_SCORE_DESC'
  | 'UNIVERSITY_RANK'
  | 'MAJOR_STRENGTH'
  | 'PLAN_COUNT_DESC'
  | 'SUPPLEMENTARY_RATE_DESC'
  | 'SAFETY_DESC';
type CandidateGroupScoreSource = 'GROUP' | 'FILING' | 'MAJOR' | 'NONE';
type StudentRankSource = 'PROFILE' | 'SCORE_SEGMENT' | 'MISSING';
type FirstChoice = 'PHYSICS' | 'HISTORY';
type SecondarySubject = 'CHEMISTRY' | 'BIOLOGY' | 'GEOGRAPHY' | 'POLITICS';

interface EnrollmentPlanSourceInput {
  planYear: number;
  province: string;
  batchName: string;
  subjects: string;
}

interface CandidateGroupFullResult {
  total: number;
  planYear: number;
  sourceYear: number;
  previousYear: number;
  sourceBatchName: string;
  isFallbackYear: boolean;
  studentRankUsed: number;
  studentRankSource: StudentRankSource;
  storedRank: number | null;
  scoreBasedRank: number | null;
  sort: CandidateGroupSort;
  groups: any[];
}

function uniqueValues<T extends string | number>(values: Array<T | null | undefined>): T[] {
  return Array.from(new Set(values.filter((value): value is T => value !== null && value !== undefined)));
}

function addInFilter(where: Record<string, unknown>, field: string, values: Array<string | number | null | undefined>) {
  const compact = uniqueValues(values);
  if (compact.length > 0) {
    where[field] = { in: compact };
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function groupKeyOf(row: {
  universityId: number;
  groupCode?: string | null;
  batch?: string | null;
  recruitType?: string | null;
  subjects?: string | null;
}) {
  return [
    row.universityId,
    row.groupCode ?? '',
    row.batch ?? '',
    row.recruitType ?? '',
    row.subjects ?? '',
  ].join('|');
}

function recordKeyOf(row: {
  universityId: number;
  subjects?: string | null;
  batch?: string | null;
  recruitType?: string | null;
  groupCode?: string | null;
  majorCode?: string | null;
  majorName?: string | null;
  year: number;
}) {
  return [
    row.universityId,
    row.subjects ?? '',
    row.batch ?? '',
    row.recruitType ?? '',
    row.groupCode ?? '',
    row.majorCode ?? '',
    row.majorName ?? '',
    row.year,
  ].join('|');
}

function bestNumber(values: Array<number | null | undefined>, mode: 'min' | 'max' = 'min') {
  const compact = values.filter((value): value is number => typeof value === 'number');
  if (compact.length === 0) return null;
  return mode === 'min' ? Math.min(...compact) : Math.max(...compact);
}

function gradientPriority(gradient: string | null | undefined) {
  if (gradient === 'WEN') return 0;
  if (gradient === 'BAO') return 1;
  if (gradient === 'CHONG') return 2;
  return 3;
}

function tierDefaultPriority(tier: string | null | undefined, gradient: string | null | undefined) {
  const value = tier ?? gradient;
  const order: Record<string, number> = {
    WEN: 0,
    WEN_BAO: 1,
    BAO: 2,
    QIANG_BAO: 3,
    DIBAO: 4,
    XIAO_CHONG: 5,
    CHONG: 6,
    JI_CHONG: 7,
  };
  return order[value ?? ''] ?? gradientPriority(gradient);
}

function tierSafetyPriority(tier: string | null | undefined, gradient: string | null | undefined) {
  const value = tier ?? gradient;
  const order: Record<string, number> = {
    DIBAO: 0,
    QIANG_BAO: 1,
    BAO: 2,
    WEN_BAO: 3,
    WEN: 4,
    XIAO_CHONG: 5,
    CHONG: 6,
    JI_CHONG: 7,
  };
  return order[value ?? ''] ?? 8;
}

function rankFitDistance(studentRank: number, historyMinRank: number | null | undefined) {
  if (!historyMinRank || historyMinRank <= 0) return 999;
  return Math.abs(historyMinRank / studentRank - 1);
}

function metricNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function compareDesc(a: unknown, b: unknown) {
  return metricNumber(b, -Infinity) - metricNumber(a, -Infinity);
}

function compareAscMissingLast(a: unknown, b: unknown) {
  const av = metricNumber(a, Infinity);
  const bv = metricNumber(b, Infinity);
  return av - bv;
}

function rankingNumber(value: unknown) {
  const parsed = metricNumber(value, Infinity);
  return parsed > 0 ? parsed : Infinity;
}

function compareRankingAsc(a: unknown, b: unknown) {
  return rankingNumber(a) - rankingNumber(b);
}

function supplementaryRateOf(group: any) {
  const rate = metricNumber(group.supplementary?.supplementaryRate, 0);
  return rate > 1 ? rate / 100 : rate;
}

function supplementaryForGroupRisk(supplementary: any) {
  // SupplementarySummary is currently aggregated by university + batch. Treating
  // it as group-level availability would make every group in that batch look safer.
  return supplementary?.scope === 'GROUP' ? supplementary : null;
}

function universityTagScore(group: any) {
  return (
    (group.university?.is985 ? 100 : 0) +
    (group.university?.is211 ? 60 : 0) +
    (group.university?.isDoubleFirstClass ? 40 : 0)
  );
}

function extractRankingScore(value: unknown) {
  const text = String(value ?? '');
  const match = text.match(/\d+/);
  if (!match) return 0;
  const rank = Number(match[0]);
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  return Math.max(0, 100 - rank);
}

const CANDIDATE_ENROLLMENT_PLAN_SELECT = {
  id: true,
  universityId: true,
  majorId: true,
  year: true,
  province: true,
  planCount: true,
  planNotes: true,
  batch: true,
  level: true,
  subjects: true,
  subjectRequirements: true,
  duration: true,
  tuition: true,
  isSinoForeign: true,
  recruitType: true,
  majorCode: true,
  majorName: true,
  localMasterPoint: true,
  localDoctoralPoint: true,
  groupCode: true,
  groupName: true,
  groupPlanCount: true,
  isNew: true,
  oldBatch: true,
  disciplineEval: true,
  isNationalFeature: true,
  majorRanking: true,
  majorHonor: true,
  university: {
    select: {
      id: true,
      name: true,
      code: true,
      province: true,
      city: true,
      type: true,
      runningNature: true,
      is985: true,
      is211: true,
      isDoubleFirstClass: true,
      softRanking: true,
      logoUrl: true,
    },
  },
  major: {
    select: {
      id: true,
      name: true,
      code: true,
      notes: true,
      category: true,
      discipline: true,
      softRating: true,
      description: true,
      careerDirections: true,
      postgraduateDirections: true,
      coreCourses: true,
      employmentRate: true,
      avgSalary: true,
      degree: true,
      standardDuration: true,
      satisfactionScore: true,
      localMasterPoint: true,
      localDoctoralPoint: true,
    },
  },
};

const CANDIDATE_ADMISSION_RECORD_SELECT = {
  universityId: true,
  subjects: true,
  batch: true,
  recruitType: true,
  groupCode: true,
  majorCode: true,
  majorName: true,
  year: true,
  majorMinScore: true,
  majorMinRank: true,
  majorAdmissionCount: true,
  groupMinScore: true,
  groupMinRank: true,
  groupAdmissionCount: true,
  filingMinScore: true,
  filingMinRank: true,
};

const EXAM_TYPE_TO_SUBJECTS: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
  COMPREHENSIVE_LIBERAL: '文科',
  COMPREHENSIVE_SCIENCE: '理科',
};

const SICHUAN = '\u56db\u5ddd';
const PHYSICS = '\u7269\u7406';
const HISTORY = '\u5386\u53f2';
const SCIENCE = '\u7406\u79d1';
const LIBERAL = '\u6587\u79d1';
const CHEMISTRY = '\u5316\u5b66';
const BIOLOGY = '\u751f\u7269';
const GEOGRAPHY = '\u5730\u7406';
const POLITICS = '\u601d\u60f3\u653f\u6cbb';

const SICHUAN_2025_SELECTION_POOLS: Record<FirstChoice, {
  total: number;
  combinations: Array<{ subjects: SecondarySubject[]; count: number }>;
}> = {
  PHYSICS: {
    total: 327018,
    combinations: [
      { subjects: ['CHEMISTRY', 'BIOLOGY'], count: 224560 },
      { subjects: ['CHEMISTRY', 'GEOGRAPHY'], count: 52826 },
      { subjects: ['CHEMISTRY', 'POLITICS'], count: 30624 },
      { subjects: ['GEOGRAPHY', 'BIOLOGY'], count: 14224 },
      { subjects: ['POLITICS', 'BIOLOGY'], count: 4297 },
      { subjects: ['POLITICS', 'GEOGRAPHY'], count: 487 },
    ],
  },
  HISTORY: {
    total: 233352,
    combinations: [
      { subjects: ['POLITICS', 'GEOGRAPHY'], count: 192118 },
      { subjects: ['POLITICS', 'BIOLOGY'], count: 35758 },
      { subjects: ['GEOGRAPHY', 'BIOLOGY'], count: 4358 },
      { subjects: ['POLITICS', 'CHEMISTRY'], count: 466 },
      { subjects: ['CHEMISTRY', 'BIOLOGY'], count: 504 },
      { subjects: ['CHEMISTRY', 'GEOGRAPHY'], count: 148 },
    ],
  },
};

@Injectable()
export class PlanCandidateService {
  private readonly candidateGroupCache = new Map<string, { expiresAt: number; value: CandidateGroupFullResult }>();
  private readonly candidateGroupCacheTtlMs = 5 * 60 * 1000;
  private readonly candidateGroupCacheLimit = 40;

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly scoreSegmentService?: ScoreSegmentService,
  ) {}

  private candidateGroupCacheKey(plan: any, q: GetCandidatesQuery) {
    return JSON.stringify({
      planId: plan.id,
      planUpdatedAt: plan.updatedAt instanceof Date ? plan.updatedAt.getTime() : plan.updatedAt,
      studentUpdatedAt: plan.student?.updatedAt instanceof Date ? plan.student.updatedAt.getTime() : plan.student?.updatedAt,
      keyword: q.keyword?.trim() || '',
      includeSoftFails: q.includeSoftFails !== false,
      sort: q.sort ?? 'MAJOR_MATCH',
    });
  }

  private getCandidateGroupCache(key: string) {
    const cached = this.candidateGroupCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) {
      this.candidateGroupCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private setCandidateGroupCache(key: string, value: CandidateGroupFullResult) {
    if (this.candidateGroupCache.size >= this.candidateGroupCacheLimit) {
      const oldest = this.candidateGroupCache.keys().next().value;
      if (oldest) this.candidateGroupCache.delete(oldest);
    }
    this.candidateGroupCache.set(key, {
      expiresAt: Date.now() + this.candidateGroupCacheTtlMs,
      value,
    });
  }

  private paginateCandidateGroups(value: CandidateGroupFullResult, page: number, pageSize: number) {
    const start = (page - 1) * pageSize;
    return {
      ...value,
      page,
      pageSize,
      groups: value.groups.slice(start, start + pageSize),
    };
  }

  private provinceAliases(province: string) {
    const values = [province];
    if (province === 'Sichuan' || province === SICHUAN) {
      values.push(SICHUAN, 'Sichuan');
    }
    return uniqueValues(values);
  }

  private normalizeFirstChoice(value?: string | null): FirstChoice | null {
    const text = String(value ?? '').toLowerCase();
    if (text.includes('physics') || text.includes(PHYSICS) || text.includes(SCIENCE)) {
      return 'PHYSICS';
    }
    if (text.includes('history') || text.includes(HISTORY) || text.includes(LIBERAL)) {
      return 'HISTORY';
    }
    return null;
  }

  private examTypeCandidates(subjects: string, year: number) {
    const firstChoice = this.normalizeFirstChoice(subjects);
    if (firstChoice === 'PHYSICS') {
      return year >= 2025
        ? uniqueValues([subjects, PHYSICS, `${PHYSICS}\u7c7b`, 'Physics'])
        : uniqueValues([SCIENCE, 'Science']);
    }
    if (firstChoice === 'HISTORY') {
      return year >= 2025
        ? uniqueValues([subjects, HISTORY, `${HISTORY}\u7c7b`, 'History'])
        : uniqueValues([LIBERAL, 'Liberal']);
    }
    return uniqueValues([subjects]);
  }

  private batchCandidates(batchName: string, year: number) {
    const text = String(batchName ?? '');
    const candidates = [batchName];
    if (year >= 2025) {
      if (text.includes('\u7279\u6b8a') || text.includes('\u9ad8\u6821\u4e13\u9879')) {
        candidates.push('\u7279\u6b8a\u7c7b\u578b\u62db\u751f\u63a7\u5236\u7ebf', '\u7279\u6b8a\u7c7b\u578b');
      } else if (text.includes('\u4e13\u79d1') || text.toLowerCase().includes('specialty')) {
        candidates.push('\u9ad8\u804c\uff08\u4e13\u79d1\uff09\u6279\u6b21', '\u4e13\u79d1');
      } else if (text.includes('\u672c\u79d1') || text.toLowerCase().includes('batch')) {
        candidates.push('\u672c\u79d1\u6279\u6b21', '\u672c\u79d1B');
      }
    } else {
      if (text.includes('\u4e13\u79d1') || text.toLowerCase().includes('specialty')) {
        candidates.push('\u4e13\u79d1\u6279', '\u4e13\u79d1');
      } else if (text.includes('\u4e00') || text.toLowerCase().includes('first')) {
        candidates.push('\u672c\u79d1\u7b2c\u4e00\u6279', '\u672c\u4e00');
      } else {
        candidates.push('\u672c\u79d1\u7b2c\u4e8c\u6279', '\u672c\u4e8c');
      }
    }
    return uniqueValues(candidates);
  }

  private async lookupBatchCompetition(province: string, subjects: string, batchName: string, year: number) {
    const examTypes = this.examTypeCandidates(subjects, year);
    const batchNames = this.batchCandidates(batchName, year);
    if (!examTypes.length || !batchNames.length || !(this.prisma as any).batchLine?.findFirst) {
      return null;
    }

    const line = await (this.prisma as any).batchLine.findFirst({
      where: {
        year,
        province: { in: this.provinceAliases(province) },
        batch: { in: batchNames },
        examType: { in: examTypes },
      },
      orderBy: { score: 'desc' },
    });
    if (!line || !(this.prisma as any).scoreSegment?.findFirst) return null;

    const segment = await (this.prisma as any).scoreSegment.findFirst({
      where: {
        year,
        province: { in: this.provinceAliases(province) },
        examType: { in: examTypes },
        score: line.score,
      },
    });

    return {
      year,
      batch: line.batch,
      examType: line.examType,
      batchLineScore: line.score,
      count: segment?.cumulativeCount ?? null,
    };
  }

  private async resolveBatchCompetition(province: string, subjects: string, batchName: string, currentYear: number) {
    const previousYear = currentYear - 1;
    const [current, previous] = await Promise.all([
      this.lookupBatchCompetition(province, subjects, batchName, currentYear),
      this.lookupBatchCompetition(province, subjects, batchName, previousYear),
    ]);
    return {
      currentYear,
      previousYear,
      currentCount: current?.count ?? null,
      previousCount: previous?.count ?? null,
      currentBatchLineScore: current?.batchLineScore ?? null,
      previousBatchLineScore: previous?.batchLineScore ?? null,
      currentBatch: current?.batch ?? null,
      previousBatch: previous?.batch ?? null,
      currentExamType: current?.examType ?? null,
      previousExamType: previous?.examType ?? null,
    };
  }

  private requiredSecondarySubjects(text?: string | null): SecondarySubject[] {
    const value = String(text ?? '').toLowerCase();
    const subjects: SecondarySubject[] = [];
    if (value.includes('chemistry') || value.includes(CHEMISTRY)) subjects.push('CHEMISTRY');
    if (value.includes('biology') || value.includes(BIOLOGY)) subjects.push('BIOLOGY');
    if (value.includes('geography') || value.includes(GEOGRAPHY)) subjects.push('GEOGRAPHY');
    if (value.includes('politics') || value.includes(POLITICS) || value.includes('\u653f\u6cbb')) subjects.push('POLITICS');
    return uniqueValues(subjects);
  }

  private estimateSelectionCompetition(rows: any[], subjects: string) {
    const firstChoice = this.normalizeFirstChoice(subjects);
    if (!firstChoice) {
      return {
        sourceYear: null,
        sourceType: 'MISSING',
        firstChoice: null,
        requiredSubjects: [],
        eligibleCount: null,
        subjectCount: null,
      };
    }

    const requirementText = rows
      .map((row) => row.subjectRequirements)
      .find((value) => typeof value === 'string' && value.trim().length > 0) ?? '';
    const requiredSubjects = this.requiredSecondarySubjects(requirementText);
    const pool = SICHUAN_2025_SELECTION_POOLS[firstChoice];
    const eligibleCount = requiredSubjects.length
      ? pool.combinations
        .filter((combo) => requiredSubjects.every((required) => combo.subjects.includes(required)))
        .reduce((sum, combo) => sum + combo.count, 0)
      : pool.total;

    return {
      sourceYear: 2025,
      sourceType: 'PUBLIC_ESTIMATE',
      firstChoice,
      requiredSubjects,
      eligibleCount,
      subjectCount: pool.total,
    };
  }

  private async loadSupplementaryByGroup(groups: Map<string, any[]>, province: string, years: number[]) {
    const result = new Map<string, any>();
    if (groups.size === 0 || !(this.prisma as any).supplementarySummary?.findMany) return result;

    const groupRows = Array.from(groups.entries()).map(([groupKey, rows]) => ({ groupKey, row: rows[0] }));
    const summaries = await (this.prisma as any).supplementarySummary.findMany({
      where: {
        province: { in: this.provinceAliases(province) },
        universityId: { in: uniqueValues(groupRows.map(({ row }) => row.universityId)) },
        year: { in: years },
      },
      select: {
        universityId: true,
        batch: true,
        year: true,
        totalRounds: true,
        totalPlanCount: true,
        supplementaryRate: true,
      },
    });

    const exact = new Map<string, any>();
    for (const summary of summaries) {
      const exactKey = `${summary.universityId}|${summary.batch}`;
      const currentExact = exact.get(exactKey);
      if (!currentExact || summary.year > currentExact.year) exact.set(exactKey, summary);
    }

    for (const { groupKey, row } of groupRows) {
      const summary = exact.get(`${row.universityId}|${row.batch}`);
      if (!summary) continue;
      result.set(groupKey, {
        sourceYear: summary.year,
        scope: 'UNIVERSITY_BATCH',
        batch: summary.batch,
        totalRounds: summary.totalRounds,
        totalPlanCount: summary.totalPlanCount,
        supplementaryRate: summary.supplementaryRate ? Number(summary.supplementaryRate) : null,
      });
    }

    return result;
  }

  private async resolveEnrollmentPlanSource(input: EnrollmentPlanSourceInput) {
    const rows = await this.prisma.enrollmentPlan.groupBy({
      by: ['year'],
      where: {
        province: input.province,
        batch: input.batchName,
        subjects: input.subjects,
        year: { lte: input.planYear },
      },
      _count: { _all: true },
      orderBy: { year: 'desc' },
      take: 1,
    });
    const sourceYear = rows[0]?.year ?? input.planYear;

    return {
      planYear: input.planYear,
      sourceYear,
      sourceBatchName: input.batchName,
      isFallbackYear: sourceYear !== input.planYear,
    };
  }

  private buildAdmissionRecordWhere(eps: any[], province: string, years = [2024, 2025]) {
    const where: Record<string, unknown> = {
      year: { in: years },
      province,
    };

    addInFilter(where, 'subjects', eps.map((ep) => ep.subjects));
    addInFilter(where, 'batch', eps.map((ep) => ep.batch));
    addInFilter(where, 'recruitType', eps.map((ep) => ep.recruitType));
    addInFilter(where, 'universityId', eps.map((ep) => ep.universityId));
    addInFilter(where, 'groupCode', eps.map((ep) => ep.groupCode));
    addInFilter(where, 'majorCode', eps.map((ep) => ep.majorCode));

    return where;
  }

  private buildSoftRules(restrictions: any[]): SoftRule[] {
    return [
      new HealthRestrictionRule(restrictions),
      new GenderRule(),
      new HouseholdRule(),
      new EthnicityRule(),
      new TuitionRule(),
      new NatureRule(),
    ];
  }

  private checkSoftFails(student: any, ep: any, rules: SoftRule[]): SoftFailReason[] {
    const reasons: SoftFailReason[] = [];
    for (const rule of rules) {
      const res = rule.check(student as any, ep as any);
      if (!res.pass && res.reason) reasons.push(res.reason);
    }

    const excludedMajors = asStringArray(student.excludedMajors);
    const excludedCategories = asStringArray(student.excludedMajorCategories);
    const majorName = ep.majorName || ep.major?.name || '';
    const majorCategory = ep.major?.category || '';
    if (excludedMajors.includes(majorName)) {
      reasons.push({
        rule: 'preference.excluded_major',
        expected: 'not excluded',
        actual: majorName,
        severity: 'SOFT_PREFERENCE',
        note: `Student excluded major ${majorName}`,
      });
    }
    if (majorCategory && excludedCategories.includes(majorCategory)) {
      reasons.push({
        rule: 'preference.excluded_major_category',
        expected: 'not excluded',
        actual: majorCategory,
        severity: 'SOFT_PREFERENCE',
        note: `Student excluded major category ${majorCategory}`,
      });
    }
    return reasons;
  }

  private scoreMajorMatch(student: any, ep: any) {
    const preferredMajors = asStringArray(student.preferredMajors);
    const preferredCategories = asStringArray(student.preferredMajorCategories);
    const excludedMajors = asStringArray(student.excludedMajors);
    const excludedCategories = asStringArray(student.excludedMajorCategories);
    const majorName = ep.majorName || ep.major?.name || '';
    const category = ep.major?.category || '';
    const reasons: string[] = [];
    let score = 0;

    if (excludedMajors.includes(majorName)) score -= 1000;
    if (category && excludedCategories.includes(category)) score -= 800;
    if (preferredMajors.includes(majorName)) {
      score += 100;
      reasons.push('preferred major');
    }
    if (category && preferredCategories.includes(category)) {
      score += 45;
      reasons.push('preferred category');
    }
    if (typeof ep.major?.employmentRate === 'number') score += Math.min(15, ep.major.employmentRate / 10);
    if (typeof ep.major?.avgSalary === 'number') score += Math.min(10, ep.major.avgSalary / 2000);
    if (String(ep.disciplineEval || '').startsWith('A')) score += 12;
    if (ep.isNationalFeature) score += 8;
    if (String(ep.major?.softRating || '').startsWith('A')) score += 6;

    return { score, reasons };
  }

  private gradeScore(value: unknown) {
    const text = String(value ?? '').trim().toUpperCase();
    if (!text) return 0;
    if (text.startsWith('A+')) return 100;
    if (text.startsWith('A-')) return 88;
    if (text.startsWith('A')) return 94;
    if (text.startsWith('B+')) return 78;
    if (text.startsWith('B-')) return 66;
    if (text.startsWith('B')) return 72;
    if (text.startsWith('C+')) return 58;
    if (text.startsWith('C-')) return 46;
    if (text.startsWith('C')) return 52;
    return 0;
  }

  private majorStrengthScore(ep: any) {
    const evalScore = this.gradeScore(ep.disciplineEval);
    const softScore = this.gradeScore(ep.major?.softRating);
    const rankingScore = extractRankingScore(ep.majorRanking);
    const featureScore = ep.isNationalFeature ? 8 : 0;
    return Number((evalScore * 0.48 + softScore * 0.32 + rankingScore * 0.12 + featureScore).toFixed(2));
  }

  private compareCandidateGroupFallback(a: any, b: any, studentRank: number, includeMatchScore = true) {
    const soft = (a.softFailCount ?? 0) - (b.softFailCount ?? 0);
    if (soft !== 0) return soft;

    const tier = tierDefaultPriority(a.dynamicGradient?.tier, a.suggestedGradient) -
      tierDefaultPriority(b.dynamicGradient?.tier, b.suggestedGradient);
    if (tier !== 0) return tier;

    if (includeMatchScore && b.matchScore !== a.matchScore) return (b.matchScore ?? -999) - (a.matchScore ?? -999);

    const ar = rankFitDistance(studentRank, a.dynamicGradient?.adjustedMinRank ?? a.groupMinRank);
    const br = rankFitDistance(studentRank, b.dynamicGradient?.adjustedMinRank ?? b.groupMinRank);
    if (ar !== br) return ar - br;

    return (b.currentPlanCount ?? 0) - (a.currentPlanCount ?? 0);
  }

  private sortCandidateGroups(groups: any[], sort: CandidateGroupSort = 'MAJOR_MATCH', studentRank: number) {
    groups.sort((a, b) => {
      const soft = (a.softFailCount ?? 0) - (b.softFailCount ?? 0);
      if (soft !== 0) return soft;

      if (sort === 'SAFETY_DESC') {
        const safety = tierSafetyPriority(a.dynamicGradient?.tier, a.suggestedGradient) -
          tierSafetyPriority(b.dynamicGradient?.tier, b.suggestedGradient);
        if (safety !== 0) return safety;
        return compareDesc(a.dynamicGradient?.rankGapRatio, b.dynamicGradient?.rankGapRatio) ||
          this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'SUPPLEMENTARY_RATE_DESC') {
        const rate = supplementaryRateOf(b) - supplementaryRateOf(a);
        if (rate !== 0) return rate;
        return compareDesc(a.supplementary?.totalPlanCount, b.supplementary?.totalPlanCount) ||
          compareDesc(a.supplementary?.totalRounds, b.supplementary?.totalRounds) ||
          this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'PLAN_COUNT_DESC') {
        return compareDesc(a.currentPlanCount, b.currentPlanCount) ||
          this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'MAJOR_MIN_SCORE_DESC') {
        return compareDesc(a.anchorMajorMinScore ?? a.groupMinScore, b.anchorMajorMinScore ?? b.groupMinScore) ||
          this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'UNIVERSITY_RANK') {
        return compareRankingAsc(a.universityRank ?? a.university?.softRanking, b.universityRank ?? b.university?.softRanking) ||
          compareDesc(universityTagScore(a), universityTagScore(b)) ||
          this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'MAJOR_STRENGTH') {
        return compareDesc(a.majorStrengthScore, b.majorStrengthScore) ||
          this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'RANK_FIT') {
        const ar = rankFitDistance(studentRank, a.dynamicGradient?.adjustedMinRank ?? a.groupMinRank);
        const br = rankFitDistance(studentRank, b.dynamicGradient?.adjustedMinRank ?? b.groupMinRank);
        if (ar !== br) return ar - br;
        return this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      return this.compareCandidateGroupFallback(a, b, studentRank, true);
    });
  }

  private pickGroupScore(records: any[], sourceYear: number) {
    const current = records.filter((record) => record.year === sourceYear);
    const groupScore = bestNumber(current.map((record) => record.groupMinScore));
    const groupRank = bestNumber(current.map((record) => record.groupMinRank), 'max');
    if (groupScore !== null || groupRank !== null) {
      return {
        groupMinScore: groupScore,
        groupMinRank: groupRank,
        groupAdmissionCount: bestNumber(current.map((record) => record.groupAdmissionCount), 'max'),
        scoreSource: 'GROUP' as CandidateGroupScoreSource,
      };
    }

    const filingScore = bestNumber(current.map((record) => record.filingMinScore));
    const filingRank = bestNumber(current.map((record) => record.filingMinRank), 'max');
    if (filingScore !== null || filingRank !== null) {
      return {
        groupMinScore: filingScore,
        groupMinRank: filingRank,
        groupAdmissionCount: null,
        scoreSource: 'FILING' as CandidateGroupScoreSource,
      };
    }

    const majorScore = bestNumber(current.map((record) => record.majorMinScore));
    const majorRank = bestNumber(current.map((record) => record.majorMinRank), 'max');
    return {
      groupMinScore: majorScore,
      groupMinRank: majorRank,
      groupAdmissionCount: null,
      scoreSource: majorScore !== null || majorRank !== null ? 'MAJOR' as CandidateGroupScoreSource : 'NONE' as CandidateGroupScoreSource,
    };
  }

  private planCountForGroup(rows: any[]) {
    const groupPlanCount = rows.find((row) => typeof row.groupPlanCount === 'number')?.groupPlanCount;
    if (typeof groupPlanCount === 'number') return groupPlanCount;
    return rows.reduce((sum, row) => sum + (typeof row.planCount === 'number' ? row.planCount : 0), 0) || null;
  }

  private isPositiveRank(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  private shouldUseScoreBasedRank(storedRank: number | null, scoreBasedRank: number | null) {
    if (!scoreBasedRank) return false;
    if (!storedRank) return true;
    const smaller = Math.min(storedRank, scoreBasedRank);
    const larger = Math.max(storedRank, scoreBasedRank);
    return smaller > 0 && larger / smaller >= 3;
  }

  private async resolveStudentRank(student: any, sourceYear: number) {
    const storedRank = this.isPositiveRank(student.provincialRank) ? student.provincialRank : null;
    let scoreBasedRank: number | null = null;

    const subjects = EXAM_TYPE_TO_SUBJECTS[student.examType ?? ''];
    if (this.scoreSegmentService && subjects && this.isPositiveRank(student.totalScore)) {
      try {
        const converted = await this.scoreSegmentService.scoreToRank(sourceYear, subjects as any, student.totalScore);
        scoreBasedRank = this.isPositiveRank(converted.rank) ? converted.rank : null;
      } catch {
        scoreBasedRank = null;
      }
    }

    const useScoreBased = this.shouldUseScoreBasedRank(storedRank, scoreBasedRank);
    const rank = useScoreBased ? scoreBasedRank : storedRank ?? scoreBasedRank;
    const source: StudentRankSource = rank
      ? (useScoreBased || !storedRank ? 'SCORE_SEGMENT' : 'PROFILE')
      : 'MISSING';

    return {
      rank: rank ?? 999999,
      source,
      storedRank,
      scoreBasedRank,
    };
  }

  async getCandidateGroups(planId: number, q: GetCandidatesQuery, userId?: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: { student: true },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (userId && plan.createdById !== userId && plan.student.userId !== userId) {
      throw new ForbiddenException('无权查看此方案候选池');
    }
    if (!plan.batchName) throw new NotFoundException('方案缺少批次信息');

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: plan.studentId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('学生不存在');

    const province = student.province ?? '四川';
    const subjects = EXAM_TYPE_TO_SUBJECTS[student.examType ?? 'PHYSICS'] || '物理';
    const source = await this.resolveEnrollmentPlanSource({
      planYear: plan.year,
      province,
      batchName: plan.batchName,
      subjects,
    });
    const where = buildHardFilterWhere({
      year: source.sourceYear,
      province,
      batchName: plan.batchName,
      subjects,
      keyword: q.keyword,
    });
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const cacheKey = this.candidateGroupCacheKey(plan, q);
    const cached = this.getCandidateGroupCache(cacheKey);
    if (cached) {
      return this.paginateCandidateGroups(cached, page, pageSize);
    }

    const [eps, restrictions] = await Promise.all([
      this.prisma.enrollmentPlan.findMany({
        where,
        select: CANDIDATE_ENROLLMENT_PLAN_SELECT,
      }),
      this.prisma.healthRestriction.findMany(),
    ]);
    const rules = this.buildSoftRules(restrictions);
    const years = [source.sourceYear, source.sourceYear - 1];
    const adRecords = eps.length
      ? await this.prisma.admissionRecord.findMany({
          where: this.buildAdmissionRecordWhere(eps, province, years),
          select: CANDIDATE_ADMISSION_RECORD_SELECT,
        })
      : [];

    const adIndex = new Map<string, any>();
    const adByGroupYear = new Map<string, any[]>();
    for (const ar of adRecords) {
      adIndex.set(recordKeyOf(ar), ar);
      const groupYearKey = `${groupKeyOf(ar)}|${ar.year}`;
      const records = adByGroupYear.get(groupYearKey) ?? [];
      records.push(ar);
      adByGroupYear.set(groupYearKey, records);
    }

    const groups = new Map<string, any[]>();
    for (const ep of eps) {
      const key = groupKeyOf(ep);
      const rows = groups.get(key) ?? [];
      rows.push(ep);
      groups.set(key, rows);
    }

    const previousWhere: Record<string, unknown> = {
      province,
      year: source.sourceYear - 1,
    };
    addInFilter(previousWhere, 'subjects', eps.map((ep) => ep.subjects));
    addInFilter(previousWhere, 'batch', eps.map((ep) => ep.batch));
    addInFilter(previousWhere, 'recruitType', eps.map((ep) => ep.recruitType));
    addInFilter(previousWhere, 'universityId', eps.map((ep) => ep.universityId));
    addInFilter(previousWhere, 'groupCode', eps.map((ep) => ep.groupCode));
    const previousPlansPromise = eps.length
      ? this.prisma.enrollmentPlan.findMany({
          where: previousWhere,
          select: {
            universityId: true,
            subjects: true,
            batch: true,
            recruitType: true,
            groupCode: true,
            groupPlanCount: true,
            planCount: true,
          },
        })
      : [];

    const predictionMapPromise = (async () => {
      const predictionMap = new Map<string, any>();
      if (groups.size > 0 && (this.prisma as any).rankPrediction?.findMany) {
        const predictionWhere: Record<string, unknown> = {
          targetYear: source.planYear,
        };
        const groupRows = Array.from(groups.values()).map((rows) => rows[0]);
        addInFilter(predictionWhere, 'subjects', groupRows.map((row) => row.subjects));
        addInFilter(predictionWhere, 'batch', groupRows.map((row) => row.batch));
        addInFilter(predictionWhere, 'recruitType', groupRows.map((row) => row.recruitType));
        addInFilter(predictionWhere, 'universityId', groupRows.map((row) => row.universityId));
        addInFilter(predictionWhere, 'groupCode', groupRows.map((row) => row.groupCode));
        const preds = await (this.prisma as any).rankPrediction.findMany({
          where: predictionWhere,
          select: {
            universityId: true,
            subjects: true,
            batch: true,
            recruitType: true,
            groupCode: true,
            pointRank: true,
            conservativeRank: true,
            optimisticRank: true,
            basisYears: true,
            confidence: true,
            targetYear: true,
          },
        });
        for (const pred of preds) {
          const key = groupKeyOf(pred);
          if (!groups.has(key)) continue;
          predictionMap.set(key, {
            point: pred.pointRank,
            conservative: pred.conservativeRank,
            optimistic: pred.optimisticRank,
            basisYears: pred.basisYears,
            confidence: pred.confidence,
            targetYear: pred.targetYear,
          });
        }
      }
      return predictionMap;
    })();

    const [
      previousPlans,
      predictionMap,
      batchCompetition,
      supplementaryByGroup,
      studentRankInfo,
    ] = await Promise.all([
      previousPlansPromise,
      predictionMapPromise,
      this.resolveBatchCompetition(province, subjects, plan.batchName, source.sourceYear),
      this.loadSupplementaryByGroup(groups, province, [source.sourceYear, source.sourceYear - 1, source.sourceYear - 2]),
      this.resolveStudentRank(student, source.sourceYear),
    ]);
    const previousByGroup = new Map<string, any[]>();
    for (const row of previousPlans) {
      const key = groupKeyOf(row);
      const rows = previousByGroup.get(key) ?? [];
      rows.push(row);
      previousByGroup.set(key, rows);
    }
    const studentRank = studentRankInfo.rank;
    const resultGroups = Array.from(groups.entries()).map(([groupKey, rows]) => {
      const groupRecords = [
        ...(adByGroupYear.get(`${groupKey}|${source.sourceYear}`) ?? []),
        ...(adByGroupYear.get(`${groupKey}|${source.sourceYear - 1}`) ?? []),
      ];
      const groupScore = this.pickGroupScore(groupRecords, source.sourceYear);
      const first = rows[0];
      const currentPlanCount = this.planCountForGroup(rows);
      const previousPlanCount = this.planCountForGroup(previousByGroup.get(groupKey) ?? []);
      const selectionCompetition = this.estimateSelectionCompetition(rows, first.subjects ?? subjects);
      const supplementary = supplementaryByGroup.get(groupKey) ?? null;
      const riskSupplementary = supplementaryForGroupRisk(supplementary);

      const majors = rows.map((ep) => {
        const currentRecord = adIndex.get(recordKeyOf({ ...ep, year: source.sourceYear }));
        const previousRecord = adIndex.get(recordKeyOf({ ...ep, year: source.sourceYear - 1 }));
        const failReasons = this.checkSoftFails(student, ep, rules);
        const match = this.scoreMajorMatch(student, ep);
        const historyMin = groupScore.groupMinRank ?? currentRecord?.majorMinRank ?? null;
        const rankDiffRatio = historyMin ? studentRank / historyMin : null;
        const dynamicGradient = calcDynamicGradient({
          studentRank,
          historyMinRank: historyMin,
          currentPlanCount,
          previousPlanCount,
          currentCompetitionCount: batchCompetition.currentCount,
          previousCompetitionCount: batchCompetition.previousCount,
          selectionCompetitionCount: selectionCompetition.eligibleCount,
          subjectCompetitionCount: selectionCompetition.subjectCount,
          selectionDataConfidence: selectionCompetition.sourceType === 'PUBLIC_ESTIMATE' ? 'PUBLIC_ESTIMATE' : 'MISSING',
          supplementary: riskSupplementary,
        });
        return {
          enrollmentPlanId: ep.id,
          universityId: ep.universityId,
          majorId: ep.majorId,
          majorCode: ep.majorCode,
          majorName: ep.majorName,
          majorCategory: ep.major?.category ?? null,
          discipline: ep.major?.discipline ?? null,
          softRating: ep.major?.softRating ?? null,
          description: ep.major?.description ?? null,
          careerDirections: ep.major?.careerDirections ?? null,
          postgraduateDirections: ep.major?.postgraduateDirections ?? null,
          coreCourses: ep.major?.coreCourses ?? null,
          employmentRate: ep.major?.employmentRate ?? null,
          avgSalary: ep.major?.avgSalary ?? null,
          degree: ep.major?.degree ?? null,
          standardDuration: ep.major?.standardDuration ?? ep.duration ?? null,
          satisfactionScore: ep.major?.satisfactionScore ?? null,
          localMasterPoint: ep.major?.localMasterPoint ?? null,
          localDoctoralPoint: ep.major?.localDoctoralPoint ?? null,
          planCount: ep.planCount,
          tuition: ep.tuition,
          duration: ep.duration,
          subjectRequirements: ep.subjectRequirements,
          disciplineEval: ep.disciplineEval,
          isNationalFeature: ep.isNationalFeature,
          majorRanking: ep.majorRanking,
          majorHonor: ep.majorHonor,
          majorStrengthScore: this.majorStrengthScore(ep),
          planNotes: ep.planNotes,
          isSinoForeign: ep.isSinoForeign,
          majorMinScore: currentRecord?.majorMinScore ?? null,
          majorMinRank: currentRecord?.majorMinRank ?? null,
          majorAdmissionCount: currentRecord?.majorAdmissionCount ?? null,
          previousMajorMinScore: previousRecord?.majorMinScore ?? null,
          previousMajorMinRank: previousRecord?.majorMinRank ?? null,
          previousMajorAdmissionCount: previousRecord?.majorAdmissionCount ?? null,
          matchScore: match.score,
          matchReasons: match.reasons,
          rankDiffRatio,
          dynamicGradient,
          suggestedGradient: dynamicGradient.gradient,
          matchStatus: failReasons.length === 0 ? 'PASS' : 'SOFT_FAIL',
          failReasons,
          isRecommendedAnchor: false,
        };
      });

      const visibleMajors = q.includeSoftFails === false
        ? majors.filter((major) => major.matchStatus === 'PASS')
        : majors;
      visibleMajors.sort((a, b) => {
        if (a.matchStatus !== b.matchStatus) return a.matchStatus === 'PASS' ? -1 : 1;
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        const ar = a.rankDiffRatio ?? 999;
        const br = b.rankDiffRatio ?? 999;
        return Math.abs(ar - 1) - Math.abs(br - 1);
      });
      if (visibleMajors[0]) visibleMajors[0].isRecommendedAnchor = true;

      const recommendedAnchor = visibleMajors[0];
      const majorStrengthScore = bestNumber(visibleMajors.map((major) => major.majorStrengthScore), 'max');
      const groupHistoryMin = groupScore.groupMinRank ?? recommendedAnchor?.majorMinRank ?? null;
      const dynamicGradient = calcDynamicGradient({
        studentRank,
        historyMinRank: groupHistoryMin,
        currentPlanCount,
        previousPlanCount,
        currentCompetitionCount: batchCompetition.currentCount,
        previousCompetitionCount: batchCompetition.previousCount,
        selectionCompetitionCount: selectionCompetition.eligibleCount,
        subjectCompetitionCount: selectionCompetition.subjectCount,
        selectionDataConfidence: selectionCompetition.sourceType === 'PUBLIC_ESTIMATE' ? 'PUBLIC_ESTIMATE' : 'MISSING',
        supplementary: riskSupplementary,
      });
      return {
        groupKey,
        universityId: first.universityId,
        universityName: first.university?.name ?? '',
        universityCode: first.university?.code ?? null,
        universityRank: first.university?.softRanking ?? null,
        university: {
          id: first.universityId,
          name: first.university?.name ?? '',
          code: first.university?.code ?? null,
          province: first.university?.province ?? null,
          city: first.university?.city ?? null,
          type: first.university?.type ?? null,
          runningNature: first.university?.runningNature ?? null,
          is985: first.university?.is985 ?? false,
          is211: first.university?.is211 ?? false,
          isDoubleFirstClass: first.university?.isDoubleFirstClass ?? false,
          softRanking: first.university?.softRanking ?? null,
          logoUrl: first.university?.logoUrl ?? null,
        },
        groupCode: first.groupCode,
        groupName: first.groupName,
        batch: first.batch,
        recruitType: first.recruitType,
        subjects: first.subjects,
        currentPlanYear: source.sourceYear,
        previousPlanYear: source.sourceYear - 1,
        currentPlanCount,
        previousPlanCount,
        planCountChange:
          currentPlanCount !== null && previousPlanCount !== null
            ? currentPlanCount - previousPlanCount
            : null,
        groupMinScore: groupScore.groupMinScore,
        groupMinRank: groupScore.groupMinRank,
        groupAdmissionCount: groupScore.groupAdmissionCount,
        scoreSource: groupScore.scoreSource,
        predictedMinRank: predictionMap.get(groupKey) ?? null,
        dynamicGradient,
        competition: batchCompetition,
        selectionCompetition,
        supplementary,
        suggestedGradient: dynamicGradient.gradient,
        anchorMajorMinScore: recommendedAnchor?.majorMinScore ?? null,
        anchorMajorMinRank: recommendedAnchor?.majorMinRank ?? null,
        majorStrengthScore,
        majorCount: rows.length,
        selectableMajorCount: visibleMajors.filter((major) => major.matchStatus === 'PASS').length,
        softFailCount: visibleMajors.filter((major) => major.matchStatus === 'SOFT_FAIL').length,
        matchScore: recommendedAnchor?.matchScore ?? -999,
        matchReasons: recommendedAnchor?.matchReasons ?? [],
        recommendedAnchorEnrollmentPlanId: recommendedAnchor?.enrollmentPlanId ?? null,
        majors: visibleMajors,
      };
    }).filter((group) => group.majors.length > 0);

    this.sortCandidateGroups(resultGroups, q.sort ?? 'MAJOR_MATCH', studentRank);

    const fullResult: CandidateGroupFullResult = {
      total: resultGroups.length,
      planYear: source.planYear,
      sourceYear: source.sourceYear,
      previousYear: source.sourceYear - 1,
      sourceBatchName: source.sourceBatchName,
      isFallbackYear: source.isFallbackYear,
      studentRankUsed: studentRankInfo.rank,
      studentRankSource: studentRankInfo.source,
      storedRank: studentRankInfo.storedRank,
      scoreBasedRank: studentRankInfo.scoreBasedRank,
      sort: q.sort ?? 'MAJOR_MATCH',
      groups: resultGroups,
    };
    this.setCandidateGroupCache(cacheKey, fullResult);
    return this.paginateCandidateGroups(fullResult, page, pageSize);
  }

  async getCandidates(planId: number, q: GetCandidatesQuery, userId?: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: { student: true },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (userId && plan.createdById !== userId && plan.student.userId !== userId) {
      throw new ForbiddenException('无权查看此方案候选池');
    }
    if (!plan.batchName) throw new NotFoundException('方案缺少批次信息');

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: plan.studentId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('学生不存在');

    const province = student.province ?? '四川';
    const subjects = EXAM_TYPE_TO_SUBJECTS[student.examType ?? 'PHYSICS'] || '物理';
    const source = await this.resolveEnrollmentPlanSource({
      planYear: plan.year,
      province,
      batchName: plan.batchName,
      subjects,
    });
    const where = buildHardFilterWhere({
      year: source.sourceYear,
      province,
      batchName: plan.batchName,
      subjects,
      keyword: q.keyword,
    });
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const enrollmentPlanTake = Math.min(Math.max(page * pageSize * 5, 200), 1000);

    const eps = await this.prisma.enrollmentPlan.findMany({
      where,
      include: { university: true, major: true },
      take: enrollmentPlanTake,
    });

    const restrictions = await this.prisma.healthRestriction.findMany();
    const rules: SoftRule[] = [
      new HealthRestrictionRule(restrictions),
      new GenderRule(),
      new HouseholdRule(),
      new EthnicityRule(),
      new TuitionRule(),
      new NatureRule(),
    ];

    const adRecords = eps.length
      ? await this.prisma.admissionRecord.findMany({
          where: this.buildAdmissionRecordWhere(eps, province),
        })
      : [];
    const adIndex = new Map<string, any>();
    for (const ar of adRecords) {
      const key = `${ar.universityId}|${ar.subjects}|${ar.batch}|${ar.recruitType}|${ar.groupCode}|${ar.majorCode}|${ar.majorName}|${ar.year}`;
      adIndex.set(key, ar);
    }

    const getHist = (ep: any) => {
      const k25 = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|2025`;
      const k24 = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|2024`;
      const r25 = adIndex.get(k25);
      const r24 = adIndex.get(k24);
      return {
        score25Group: r25?.groupMinScore ?? null,
        rank25Group: r25?.groupMinRank ?? null,
        score25Major: r25?.majorMinScore ?? null,
        rank25Major: r25?.majorMinRank ?? null,
        score24Major: r24?.majorMinScore ?? null,
        rank24Major: r24?.majorMinRank ?? null,
      };
    };

    const studentRankInfo = await this.resolveStudentRank(student, source.sourceYear);
    const studentRank = studentRankInfo.rank;
    const enriched = eps.map((ep) => {
      const reasons: SoftFailReason[] = [];
      for (const rule of rules) {
        const res = rule.check(student as any, ep as any);
        if (!res.pass && res.reason) reasons.push(res.reason);
      }
      const history = getHist(ep);
      const historyMin = history.rank25Group ?? history.rank25Major ?? null;
      const suggestedGradient = calcGradient(studentRank, historyMin);
      const rankDiffRatio = historyMin ? studentRank / historyMin : null;

      return {
        enrollmentPlanId: ep.id,
        universityId: ep.universityId,
        universityName: ep.university.name,
        groupCode: ep.groupCode,
        groupName: ep.groupName,
        majorId: ep.majorId,
        majorName: ep.majorName,
        majorCode: ep.majorCode,
        recruitType: ep.recruitType,
        planCount: ep.planCount,
        tuition: ep.tuition,
        subjectRequirements: ep.subjectRequirements,
        history,
        rankDiffRatio,
        suggestedGradient,
        matchStatus: reasons.length === 0 ? 'PASS' : 'SOFT_FAIL',
        failReasons: reasons,
      };
    });

    let visible = enriched;
    if (q.includeSoftFails === false) {
      visible = enriched.filter((x) => x.matchStatus === 'PASS');
    }

    visible.sort((a, b) => {
      if (a.matchStatus !== b.matchStatus) return a.matchStatus === 'PASS' ? -1 : 1;
      if (a.failReasons.length !== b.failReasons.length) {
        return a.failReasons.length - b.failReasons.length;
      }
      const ar = a.rankDiffRatio ?? 999;
      const br = b.rankDiffRatio ?? 999;
      return Math.abs(ar - 1) - Math.abs(br - 1);
    });

    const start = (page - 1) * pageSize;
    return {
      total: visible.length,
      page,
      pageSize,
      planYear: source.planYear,
      sourceYear: source.sourceYear,
      sourceBatchName: source.sourceBatchName,
      isFallbackYear: source.isFallbackYear,
      studentRankUsed: studentRankInfo.rank,
      studentRankSource: studentRankInfo.source,
      storedRank: studentRankInfo.storedRank,
      scoreBasedRank: studentRankInfo.scoreBasedRank,
      items: visible.slice(start, start + pageSize),
    };
  }
}
