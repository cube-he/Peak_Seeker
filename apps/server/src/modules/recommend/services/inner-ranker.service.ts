import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ScoredCandidate,
  StudentProfileSnapshot,
} from '../interfaces/recommend.types';

interface MajorRankingEntry {
  majorId: number;
  majorName: string;
  majorCode?: string | null;
  isAnchor: boolean;
  recommendScore: number;
  disciplineScore: number;
  preferenceScore: number;
  compositeRankScore: number;
}

/**
 * Sub-module 10: Inner Ranker
 *
 * Within-group major ordering:
 * - Anchor major placed first
 * - Remaining sorted by: recommendScore×3 + disciplineScore×2 + preferenceScore×1
 */
@Injectable()
export class InnerRankerService {
  private readonly logger = new Logger(InnerRankerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Given an anchor candidate and all candidates in the same university group,
   * produce a ranked major ordering for the PlanItem.
   */
  async rankMajorsInGroup(
    anchor: ScoredCandidate,
    groupCandidates: ScoredCandidate[],
    student: StudentProfileSnapshot,
  ): Promise<MajorRankingEntry[]> {
    // If we have group info, also fetch all majors in the enrollment group
    let allGroupMajors = groupCandidates;

    if (anchor.enrollmentGroupCode) {
      // Try to get all majors in this group from enrollment plans
      const groupPlans = await this.prisma.enrollmentPlan.findMany({
        where: {
          universityId: anchor.universityId,
          groupCode: anchor.enrollmentGroupCode,
          year: student.examYear,
          province: student.province,
        },
        include: { major: true },
      });

      // Merge enrollment plan majors that aren't already in our candidate list
      const existingMajorIds = new Set(allGroupMajors.map((c) => c.majorId));
      for (const plan of groupPlans) {
        if (!existingMajorIds.has(plan.majorId)) {
          // Create a synthetic scored candidate for ranking purposes
          allGroupMajors.push({
            ...anchor, // Copy university info from anchor
            majorId: plan.majorId,
            majorName: plan.major.name,
            majorCode: plan.major.code,
            majorCategory: plan.major.category,
            discipline: plan.major.discipline,
            disciplineEval: plan.disciplineEval,
            isNationalFeature: plan.isNationalFeature,
            majorRanking: plan.majorRanking,
            majorHonor: plan.majorHonor,
            compositeScore: 0, // Will be ranked by individual scores below
            scoreBreakdown: anchor.scoreBreakdown,
          } as ScoredCandidate);
        }
      }
    }

    // Score each major
    const entries: MajorRankingEntry[] = allGroupMajors.map((c) => {
      const isAnchor = c.majorId === anchor.majorId;

      const recommendScore = this.calcRecommendScore(c, student);
      const disciplineScore = this.calcDisciplineScore(c);
      const preferenceScore = this.calcPreferenceScore(c, student);

      return {
        majorId: c.majorId,
        majorName: c.majorName,
        majorCode: c.majorCode,
        isAnchor,
        recommendScore,
        disciplineScore,
        preferenceScore,
        compositeRankScore:
          recommendScore * 3 + disciplineScore * 2 + preferenceScore * 1,
      };
    });

    // Sort: anchor first, then by compositeRankScore descending
    entries.sort((a, b) => {
      if (a.isAnchor) return -1;
      if (b.isAnchor) return 1;
      return b.compositeRankScore - a.compositeRankScore;
    });

    // Deduplicate by majorId (keep first occurrence)
    const seen = new Set<number>();
    const deduped: MajorRankingEntry[] = [];
    for (const entry of entries) {
      if (!seen.has(entry.majorId)) {
        seen.add(entry.majorId);
        deduped.push(entry);
      }
    }

    return deduped;
  }

  private calcRecommendScore(
    c: ScoredCandidate,
    student: StudentProfileSnapshot,
  ): number {
    if (student.preferredMajors?.includes(c.majorName)) return 3;
    if (student.preferredMajorCategories?.includes(c.majorCategory || ''))
      return 3;
    if (student.excludedMajors?.includes(c.majorName)) return 0;
    return 1;
  }

  private calcDisciplineScore(c: ScoredCandidate): number {
    const eval_ = c.disciplineEval || '';
    if (eval_.startsWith('A')) return 4;
    if (eval_.startsWith('B')) return 3;
    if (eval_.startsWith('C')) return 2;
    if (c.isNationalFeature) return 2;
    return 0;
  }

  private calcPreferenceScore(
    c: ScoredCandidate,
    student: StudentProfileSnapshot,
  ): number {
    let score = 0;
    if (student.preferredMajors?.includes(c.majorName)) score += 2;
    if (student.preferredMajorCategories?.includes(c.majorCategory || ''))
      score += 1;
    return score;
  }
}
