import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { AuditService } from '../../audit/audit.service';
import {
  StudentProfileSnapshot,
  PlanGenerationJobData,
  PlanItemOutput,
  Bin,
  GradientType,
  CleanlinessLevel,
  TOTAL_GROUPS,
  ScoredCandidate,
  FailureType,
} from '../interfaces/recommend.types';
import { RankCalculatorService } from './rank-calculator.service';
import { RangeAdapterService } from './range-adapter.service';
import { CandidateFilterService } from './candidate-filter.service';
import { ScoringEngineService } from './scoring-engine.service';
import { StabilityAnalyzerService } from './stability-analyzer.service';
import { SupplementaryAnalyzerService } from './supplementary-analyzer.service';
import { BinSamplerService } from './bin-sampler.service';
import { DedupLimiterService } from './dedup-limiter.service';
import { InnerRankerService } from './inner-ranker.service';
import { CleanlinessAssessorService } from './cleanliness-assessor.service';
import { ReasonGeneratorService } from './reason-generator.service';
import { RiskGeneratorService } from './risk-generator.service';

/**
 * Sub-module 16: Plan Generation Orchestrator
 *
 * Orchestrates the full pipeline:
 * filter → score → stability → supplementary → sample → dedup →
 * rank → assess → generate reasons → save
 *
 * Can run synchronously (for light recommendations) or queue
 * an async Bull job (for full plan generation).
 */
@Injectable()
export class PlanGeneratorService {
  private readonly logger = new Logger(PlanGeneratorService.name);

  constructor(
    @InjectQueue('plan-generation') private readonly planQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly rankCalculator: RankCalculatorService,
    private readonly rangeAdapter: RangeAdapterService,
    private readonly candidateFilter: CandidateFilterService,
    private readonly scoringEngine: ScoringEngineService,
    private readonly stabilityAnalyzer: StabilityAnalyzerService,
    private readonly supplementaryAnalyzer: SupplementaryAnalyzerService,
    private readonly binSampler: BinSamplerService,
    private readonly dedupLimiter: DedupLimiterService,
    private readonly innerRanker: InnerRankerService,
    private readonly cleanlinessAssessor: CleanlinessAssessorService,
    private readonly reasonGenerator: ReasonGeneratorService,
    private readonly riskGenerator: RiskGeneratorService,
  ) {}

  // ---- Async generation via Bull queue ----

