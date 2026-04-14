import { Injectable, Logger } from '@nestjs/common';
import {
  ScoredCandidate,
  StudentProfileSnapshot,
  CleanlinessLevel,
} from '../interfaces/recommend.types';

interface CleanlinessResult {
  level: CleanlinessLevel;
  adjustmentAdvice: string;
  acceptableCount: number;
  cautionedCount: number;
  excludedCount: number;
  totalCount: number;
}

/**
 * Sub-module 11: Cleanliness Assessor
 *
 * Assesses university group "cleanliness" — how many of the majors in
 * the group are acceptable vs. cautioned vs. excluded for the student.
 *
 * CLEAN:  all majors acceptable
 * MIXED:  some cautioned majors
 * POOR:   mostly cautioned/excluded
 */
@Injectable()
export class CleanlinessAssessorService {
  private readonly logger = new Logger(CleanlinessAssessorService.name);

  assess(
    groupCandidates: ScoredCandidate[],
    student: StudentProfileSnapshot,
  ): CleanlinessResult {
    if (groupCandidates.length === 0) {
      return {
        level: CleanlinessLevel.CLEAN,
        adjustmentAdvice: '',
        acceptableCount: 0,
        cautionedCount: 0,
        excludedCount: 0,
        totalCount: 0,
      };
    }

    let acceptableCount = 0;
    let cautionedCount = 0;
    let excludedCount = 0;

    for (const c of groupCandidates) {
      const status = this.classifyMajor(c, student);
      switch (status) {
        case 'acceptable':
          acceptableCount++;
          break;
        case 'cautioned':
          cautionedCount++;
          break;
        case 'excluded':
          excludedCount++;
          break;
      }
    }

    const total = groupCandidates.length;
    const badRatio = (cautionedCount + excludedCount) / total;

    let level: CleanlinessLevel;
    let adjustmentAdvice: string;

    if (badRatio === 0) {
      level = CleanlinessLevel.CLEAN;
      adjustmentAdvice = '';
    } else if (badRatio < 0.5) {
      level = CleanlinessLevel.MIXED;
      adjustmentAdvice = `该组${cautionedCount}个专业需谨慎，建议服从调剂时注意专业排序`;
    } else {
      level = CleanlinessLevel.POOR;
      adjustmentAdvice =
        `该组多数专业(${cautionedCount + excludedCount}/${total})不太理想，` +
        `建议慎重选择此院校专业组，或确保首选专业排序靠前`;
    }

    return {
      level,
      adjustmentAdvice,
      acceptableCount,
      cautionedCount,
      excludedCount,
      totalCount: total,
    };
  }

  /**
   * Classify a single major as acceptable / cautioned / excluded
   * based on student preferences.
   */
  private classifyMajor(
    c: ScoredCandidate,
    student: StudentProfileSnapshot,
  ): 'acceptable' | 'cautioned' | 'excluded' {
    // Explicitly excluded
    if (student.excludedMajors?.includes(c.majorName)) return 'excluded';
    if (student.excludedMajors?.includes(c.majorCategory || ''))
      return 'excluded';

    // Physical restrictions
    if (student.colorBlind || student.colorWeak) {
      // Majors in chemistry, biology, medicine, art often restrict color-blind students
      const riskyCategories = ['化学', '生物', '医学', '药学', '美术', '设计'];
      if (
        c.majorCategory &&
        riskyCategories.some((r) => c.majorCategory!.includes(r))
      ) {
        return 'cautioned';
      }
    }

    // Preferred = acceptable, unknown = acceptable (permissive)
    if (
      student.preferredMajors?.includes(c.majorName) ||
      student.preferredMajorCategories?.includes(c.majorCategory || '')
    ) {
      return 'acceptable';
    }

    // If student has explicit preferences and this major is not in them,
    // but not excluded either — mark as cautioned if acceptLevel is STRICT
    if (
      student.preferredMajors?.length &&
      student.preferredMajors.length > 0
    ) {
      return 'cautioned';
    }

    return 'acceptable';
  }
}
