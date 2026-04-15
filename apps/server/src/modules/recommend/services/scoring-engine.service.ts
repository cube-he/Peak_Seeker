import { Injectable, Logger } from '@nestjs/common';
import {
  RawCandidate,
  ScoredCandidate,
  ScoreBreakdown,
  StudentProfileSnapshot,
  PriorityMode,
  TOTAL_GROUPS,
} from '../interfaces/recommend.types';
import { ProspectScorerService, ProspectScore } from './prospect-scorer.service';
import { CareerAlignmentService } from './career-alignment.service';

/**
 * Sub-module 5: Scoring Engine (CRITICAL)
 *
 * 4-layer dynamic weighted scoring system.
 * Weights shift as t moves from 0 (冲端) to 1 (保端).
 *
 * Mode A (院校优先, default):
 *   total = tier×W(t,5.0,3.5) + nature×W(t,3.0,3.5) + major×W(t,2.0,3.0)
 *         + other×W(t,1.5,2.5) + bonus
 *
 * Mode B (专业优先):
 *   total = major×W(t,5.0,3.5) + nature×W(t,3.0,3.5) + tier×W(t,2.0,3.0)
 *         + other×W(t,1.5,2.5) + bonus
 */
@Injectable()
export class ScoringEngineService {
  private readonly logger = new Logger(ScoringEngineService.name);

  constructor(
    private readonly prospectScorer: ProspectScorerService,
    private readonly careerAlignment: CareerAlignmentService,
  ) {}

  /**
   * Score a batch of candidates.
   *
   * @param candidates  raw candidates from CandidateFilter
   * @param student     student profile snapshot
   * @param binIndex    the bin index (0-based) this candidate belongs to
   * @param totalBins   total number of bins
   */
  scoreCandidate(
    candidate: RawCandidate,
    student: StudentProfileSnapshot,
    binIndex: number,
    totalBins: number,
  ): ScoredCandidate {
    const t = totalBins > 1 ? binIndex / (totalBins - 1) : 0.5;
    const mode = student.priorityMode || 'UNIVERSITY_FIRST';

    // ---- Dimension raw scores ----
    const tierRaw = this.calcTierScore(candidate);
    const natureRaw = this.calcNatureScore(candidate);
    const { total: majorRaw, recommendScore: majorRecommendScore, disciplineScore: majorDisciplineScore } =
      this.calcMajorScore(candidate, student);
    const { total: otherRaw, planScore, postgradScore, locationScore } =
      this.calcOtherScore(candidate, student);
    const bonus = this.calcBonus(candidate, student);

    // ---- 5th Dimension: Prospect ----
    const prospect = this.prospectScorer.score(candidate, student.careerPlan);

    // ---- Career alignment bonus ----
    const careerBonus = this.careerAlignment.calcBonus(
      {
        careerDirection: student.careerDirection,
        careerPlan: student.careerPlan,
        teacherInterest: student.teacherInterest ?? false,
        militaryInterest: student.militaryInterest ?? false,
      },
      {
        careerDirections: candidate.majorCareerDirections,
        postgraduateDirections: candidate.majorPostgraduateDirections,
        majorCategory: candidate.majorCategory,
        batch: candidate.batch,
      },
    );

    // ---- Dynamic weights based on t and mode ----
    let tierWeight: number;
    let natureWeight: number;
    let majorWeight: number;
    let otherWeight: number;

    if (mode === 'MAJOR_FIRST') {
      // Mode B: major leads
      majorWeight = this.W(t, 5.0, 3.5);
      natureWeight = this.W(t, 3.0, 3.5);
      tierWeight = this.W(t, 2.0, 3.0);
      otherWeight = this.W(t, 1.5, 2.5);
    } else {
      // Mode A: university leads (also default for BALANCED and CITY_FIRST)
      tierWeight = this.W(t, 5.0, 3.5);
      natureWeight = this.W(t, 3.0, 3.5);
      majorWeight = this.W(t, 2.0, 3.0);
      otherWeight = this.W(t, 1.5, 2.5);
    }

    // Prospect weight varies by mode
    let prospectWeight: number;
    if (mode === 'MAJOR_FIRST') {
      prospectWeight = this.W(t, 1.5, 2.5);
    } else if (mode === 'CITY_FIRST' || mode === 'BALANCED') {
      prospectWeight = this.W(t, 1.0, 2.0);
    } else {
      prospectWeight = this.W(t, 1.0, 2.5); // UNIVERSITY_FIRST default
    }

    const rawTotal =
      tierRaw * tierWeight +
      natureRaw * natureWeight +
      majorRaw * majorWeight +
      otherRaw * otherWeight +
      prospect.prospectRaw * prospectWeight +
      bonus + careerBonus;

    const breakdown: ScoreBreakdown = {
      tier: tierRaw * tierWeight,
      tierRaw,
      nature: natureRaw * natureWeight,
      natureRaw,
      major: majorRaw * majorWeight,
      majorRaw,
      majorRecommendScore,
      majorDisciplineScore,
      other: otherRaw * otherWeight,
      otherRaw,
      otherPlanScore: planScore,
      otherPostgradScore: postgradScore,
      otherLocationScore: locationScore,
      bonus: bonus + careerBonus,
      rawTotal,
      adjustedTotal: rawTotal, // Will be corrected later by stability/reliability
      weight_t: t,

      // 5th dimension: prospect
      prospect: prospect.prospectRaw * prospectWeight,
      prospectRaw: prospect.prospectRaw,
      prospectEmployment: prospect.prospectEmployment,
      prospectSalary: prospect.prospectSalary,
      prospectSatisfaction: prospect.prospectSatisfaction,
      prospectConditional: prospect.prospectConditional,
      prospectRanking: prospect.prospectRanking,

      // Career alignment
      careerAlignmentBonus: careerBonus,
    };

    return {
      ...candidate,
      compositeScore: rawTotal,
      scoreBreakdown: breakdown,
      stabilityFactor: 1.0, // Set later by StabilityAnalyzer
      dataReliabilityFactor: 1.0, // Set later by plan-generator orchestrator
      supplementaryAdjustment: 0, // Set later by SupplementaryAnalyzer
    };
  }

