import { Injectable } from '@nestjs/common';
import { RawCandidate } from '../interfaces/recommend.types';

export interface ProspectScore {
  prospectRaw: number;
  prospectEmployment: number;
  prospectSalary: number;
  prospectSatisfaction: number;
  prospectConditional: number;
  prospectRanking: number;
}

@Injectable()
export class ProspectScorerService {
  /**
   * Score the "development prospects" dimension for a candidate.
   * Pure calculation — no DB or Redis dependencies.
   * Called by ScoringEngineService after the existing 4 dimensions.
   */
  score(candidate: RawCandidate, careerPlan: string | null | undefined): ProspectScore {
    const prospectEmployment = this.scoreEmployment(candidate.universityEmploymentRate);
    const prospectSalary = this.scoreSalary(candidate.universityAvgSalary);
    const prospectSatisfaction = this.scoreSatisfaction(
      candidate.universitySatisfactionOverall,
      candidate.majorSatisfactionScore,
    );
    const prospectRanking = this.scoreRanking(candidate);
    const prospectConditional = this.scoreConditional(candidate, careerPlan);

    const prospectRaw =
      prospectEmployment +
      prospectSalary +
      prospectSatisfaction +
      prospectConditional +
      prospectRanking;

    return {
      prospectRaw,
      prospectEmployment,
      prospectSalary,
      prospectSatisfaction,
      prospectConditional,
      prospectRanking,
    };
  }

  /**
   * Parse a percentage string like "92%" into a number (92).
   * Returns null for null/empty/non-numeric input.
   */
  private parsePercent(value: string | null | undefined): number | null {
    if (!value) return null;
    const num = parseFloat(value.replace('%', ''));
    return isNaN(num) ? null : num;
  }

  /**
   * Score employment rate.
   * Neutral (1.5) when data is missing — absence of data ≠ poor outcome.
   */
  scoreEmployment(employmentRate: string | null | undefined): number {
    const rate = this.parsePercent(employmentRate);
    if (rate === null) return 1.5; // neutral
    if (rate >= 90) return 3;
    if (rate >= 80) return 2;
    if (rate >= 70) return 1;
    return 0.5;
  }

  /**
   * Score average graduate salary.
   * Neutral (1.5) when data is missing.
   */
  private scoreSalary(avgSalary: string | null | undefined): number {
    if (!avgSalary) return 1.5; // neutral
    const salary = parseFloat(avgSalary.replace(/[^0-9.]/g, ''));
    if (isNaN(salary)) return 1.5;
    if (salary >= 10000) return 3;
    if (salary >= 7000) return 2;
    if (salary >= 5000) return 1;
    return 0.5;
  }

  /**
   * Score satisfaction using weighted average of university (×0.4) and major (×0.6).
   * If only one source is available, use it directly.
   * Neutral (1.5) when neither is available.
   */
  private scoreSatisfaction(
    uniSatisfaction: number | null | undefined,
    majorSatisfaction: number | null | undefined,
  ): number {
    let weighted: number;

    if (uniSatisfaction != null && majorSatisfaction != null) {
      // Both available — weighted average favoring major (closer to student experience)
      weighted = uniSatisfaction * 0.4 + majorSatisfaction * 0.6;
    } else if (uniSatisfaction != null) {
      weighted = uniSatisfaction;
    } else if (majorSatisfaction != null) {
      weighted = majorSatisfaction;
    } else {
      return 1.5; // neutral — no data
    }

    if (weighted >= 4.0) return 3;
    if (weighted >= 3.5) return 2;
    if (weighted >= 3.0) return 1;
    return 0.5;
  }

  /**
   * Score further study (postgraduate) rate.
   * Neutral (1.5) when data is missing.
   */
  private scoreFurtherStudy(furtherStudyRate: string | null | undefined): number {
    const rate = this.parsePercent(furtherStudyRate);
    if (rate === null) return 1.5; // neutral
    if (rate >= 50) return 3;
    if (rate >= 30) return 2;
    if (rate >= 15) return 1;
    return 0.5;
  }

  /**
   * Score university rankings — takes the best (minimum) valid ranking across
   * QS, USNews, Alumni, and softRanking.
   *
   * "No ranking" is meaningful (unranked school), so returns 0 not 1.5.
   * Zero values are treated as missing (invalid ranking position).
   */
  scoreRanking(candidate: RawCandidate): number {
    const rankings = [
      candidate.universityRankingQS,
      candidate.universityRankingUSNews,
      candidate.universityRankingAlumni,
      candidate.softRanking,
    ].filter((r): r is number => r !== null && r !== undefined && r > 0);

    if (rankings.length === 0) return 0; // no ranking data — not neutral

    const best = Math.min(...rankings);
    if (best <= 50) return 3;
    if (best <= 100) return 2;
    if (best <= 200) return 1;
    return 0;
  }

  /**
   * Conditional score — dynamically mirrors the student's career priority.
   * This effectively adds a second weight to the dimension most relevant
   * to the student's stated career goal.
   *
   * POSTGRADUATE → further study rate
   * EMPLOYMENT   → employment rate (doubles employment weight)
   * ABROAD       → ranking (doubles ranking weight for international visibility)
   * Other/null   → half of further study score (mild default boost)
   */
  private scoreConditional(
    candidate: RawCandidate,
    careerPlan: string | null | undefined,
  ): number {
    switch (careerPlan) {
      case 'POSTGRADUATE':
        return this.scoreFurtherStudy(candidate.universityFurtherStudyRate);
      case 'EMPLOYMENT':
        return this.scoreEmployment(candidate.universityEmploymentRate);
      case 'ABROAD':
        return this.scoreRanking(candidate);
      default:
        // No clear career goal — apply a half-weight further study signal
        return this.scoreFurtherStudy(candidate.universityFurtherStudyRate) * 0.5;
    }
  }
}
