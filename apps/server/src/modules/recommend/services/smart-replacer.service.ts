import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ScoredCandidate,
  Bin,
  ReplacementSuggestion,
  StudentProfileSnapshot,
} from '../interfaces/recommend.types';
import { ScoringEngineService } from './scoring-engine.service';
import { CandidateFilterService } from './candidate-filter.service';
import { TOTAL_GROUPS } from '../interfaces/recommend.types';

/**
 * Sub-module 14: Smart Replacer
 *
 * When a teacher deletes a plan item, finds replacement suggestions
 * from the same gradient bin, using remaining candidates.
 */
@Injectable()
export class SmartReplacerService {
  private readonly logger = new Logger(SmartReplacerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringEngine: ScoringEngineService,
    private readonly candidateFilter: CandidateFilterService,
  ) {}

  /**
   * Find replacement candidates for a deleted plan item.
   *
   * @param planId       the plan being modified
   * @param sequence     the sequence number of the deleted item
   * @param student      student profile
   * @param topN         how many suggestions to return (default 3)
   */
  async findReplacements(
    planId: number,
    sequence: number,
    student: StudentProfileSnapshot,
    topN = 3,
  ): Promise<ReplacementSuggestion[]> {
    // Get the deleted item's info
    const deletedItem = await this.prisma.planItem.findUnique({
      where: {
        planId_sequence: { planId, sequence },
      },
    });

    if (!deletedItem) {
      this.logger.warn(`Plan item ${planId}:${sequence} not found`);
      return [];
    }

    // Get all existing plan items to avoid duplicates
    const existingItems = await this.prisma.planItem.findMany({
      where: { planId },
      select: { universityId: true, majorId: true },
    });

    const existingKeys = new Set(
      existingItems.map((i) => `${i.universityId}:${i.majorId}`),
    );

    // Determine the approximate rank range for this bin
    // Use the deleted item's historical rank data as center
    const centerRank =
      deletedItem.rank25Major ||
      deletedItem.rank25Group ||
      deletedItem.lastYearMinRank ||
      student.provincialRank;

    if (!centerRank) {
      return [];
    }

    // Search for candidates near this rank
    const binRange = Math.round(
      ((student.provincialRank * 2) / TOTAL_GROUPS) * 1.5,
    ); // Wider than one bin

    const range = { rangeUp: binRange, rangeDown: binRange };

    // Build a temporary student profile with the center rank for filtering
    const tempStudent = {
      ...student,
      provincialRank: centerRank,
    };

    const candidates = await this.candidateFilter.filter(
      tempStudent,
      range,
      deletedItem.gradient === 'CHONG'
        ? undefined
        : undefined, // No batch filter for replacements
    );

    // Filter out already-used universities/majors
    const available = candidates.filter(
      (c) => !existingKeys.has(`${c.universityId}:${c.majorId}`),
    );

    // Score the available candidates
    const binIndex = Math.round(
      (sequence / TOTAL_GROUPS) * TOTAL_GROUPS,
    );
    const scored = this.scoringEngine.scoreBatch(
      available,
      student,
      binIndex,
      TOTAL_GROUPS,
    );

    // Sort by composite score and take top N
    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    const topCandidates = scored.slice(0, topN);

    return topCandidates.map((c) => ({
      candidate: c,
      reason: this.generateReplacementReason(c, deletedItem),
    }));
  }

  private generateReplacementReason(
    candidate: ScoredCandidate,
    deletedItem: any,
  ): string {
    const parts: string[] = [];
    parts.push(
      `${candidate.universityName} - ${candidate.majorName}`,
    );

    if (candidate.is985) parts.push('985');
    else if (candidate.is211) parts.push('211');

    if (candidate.compositeScore > 0) {
      parts.push(`综合评分${candidate.compositeScore.toFixed(1)}`);
    }

    return parts.join('，');
  }
}
