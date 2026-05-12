import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildHardFilterWhere } from './filters/hard-filter';
import { GenderRule } from './filters/soft-rules/gender.rule';
import { HealthRestrictionRule } from './filters/soft-rules/health-restriction.rule';
import { HouseholdRule } from './filters/soft-rules/household.rule';
import { EthnicityRule } from './filters/soft-rules/ethnicity.rule';
import { TuitionRule } from './filters/soft-rules/tuition.rule';
import { NatureRule } from './filters/soft-rules/nature.rule';
import { SoftRule, SoftFailReason } from './filters/soft-rule.interface';
import { calcGradient } from './gradient-calculator';

interface GetCandidatesQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  includeSoftFails?: boolean;
}

interface EnrollmentPlanSourceInput {
  planYear: number;
  province: string;
  batchName: string;
  subjects: string;
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

const EXAM_TYPE_TO_SUBJECTS: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
  COMPREHENSIVE_LIBERAL: '文科',
  COMPREHENSIVE_SCIENCE: '理科',
};

@Injectable()
export class PlanCandidateService {
  constructor(private prisma: PrismaService) {}

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

  private buildAdmissionRecordWhere(eps: any[], province: string) {
    const where: Record<string, unknown> = {
      year: { in: [2024, 2025] },
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

    const studentRank = student.provincialRank ?? 999999;
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
      items: visible.slice(start, start + pageSize),
    };
  }
}