  /**
   * Batch score all candidates, using the same binIndex/totalBins for each.
   * Typically used after bin assignment to re-score within context.
   */
  scoreBatch(
    candidates: RawCandidate[],
    student: StudentProfileSnapshot,
    binIndex: number,
    totalBins: number,
  ): ScoredCandidate[] {
    return candidates.map((c) =>
      this.scoreCandidate(c, student, binIndex, totalBins),
    );
  }

  /**
   * Apply correction factors to an already-scored candidate.
   */
  applyCorrection(
    candidate: ScoredCandidate,
    stabilityFactor: number,
    dataReliabilityFactor: number,
    supplementaryAdjustment: number,
  ): ScoredCandidate {
    const adjustedTotal =
      candidate.scoreBreakdown.rawTotal *
        stabilityFactor *
        dataReliabilityFactor +
      supplementaryAdjustment;

    return {
      ...candidate,
      compositeScore: adjustedTotal,
      stabilityFactor,
      dataReliabilityFactor,
      supplementaryAdjustment,
      scoreBreakdown: {
        ...candidate.scoreBreakdown,
        adjustedTotal,
      },
    };
  }

  // ---- Dynamic weight function ----

  /** Linear interpolation: W(t, start, end) = start + (end - start) * t */
  W(t: number, start: number, end: number): number {
    return start + (end - start) * t;
  }

  // ---- Dimension score calculators ----

  /** Tier: 985=5, 211=4, 双一流=3, 省重点=2, 普通=1 */
  calcTierScore(c: RawCandidate): number {
    if (c.is985) return 5;
    if (c.is211) return 4;
    if (c.isDoubleFirstClass) return 3;
    // Check university level/tags for provincial key
    const tags = c.universityTags;
    if (
      tags &&
      (JSON.stringify(tags).includes('省重点') ||
        JSON.stringify(tags).includes('省属重点'))
    ) {
      return 2;
    }
    return 1;
  }

  /** Nature: 公办=3, 民办=0 */
  calcNatureScore(c: RawCandidate): number {
    if (!c.runningNature) return 1.5; // Unknown defaults to middle
    return c.runningNature.includes('公办') ? 3 : 0;
  }

