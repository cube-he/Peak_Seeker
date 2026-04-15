import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  StudentProfileSnapshot,
  RawCandidate,
  RangeResult,
  TuitionBudgetLevel,
} from '../interfaces/recommend.types';
import { HealthFilterService, CheckResult } from './health-filter.service';
import { RegionFilterService } from './region-filter.service';

/**
 * Sub-module 4: Candidate Filter (CRITICAL)
 *
 * Applies hard filters on AdmissionRecord + EnrollmentPlan to produce
 * a raw candidate list. Uses composite indexes for performance.
 *
 * Filter chain:
 *   1. Rank range (from RangeAdapter)
 *   2. Subject matching (选科 vs enrollment requirements)
 *   3. Batch filter
 *   4. Excluded universities/majors/cities/provinces
 *   5. Physical condition restrictions
 *   6. Tuition budget filter
 *   7. Sino-foreign cooperation filter
 */
@Injectable()
export class CandidateFilterService {
  private readonly logger = new Logger(CandidateFilterService.name);

  private static readonly TUITION_LIMITS: Record<TuitionBudgetLevel, number> = {
    LOW: 6000,
    MEDIUM: 15000,
    HIGH: 30000,
    UNLIMITED: Infinity,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthFilter: HealthFilterService,
    private readonly regionFilter: RegionFilterService,
  ) {}

  async filter(
    student: StudentProfileSnapshot,
    range: RangeResult,
    batch?: string,
  ): Promise<RawCandidate[]> {
    // Initialize health and region filters (idempotent — only loads once)
    await this.healthFilter.loadRestrictions();
    await this.regionFilter.loadRegions();
    const studentConditions = this.healthFilter.mapLegacyConditions(
      student.colorBlind, student.colorWeak, student.physicalLimits,
    );

    const { provincialRank, province, examYear } = student;
    const year = examYear - 1; // Use previous year's admission data as reference

    // Step 1: Query admission records within rank range
    // Uses the [year, province, batch] and [majorMinRank] indexes
    const whereClause: any = {
      province,
      year,
      majorMinRank: {
        gte: provincialRank - range.rangeDown,
        lte: provincialRank + range.rangeUp,
      },
    };

    if (batch) {
      whereClause.batch = batch;
    }

    const admissionRecords = await this.prisma.admissionRecord.findMany({
      where: whereClause,
      include: {
        university: true,
        major: true,
      },
      orderBy: { majorMinRank: 'asc' },
      take: 2000, // Safety limit for initial query
    });

    this.logger.debug(
      `Initial query returned ${admissionRecords.length} admission records`,
    );

    // Step 2: Fetch current year enrollment plans for these university+major combos
    const uniMajorPairs = admissionRecords.map((r) => ({
      universityId: r.universityId,
      majorId: r.majorId,
    }));

    // Batch query enrollment plans
    const enrollmentPlans = await this.fetchEnrollmentPlans(
      uniMajorPairs,
      examYear,
      province,
    );

    const enrollmentMap = new Map<string, any>();
    for (const ep of enrollmentPlans) {
      const key = `${ep.universityId}:${ep.majorId}`;
      enrollmentMap.set(key, ep);
    }

    // Step 3: Apply all hard filters
    const candidates: RawCandidate[] = [];

    for (const record of admissionRecords) {
      const uni = record.university;
      const major = record.major;
      const epKey = `${record.universityId}:${record.majorId}`;
      const ep = enrollmentMap.get(epKey);

      // Filter: Excluded universities
      if (this.isExcludedUniversity(uni, student)) continue;

      // Filter: Excluded majors
      if (this.isExcludedMajor(major, student)) continue;

      // Filter: Excluded cities/provinces
      if (this.isExcludedLocation(uni, student)) continue;

      // Filter: Subject matching
      if (ep && !this.matchesSubjects(ep, student)) continue;

      // Filter: Health restriction (replaces old hasPhysicalRestriction)
      const healthCheck = this.healthFilter.checkCandidate(studentConditions, {
        majorCategory: major.category,
        majorCode: major.code,
      });
      if (healthCheck.excluded) continue;

      // Filter: Region eligibility
      const specialProgram = this.regionFilter.detectSpecialProgram(
        record.batch, ep?.planNotes,
      );
      if (specialProgram) {
        const eligibility = this.regionFilter.isEligible(specialProgram, {
          city: student.city || null,
          county: student.county || null,
        });
        if (!eligibility.eligible) continue;
      }

      // Filter: Tuition budget
      if (ep && !this.withinTuitionBudget(ep, student)) continue;

      // Filter: Sino-foreign cooperation
      if (ep?.isSinoForeign && !student.acceptSinoForeign) continue;

      // Filter: Private university acceptance
      if (
        uni.runningNature === '民办' &&
        student.acceptPrivate === 'STRICT'
      ) {
        continue;
      }

      candidates.push(this.buildCandidate(record, uni, major, ep, healthCheck, specialProgram));
    }

    this.logger.debug(
      `After filtering: ${candidates.length} candidates from ${admissionRecords.length} records`,
    );

    return candidates;
  }

