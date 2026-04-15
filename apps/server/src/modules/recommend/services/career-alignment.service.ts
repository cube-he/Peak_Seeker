import { Injectable } from '@nestjs/common';

interface StudentCareer {
  careerDirection: string | null | undefined;
  careerPlan: string | null | undefined;
  teacherInterest: boolean;
  militaryInterest: boolean;
}

interface CandidateCareer {
  careerDirections: string[] | null | undefined;
  postgraduateDirections: string[] | null | undefined;
  majorCategory: string | null | undefined;
  batch: string | null | undefined;
}

@Injectable()
export class CareerAlignmentService {
  /**
   * Calculates career alignment bonus points for a candidate.
   * Pure calculation — no DB/Redis dependencies.
   * All bonuses are additive; a candidate can receive multiple bonuses.
   */
  calcBonus(student: StudentCareer, candidate: CandidateCareer): number {
    let bonus = 0;

    bonus += this.careerDirectionBonus(student, candidate);
    bonus += this.postgraduateBonus(student, candidate);
    bonus += this.teacherInterestBonus(student, candidate);
    bonus += this.militaryInterestBonus(student, candidate);

    return bonus;
  }

  /**
   * Keyword-based bidirectional substring match between student's career direction
   * tokens and candidate's career direction strings.
   * ≥3 matches → +3.0; 1-2 matches → +1.5; 0 → 0
   */
  private careerDirectionBonus(
    student: StudentCareer,
    candidate: CandidateCareer,
  ): number {
    if (!student.careerDirection) return 0;
    if (!candidate.careerDirections?.length) return 0;

    // Split by Chinese/ASCII delimiters and filter single-char tokens
    const tokens = student.careerDirection
      .split(/[，,、；;/\s]+/)
      .filter((t) => t.length >= 2);

    if (tokens.length === 0) return 0;

    let matchCount = 0;
    for (const token of tokens) {
      // Bidirectional: candidate direction contains token, OR token contains direction
      const matched = candidate.careerDirections.some(
        (dir) => dir.includes(token) || token.includes(dir),
      );
      if (matched) matchCount++;
    }

    if (matchCount >= 3) return 3.0;
    if (matchCount >= 1) return 1.5;
    return 0;
  }

  /**
   * +1.0 when student plans to pursue postgraduate studies
   * and the major has known postgraduate pathways.
   */
  private postgraduateBonus(
    student: StudentCareer,
    candidate: CandidateCareer,
  ): number {
    if (
      student.careerPlan === 'POSTGRADUATE' &&
      candidate.postgraduateDirections?.length
    ) {
      return 1.0;
    }
    return 0;
  }

  /**
   * +1.5 when student is interested in teaching
   * and the major falls under an education category.
   */
  private teacherInterestBonus(
    student: StudentCareer,
    candidate: CandidateCareer,
  ): number {
    if (student.teacherInterest && candidate.majorCategory?.includes('教育')) {
      return 1.5;
    }
    return 0;
  }

  /**
   * +1.5 when student is interested in military/military-academy path
   * and the candidate batch belongs to military institutions.
   */
  private militaryInterestBonus(
    student: StudentCareer,
    candidate: CandidateCareer,
  ): number {
    if (
      student.militaryInterest &&
      candidate.batch &&
      (candidate.batch.includes('军事') || candidate.batch.includes('军校'))
    ) {
      return 1.5;
    }
    return 0;
  }
}