  /**
   * Major score = recommend + discipline
   *   recommend: 推荐=3, 中性=1, 慎选=0
   *   discipline: A类=4, B类=3, C类=2, 软科A(无评估)=2, 无=0
   */
  calcMajorScore(
    c: RawCandidate,
    student: StudentProfileSnapshot,
  ): { total: number; recommendScore: number; disciplineScore: number } {
    // Recommend score based on student preference match
    let recommendScore = 1; // Default: neutral
    if (student.preferredMajors?.includes(c.majorName)) {
      recommendScore = 3;
    } else if (student.preferredMajorCategories?.includes(c.majorCategory || '')) {
      recommendScore = 3;
    } else if (student.excludedMajors?.includes(c.majorName)) {
      recommendScore = 0; // Should have been filtered, but just in case
    }

    // Discipline evaluation score
    let disciplineScore = 0;
    const eval_ = c.disciplineEval || '';
    if (eval_.startsWith('A')) disciplineScore = 4;
    else if (eval_.startsWith('B')) disciplineScore = 3;
    else if (eval_.startsWith('C')) disciplineScore = 2;
    else if (c.majorRanking && c.majorRanking.includes('A')) disciplineScore = 2;

    // National feature bonus
    if (c.isNationalFeature) disciplineScore = Math.max(disciplineScore, 2);

    return {
      total: recommendScore + disciplineScore,
      recommendScore,
      disciplineScore,
    };
  }

  /**
   * Other = plan + postgrad + location
   *   plan: ≥10人=3, ≥5人=2, <5=1
   *   postgrad: ≥10%=3, ≥5%=2, ≥1%=1, 无=0
   *   location: 偏好=2, 不偏好=0
   */
  calcOtherScore(
    c: RawCandidate,
    student: StudentProfileSnapshot,
  ): {
    total: number;
    planScore: number;
    postgradScore: number;
    locationScore: number;
  } {
    // Plan count score
    let planScore = 1;
    if (c.planCount !== null && c.planCount !== undefined) {
      if (c.planCount >= 10) planScore = 3;
      else if (c.planCount >= 5) planScore = 2;
      else planScore = 1;
    }

    // Postgrad rate score
    let postgradScore = 0;
    if (c.postgradRate) {
      const rate = parseFloat(c.postgradRate);
      if (!isNaN(rate)) {
        if (rate >= 10) postgradScore = 3;
        else if (rate >= 5) postgradScore = 2;
        else if (rate >= 1) postgradScore = 1;
      }
    }

    // Location preference score
    let locationScore = 0;
    if (student.preferredProvinces?.includes(c.universityProvince || '')) {
      locationScore = 2;
    } else if (student.preferredCities?.includes(c.universityCity || '')) {
      locationScore = 2;
    }

    return {
      total: planScore + postgradScore + locationScore,
      planScore,
      postgradScore,
      locationScore,
    };
  }

  /** Bonus: additional points for strong preference matches */
  calcBonus(c: RawCandidate, student: StudentProfileSnapshot): number {
    let bonus = 0;

    // Preferred university match
    if (student.preferredUniversities?.includes(c.universityName)) {
      bonus += 3;
    }

    // Preferred university type match
    if (
      student.preferredUniversityTypes?.length &&
      c.universityType &&
      student.preferredUniversityTypes.includes(c.universityType)
    ) {
      bonus += 1;
    }

    // Preferred tags match
    if (student.preferredTags?.length && c.universityTags) {
      const tagStr = JSON.stringify(c.universityTags);
      for (const tag of student.preferredTags) {
        if (tagStr.includes(tag)) {
          bonus += 0.5;
          break;
        }
      }
    }

    return bonus;
  }

  /**
   * Calculate data reliability factor based on year.
   * 25年新高考=1.0, 24年旧高考=0.75, 23年=0.65, 无=0.5
   */
  calcDataReliabilityFactor(
    dataYear: number,
    currentExamYear: number,
    isNewGaokao = true,
  ): number {
    const yearsAgo = currentExamYear - dataYear - 1;

    if (yearsAgo <= 0 && isNewGaokao) return 1.0;
    if (yearsAgo <= 0) return 0.75;
    if (yearsAgo === 1) return 0.75;
    if (yearsAgo === 2) return 0.65;
    return 0.5;
  }
}