  // ---- Private filter helpers ----

  private isExcludedUniversity(
    uni: any,
    student: StudentProfileSnapshot,
  ): boolean {
    if (!student.excludedUniversities?.length) return false;
    return student.excludedUniversities.includes(uni.name);
  }

  private isExcludedMajor(
    major: any,
    student: StudentProfileSnapshot,
  ): boolean {
    if (!student.excludedMajors?.length) return false;
    return (
      student.excludedMajors.includes(major.name) ||
      student.excludedMajors.includes(major.category)
    );
  }

  private isExcludedLocation(
    uni: any,
    student: StudentProfileSnapshot,
  ): boolean {
    if (student.excludedProvinces?.length && uni.province) {
      if (student.excludedProvinces.includes(uni.province)) return true;
    }
    if (student.excludedCities?.length && uni.city) {
      if (student.excludedCities.includes(uni.city)) return true;
    }
    return false;
  }

  /**
   * Subject matching: check if the student's 选科 meets enrollment requirements.
   * The enrollment plan's `subjects` field contains required subjects (e.g., "物理+化学").
   * The student's firstChoice + reChoices represent their selected subjects.
   */
  private matchesSubjects(ep: any, student: StudentProfileSnapshot): boolean {
    if (!ep.subjects && !ep.subjectRequirements) return true;

    const requirements = ep.subjectRequirements || ep.subjects;
    if (!requirements || requirements === '不限') return true;

    // Build student's subject set
    const studentSubjects = new Set<string>();
    if (student.firstChoice) studentSubjects.add(student.firstChoice);
    if (student.reChoices) {
      for (const s of student.reChoices) studentSubjects.add(s);
    }

    // If no student subjects recorded, skip this filter (permissive)
    if (studentSubjects.size === 0) return true;

    // Parse requirement: "物理" means must have 物理; "物理+化学" means must have both
    // "物理或化学" means must have at least one
    if (requirements.includes('+') || requirements.includes('和')) {
      const required = requirements.split(/[+和]/).map((s: string) => s.trim());
      return required.every((r: string) => studentSubjects.has(r));
    }

    if (requirements.includes('或') || requirements.includes('/')) {
      const options = requirements.split(/[或/]/).map((s: string) => s.trim());
      return options.some((o: string) => studentSubjects.has(o));
    }

    // Single subject requirement
    return studentSubjects.has(requirements.trim());
  }

  private withinTuitionBudget(
    ep: any,
    student: StudentProfileSnapshot,
  ): boolean {
    if (!student.tuitionBudget || student.tuitionBudget === 'UNLIMITED')
      return true;
    if (!ep.tuition) return true; // No tuition data, assume ok

    const limit = CandidateFilterService.TUITION_LIMITS[student.tuitionBudget];
    return ep.tuition <= limit;
  }

