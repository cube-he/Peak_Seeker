// plan-candidate.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
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
  rankRangeUp?: number;
  rankRangeDown?: number;
}

const EXAM_TYPE_TO_SUBJECTS: Record<string, string> = {
  PHYSICS: '物理', HISTORY: '历史',
  COMPREHENSIVE_LIBERAL: '文科', COMPREHENSIVE_SCIENCE: '理科',
};

@Injectable()
export class PlanCandidateService {
  constructor(private prisma: PrismaService) {}

  async getCandidates(planId: number, q: GetCandidatesQuery) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!plan.batchName) throw new NotFoundException('方案缺少批次信息');

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: plan.studentId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('学生不存在');

    const subjects = EXAM_TYPE_TO_SUBJECTS[student.examType ?? 'PHYSICS'] || '物理';
    const where = buildHardFilterWhere({
      year: plan.year, province: student.province ?? '四川',
      batchName: plan.batchName, subjects, keyword: q.keyword,
    });

    const eps = await this.prisma.enrollmentPlan.findMany({
      where, include: { university: true, major: true },
      take: 5000,
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

    // Batch-query AdmissionRecord history for all enrollment plans
    const naturalKeys = eps.map((ep) => ({
      universityId: ep.universityId, subjects: ep.subjects, batch: ep.batch,
      recruitType: ep.recruitType, groupCode: ep.groupCode,
      majorCode: ep.majorCode, majorName: ep.majorName,
    }));
    const adRecords = await this.prisma.admissionRecord.findMany({
      where: { OR: naturalKeys.map((k) => ({ ...k, year: { in: [2024, 2025] } })) },
    });
    const adIndex = new Map<string, any>();
    for (const ar of adRecords) {
      const key = `${ar.universityId}|${ar.subjects}|${ar.batch}|${ar.recruitType}|${ar.groupCode}|${ar.majorCode}|${ar.majorName}|${ar.year}`;
      adIndex.set(key, ar);
    }
    function getHist(ep: any) {
      const k25 = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|2025`;
      const k24 = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|2024`;
      const r25 = adIndex.get(k25), r24 = adIndex.get(k24);
      return {
        score25Group: r25?.groupMinScore ?? null, rank25Group: r25?.groupMinRank ?? null,
        score25Major: r25?.majorMinScore ?? null, rank25Major: r25?.majorMinRank ?? null,
        score24Major: r24?.majorMinScore ?? null, rank24Major: r24?.majorMinRank ?? null,
      };
    }

    const studentRank = student.provincialRank ?? 999999;

    const enriched = eps.map((ep) => {
      const reasons: SoftFailReason[] = [];
      for (const r of rules) {
        const res = r.check(student as any, ep as any);
        if (!res.pass && res.reason) reasons.push(res.reason);
      }
      const matchStatus = reasons.length === 0 ? 'PASS' : 'SOFT_FAIL';
      const history = getHist(ep);
      const historyMin = history.rank25Group ?? history.rank25Major ?? null;
      const suggestedGradient = calcGradient(studentRank, historyMin);
      const rankDiffRatio = historyMin ? studentRank / historyMin : null;
      return {
        enrollmentPlanId: ep.id,
        universityId: ep.universityId, universityName: ep.university.name,
        groupCode: ep.groupCode, groupName: ep.groupName,
        majorId: ep.majorId, majorName: ep.majorName, majorCode: ep.majorCode,
        recruitType: ep.recruitType, planCount: ep.planCount, tuition: ep.tuition,
        subjectRequirements: ep.subjectRequirements,
        history, rankDiffRatio, suggestedGradient,
        matchStatus, failReasons: reasons,
      };
    });

    let visible = enriched;
    if (q.includeSoftFails === false) {
      visible = enriched.filter((x) => x.matchStatus === 'PASS');
    }

    visible.sort((a, b) => {
      if (a.matchStatus !== b.matchStatus) return a.matchStatus === 'PASS' ? -1 : 1;
      const af = a.failReasons.length, bf = b.failReasons.length;
      if (af !== bf) return af - bf;
      const ar = a.rankDiffRatio ?? 999;
      const br = b.rankDiffRatio ?? 999;
      return Math.abs(ar - 1) - Math.abs(br - 1);
    });

    const start = (q.page - 1) * q.pageSize;
    return {
      total: visible.length,
      page: q.page, pageSize: q.pageSize,
      items: visible.slice(start, start + q.pageSize),
    };
  }
}