  async queueGeneration(
    data: PlanGenerationJobData,
    priority = 2,
  ): Promise<string> {
    const job = await this.planQueue.add('generate-plan', data, {
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    this.logger.log(
      `Queued plan generation job ${job.id} for student ${data.studentId}`,
    );

    return job.id!;
  }

  // ---- Synchronous generation (used by Bull processor and light endpoint) ----

  /**
   * Full pipeline execution. Called by the Bull processor or directly.
   *
   * @param onProgress  optional callback for SSE progress updates
   */
  async generatePlan(
    data: PlanGenerationJobData,
    onProgress?: (stage: string, percentage: number, message: string) => void,
  ): Promise<{ planId: number; itemCount: number }> {
    const progress = onProgress || (() => {});

    // Step 0: Load student profile
    progress('loading', 5, '加载学生档案...');
    const student = await this.loadStudentProfile(data.studentId);

    // Override priority mode if specified
    if (data.priorityMode) {
      student.priorityMode = data.priorityMode;
    }

    // Step 1: Calculate rank if only score is available
    progress('rank', 10, '计算位次...');
    let rank = student.provincialRank;
    let rankResult;

    if (!rank && student.totalScore) {
      rankResult = await this.rankCalculator.calculate(
        student.totalScore,
        student.examType,
        student.province,
      );
      rank = rankResult.rank;
    }

    if (!rank) {
      throw this.classifyError(
        FailureType.DATA_ERROR,
        '学生档案缺少位次或成绩数据',
      );
    }

    student.provincialRank = rank;

    // Step 2: Determine range
    progress('range', 15, '计算搜索范围...');
    const range = await this.rangeAdapter.calculate(
      rank,
      rankResult,
      student.province,
    );

    // Apply overrides
    if (data.overrides?.rangeUp) range.rangeUp = data.overrides.rangeUp;
    if (data.overrides?.rangeDown) range.rangeDown = data.overrides.rangeDown;

    // Flag rangeDown expansion for high same-score counts
    if (rankResult?.flagRangeDown) {
      range.rangeDown = Math.round(range.rangeDown * 1.1);
    }

    // Step 3: Filter candidates
    progress('filtering', 20, '筛选中...');
    const candidates = await this.candidateFilter.filter(
      student,
      range,
      data.batch,
    );

    if (candidates.length === 0) {
      throw this.classifyError(
        FailureType.DATA_ERROR,
        '未找到符合条件的候选院校专业，请检查筛选条件或扩大范围',
      );
    }

    this.logger.log(`Filtered ${candidates.length} candidates`);

    // Step 4: Initial scoring
    progress('scoring', 35, '评分中...');
    const totalBins = data.overrides?.totalGroups || TOTAL_GROUPS;
    let scoredCandidates = candidates.map((c, i) => {
      const approxBinIndex = Math.round(
        ((c.majorMinRank || rank) - (rank - range.rangeUp)) /
          ((range.rangeUp + range.rangeDown) / totalBins),
      );
      return this.scoringEngine.scoreCandidate(
        c,
        student,
        Math.max(0, Math.min(totalBins - 1, approxBinIndex)),
        totalBins,
      );
    });

    // Step 5: Stability analysis
    progress('stability', 45, '分析录取稳定性...');
    const stabilityMap = await this.stabilityAnalyzer.analyzeBatch(
      scoredCandidates,
      student.province,
      student.examYear - 1,
    );

    // Step 6: Apply stability and data reliability corrections
    progress('correction', 55, '修正评分...');
    scoredCandidates = scoredCandidates.map((c) => {
      const key = `${c.universityId}:${c.majorId}`;
      const stability = stabilityMap.get(key);
      const stabilityFactor = stability?.stabilityFactor ?? 0.8;
      const dataReliabilityFactor =
        this.scoringEngine.calcDataReliabilityFactor(
          c.year,
          student.examYear,
        );

      return this.scoringEngine.applyCorrection(
        c,
        stabilityFactor,
        dataReliabilityFactor,
        0,
      );
    });

    // Step 7: Bin sampling
    progress('binning', 60, '排序中...');
    let bins = this.binSampler.createBins(
      scoredCandidates,
      rank,
      range.rangeUp,
      range.rangeDown,
      totalBins,
    );

    // Step 8: Supplementary analysis (applied per-bin based on t)
    progress('supplementary', 65, '分析征集志愿趋势...');
    for (const bin of bins) {
      if (!bin.anchor) continue;
      const t = bins.length > 1 ? bin.index / (bins.length - 1) : 0.5;
      const suppResult = await this.supplementaryAnalyzer.analyze(
        bin.anchor,
        t,
        student.province,
      );

      if (suppResult.scoreAdjustment !== 0) {
        bin.anchor = this.scoringEngine.applyCorrection(
          bin.anchor,
          bin.anchor.stabilityFactor,
          bin.anchor.dataReliabilityFactor,
          suppResult.scoreAdjustment,
        );
        if (suppResult.riskNote) {
          bin.anchor.supplementaryRiskNote = suppResult.riskNote;
        }
      }
    }

    // Step 9: Deduplication
    progress('dedup', 70, '去重中...');
    bins = this.dedupLimiter.dedup(bins);

    // Step 10: Build plan items
    progress('building', 80, '生成方案...');
    const planItems: PlanItemOutput[] = [];
    let sequence = 1;

    for (const bin of bins) {
      if (!bin.anchor) continue;

      const anchor = bin.anchor;
      const gradient = BinSamplerService.toDbGradient(bin.gradient);

      // Inner ranking
      const groupCandidates = bin.candidates.filter(
        (c) => c.universityId === anchor.universityId,
      );
      const majorRanking = await this.innerRanker.rankMajorsInGroup(
        anchor,
        groupCandidates,
        student,
      );

      // Cleanliness assessment
      const cleanResult = this.cleanlinessAssessor.assess(
        groupCandidates,
        student,
      );

      // Reason generation
      const selectionReason = this.reasonGenerator.generate(
        anchor,
        student,
        bin.gradient,
        cleanResult.level,
      );

      // Risk warnings
      const riskWarning = this.riskGenerator.generate(
        anchor,
        bin.gradient,
        cleanResult.level,
        cleanResult.adjustmentAdvice,
      );

      // Fetch historical data for the plan item
      const historicalData = await this.fetchHistoricalData(
        anchor.universityId,
        anchor.majorId,
        student.province,
        student.examYear,
        anchor.enrollmentGroupCode,
      );

      planItems.push({
        sequence: sequence++,
        gradient,
        universityId: anchor.universityId,
        universityName: anchor.universityName,
        universityCode: anchor.universityCode,
        groupCode: anchor.enrollmentGroupCode,
        groupName: anchor.enrollmentGroupName,
        majorId: anchor.majorId,
        majorName: anchor.majorName,
        majorCode: anchor.majorCode,
        anchorMajor: anchor.majorName,
        groupMajorCount: majorRanking.length,
        recommendedOrder: majorRanking
          .map((m) => m.majorName)
          .join('→'),
        fullMajorRanking: majorRanking,
        subjectRequirement: anchor.subjectRequirements || anchor.subjects,
        schoolNature: anchor.runningNature,
        schoolTags: anchor.universityTags
          ? JSON.stringify(anchor.universityTags)
          : null,
        acceptAdjust: true,
        ...historicalData,
        planCount: anchor.planCount,
        tuition: anchor.tuition,
        cleanliness: cleanResult.level,
        selectionReason,
        riskWarning: riskWarning || undefined,
        adjustmentAdvice: cleanResult.adjustmentAdvice || undefined,
        isManuallyModified: false,
        compositeScore: anchor.compositeScore,
        scoreBreakdown: anchor.scoreBreakdown,
      });
    }

    // Step 11: Save to database
    progress('saving', 90, '保存方案...');
    const planId = await this.savePlan(data, student, planItems, range);

    // Step 12: Audit and notify
    progress('complete', 100, '完成');
    await this.auditService.log({
      userId: data.createdById,
      action: 'PLAN_GENERATED',
      entityType: 'VolunteerPlan',
      entityId: planId,
      newValue: { itemCount: planItems.length, totalGroups: totalBins },
    });

    await this.notificationService.send({
      userId: data.createdById,
      type: 'plan_generated',
      title: '方案生成完成',
      content: `已为学生生成${planItems.length}个志愿，请查看方案详情。`,
      refType: 'VolunteerPlan',
      refId: planId,
    });

    return { planId, itemCount: planItems.length };
  }

  // ---- Light recommendation (Top 30, no persistence) ----

  async lightRecommend(
    studentId: number,
    limit = 30,
  ): Promise<ScoredCandidate[]> {
    const student = await this.loadStudentProfile(studentId);

    if (!student.provincialRank && student.totalScore) {
      const rankResult = await this.rankCalculator.calculate(
        student.totalScore,
        student.examType,
        student.province,
      );
      student.provincialRank = rankResult.rank;
    }

    if (!student.provincialRank) {
      throw new NotFoundException('学生档案缺少位次或成绩数据');
    }

    const range = await this.rangeAdapter.calculate(
      student.provincialRank,
      undefined,
      student.province,
    );

    const candidates = await this.candidateFilter.filter(student, range);

    const scored = candidates.map((c, i) => {
      const approxBin = Math.round(
        ((c.majorMinRank || student.provincialRank) -
          (student.provincialRank - range.rangeUp)) /
          ((range.rangeUp + range.rangeDown) / 30),
      );
      return this.scoringEngine.scoreCandidate(
        c,
        student,
        Math.max(0, Math.min(29, approxBin)),
        30,
      );
    });

    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    return scored.slice(0, limit);
  }

  // ---- Private helpers ----

  async loadStudentProfile(
    studentId: number,
  ): Promise<StudentProfileSnapshot> {
    const sp = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!sp) {
      throw new NotFoundException(`Student profile ${studentId} not found`);
    }

    return {
      id: sp.id,
      userId: sp.userId,
      province: sp.province || '四川',
      examType: sp.examType || 'PHYSICS',
      examYear: sp.examYear || new Date().getFullYear(),
      totalScore: sp.totalScore || 0,
      provincialRank: sp.provincialRank || 0,
      firstChoice: sp.firstChoice,
      reChoices: sp.reChoices as string[] | null,
      colorBlind: sp.colorBlind,
      colorWeak: sp.colorWeak,
      vision: sp.vision,
      physicalLimits: sp.physicalLimits as Record<string, any> | null,
      priorityMode:
        (sp.priorityMode as StudentProfileSnapshot['priorityMode']) ||
        'UNIVERSITY_FIRST',
      preferredProvinces: sp.preferredProvinces as string[] | null,
      preferredCities: sp.preferredCities as string[] | null,
      preferredMajors: sp.preferredMajors as string[] | null,
      preferredMajorCategories: sp.preferredMajorCategories as string[] | null,
      preferredUniversities: sp.preferredUniversities as string[] | null,
      preferredUniversityTypes: sp.preferredUniversityTypes as string[] | null,
      preferredTags: sp.preferredTags as string[] | null,
      excludedProvinces: sp.excludedProvinces as string[] | null,
      excludedCities: sp.excludedCities as string[] | null,
      excludedUniversities: sp.excludedUniversities as string[] | null,
      excludedMajors: sp.excludedMajors as string[] | null,
      tuitionBudget:
        (sp.tuitionBudget as StudentProfileSnapshot['tuitionBudget']) || null,
      acceptSinoForeign: sp.acceptSinoForeign,
      acceptPrivate: sp.acceptPrivate,
      careerPlan: sp.careerPlan,
      stayPreference: sp.stayPreference,

      // Extended fields for region eligibility and career alignment
      city: sp.city,
      county: sp.county,
      careerDirection: sp.careerDirection,
      teacherInterest: sp.teacherInterest,
      militaryInterest: sp.militaryInterest,
      isRural: sp.isRural,
    };
  }

  private async fetchHistoricalData(
    universityId: number,
    majorId: number,
    province: string,
    currentYear: number,
    groupCode?: string | null,
  ): Promise<Record<string, number | null>> {
    // Fetch records for last 3 years
    const records = await this.prisma.admissionRecord.findMany({
      where: {
        universityId,
        majorId,
        province,
        year: { gte: currentYear - 4, lte: currentYear - 1 },
      },
      orderBy: { year: 'desc' },
    });

    const byYear = new Map<number, any>();
    for (const r of records) {
      byYear.set(r.year, r);
    }

    const y1 = byYear.get(currentYear - 1); // Most recent (e.g., 2025)
    const y2 = byYear.get(currentYear - 2); // Previous (e.g., 2024)

    // Group-level data (if available)
    let score25Group: number | null = null;
    let rank25Group: number | null = null;

    if (groupCode && y1) {
      score25Group = y1.groupMinScore;
      rank25Group = y1.groupMinRank;
    }

    // 3-year average min rank
    const ranks = records
      .map((r) => r.majorMinRank)
      .filter((r): r is number => r !== null);
    const avgMinRank3y =
      ranks.length > 0
        ? Math.round(ranks.reduce((s, r) => s + r, 0) / ranks.length)
        : null;

    return {
      score25Group,
      rank25Group,
      score25Major: y1?.majorMinScore ?? null,
      rank25Major: y1?.majorMinRank ?? null,
      score24Major: y2?.majorMinScore ?? null,
      rank24Major: y2?.majorMinRank ?? null,
      lastYearMinScore: y1?.majorMinScore ?? null,
      lastYearMinRank: y1?.majorMinRank ?? null,
      lastYearAvgScore: y1?.majorAvgScore ?? null,
      lastYearAvgRank: y1?.majorAvgRank ?? null,
      avgMinRank3y,
    };
  }

  private async savePlan(
    data: PlanGenerationJobData,
    student: StudentProfileSnapshot,
    items: PlanItemOutput[],
    range: { rangeUp: number; rangeDown: number },
  ): Promise<number> {
    const plan = await this.prisma.volunteerPlan.create({
      data: {
        studentId: data.studentId,
        createdById: data.createdById,
        name: `智能推荐方案 ${new Date().toLocaleDateString('zh-CN')}`,
        year: student.examYear,
        province: student.province,
        status: 'DRAFT',
        batch: data.batch as any,
        scoreUsed: student.totalScore,
        rankUsed: student.provincialRank,
        priorityMode: student.priorityMode as any,
        rangeUp: range.rangeUp,
        rangeDown: range.rangeDown,
        totalGroups: items.length,
        algorithmParams: {
          version: 'v4.4',
          priorityMode: student.priorityMode,
          rangeUp: range.rangeUp,
          rangeDown: range.rangeDown,
          overrides: data.overrides,
        },
        planItems: {
          create: items.map((item) => ({
            sequence: item.sequence,
            gradient: item.gradient,
            universityId: item.universityId,
            universityName: item.universityName,
            universityCode: item.universityCode,
            groupCode: item.groupCode,
            groupName: item.groupName,
            majorId: item.majorId,
            majorName: item.majorName,
            majorCode: item.majorCode,
            anchorMajor: item.anchorMajor,
            groupMajorCount: item.groupMajorCount,
            recommendedOrder: item.recommendedOrder,
            fullMajorRanking: item.fullMajorRanking,
            subjectRequirement: item.subjectRequirement,
            schoolNature: item.schoolNature,
            schoolTags: item.schoolTags,
            acceptAdjust: item.acceptAdjust,
            score25Group: item.score25Group,
            rank25Group: item.rank25Group,
            score25Major: item.score25Major,
            rank25Major: item.rank25Major,
            score24Major: item.score24Major,
            rank24Major: item.rank24Major,
            lastYearMinScore: item.lastYearMinScore,
            lastYearMinRank: item.lastYearMinRank,
            lastYearAvgScore: item.lastYearAvgScore,
            lastYearAvgRank: item.lastYearAvgRank,
            avgMinRank3y: item.avgMinRank3y,
            planCount: item.planCount,
            tuition: item.tuition,
            cleanliness: item.cleanliness,
            selectionReason: item.selectionReason,
            riskWarning: item.riskWarning,
            adjustmentAdvice: item.adjustmentAdvice,
            isManuallyModified: false,
            compositeScore: item.compositeScore,
            scoreBreakdown: item.scoreBreakdown as any,
          })),
        },
      },
    });

    return plan.id;
  }

  private classifyError(type: FailureType, message: string): Error {
    const err = new Error(message);
    (err as any).failureType = type;
    return err;
  }
}