  // ---- Data fetching ----

  private async fetchEnrollmentPlans(
    pairs: { universityId: number; majorId: number }[],
    year: number,
    province: string,
  ): Promise<any[]> {
    if (pairs.length === 0) return [];

    // Deduplicate pairs
    const uniqueKeys = new Set(pairs.map((p) => `${p.universityId}:${p.majorId}`));
    const uniquePairs = [...uniqueKeys].map((k) => {
      const [uid, mid] = k.split(':').map(Number);
      return { universityId: uid, majorId: mid };
    });

    // Query in batches to avoid query size limits
    const batchSize = 500;
    const results: any[] = [];

    for (let i = 0; i < uniquePairs.length; i += batchSize) {
      const chunk = uniquePairs.slice(i, i + batchSize);
      const batch = await this.prisma.enrollmentPlan.findMany({
        where: {
          year,
          province,
          OR: chunk.map((p) => ({
            universityId: p.universityId,
            majorId: p.majorId,
          })),
        },
      });
      results.push(...batch);
    }

    return results;
  }

  // ---- Build candidate ----

  private buildCandidate(
    record: any,
    uni: any,
    major: any,
    ep: any | undefined,
    healthCheck: CheckResult,
    specialProgram: string | null,
  ): RawCandidate {
    return {
      admissionRecordId: record.id,
      universityId: record.universityId,
      majorId: record.majorId,
      year: record.year,
      province: record.province,
      batch: record.batch,
      majorMinRank: record.majorMinRank,
      majorMinScore: record.majorMinScore,
      majorAvgRank: record.majorAvgRank,
      majorAdmissionCount: record.majorAdmissionCount,
      groupMinRank: record.groupMinRank,
      groupCode: ep?.groupCode ?? null,

      universityName: uni.name,
      universityCode: uni.code,
      universityProvince: uni.province,
      universityCity: uni.city,
      is985: uni.is985,
      is211: uni.is211,
      isDoubleFirstClass: uni.isDoubleFirstClass,
      runningNature: uni.runningNature,
      universityType: uni.type,
      universityTags: uni.tags,
      postgradRate: uni.postgradRate,
      softRanking: uni.softRanking,

      majorName: major.name,
      majorCode: major.code,
      majorCategory: major.category,
      majorLevel: major.level,
      discipline: major.discipline,

      planCount: ep?.planCount ?? null,
      tuition: ep?.tuition ?? null,
      isSinoForeign: ep?.isSinoForeign ?? false,
      subjects: ep?.subjects ?? null,
      subjectRequirements: ep?.subjectRequirements ?? null,
      enrollmentGroupCode: ep?.groupCode ?? null,
      enrollmentGroupName: ep?.groupName ?? null,
      enrollmentGroupMajors: ep?.groupMajors ?? null,
      enrollmentGroupPlanCount: ep?.groupPlanCount ?? null,

      disciplineEval: ep?.disciplineEval ?? null,
      isNationalFeature: ep?.isNationalFeature ?? false,
      majorRanking: ep?.majorRanking ?? null,
      majorHonor: ep?.majorHonor ?? null,

      // Enriched university data
      universityEmploymentRate: uni.employmentRate ?? null,
      universityFurtherStudyRate: uni.furtherStudyRate ?? null,
      universityAvgSalary: uni.avgSalary ?? null,
      universitySatisfactionOverall: uni.satisfactionOverall ?? null,
      universityRankingAlumni: uni.rankingAlumni ?? null,
      universityRankingQS: uni.rankingQS ?? null,
      universityRankingUSNews: uni.rankingUSNews ?? null,

      // Enriched major data
      majorCareerDirections: major.careerDirections ?? null,
      majorPostgraduateDirections: major.postgraduateDirections ?? null,
      majorSatisfactionScore: major.satisfactionScore ?? null,

      // Filter metadata
      healthRisks: healthCheck.risks,
      specialProgram: specialProgram,
    };
  }
}
