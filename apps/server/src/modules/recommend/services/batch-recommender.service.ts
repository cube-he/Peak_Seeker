import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StudentProfileSnapshot } from '../interfaces/recommend.types';

interface BatchRecommendation {
  batch: string;
  batchConfig: any;
  isEligible: boolean;
  recommendationScore: number;
  reason?: string;
}

/**
 * Sub-module 2: Batch Recommender
 *
 * Determines which admission batches a student is eligible for
 * based on their score, exam type, and batch line configurations.
 */
@Injectable()
export class BatchRecommenderService {
  private readonly logger = new Logger(BatchRecommenderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getEligibleBatches(
    student: StudentProfileSnapshot,
  ): Promise<BatchRecommendation[]> {
    const year = student.examYear;
    const province = student.province;
    const examType = student.examType;

    // Fetch all batch configs for this year/province
    const batchConfigs = await this.prisma.batchConfig.findMany({
      where: { year, province },
      orderBy: { admissionOrder: 'asc' },
    });

    // Fetch batch lines for score comparison
    const batchLines = await this.prisma.batchLine.findMany({
      where: { year, province, examType },
    });

    const batchLineMap = new Map<string, number>();
    for (const bl of batchLines) {
      batchLineMap.set(bl.batch, bl.score);
    }

    const results: BatchRecommendation[] = [];

    for (const config of batchConfigs) {
      // Check exam type compatibility
      if (config.examType !== '不分科目' && config.examType !== examType) {
        continue;
      }

      const batchLineScore = batchLineMap.get(config.batch);
      const isAboveLine =
        batchLineScore !== undefined
          ? student.totalScore >= batchLineScore
          : true; // If no batch line data, assume eligible

      // Check eligibility rules from config
      const eligibilityRules = config.eligibilityRules as Record<
        string,
        any
      > | null;
      let specialEligible = true;
      let reason: string | undefined;

      if (eligibilityRules) {
        // Check rural requirement
        if (eligibilityRules.requireRural && !student.careerPlan) {
          specialEligible = false;
          reason = '需要特殊资格';
        }
        // Check military interest
        if (
          eligibilityRules.requireMilitary &&
          student.careerPlan !== 'PUBLIC_SERVANT'
        ) {
          specialEligible = false;
          reason = '需要军事资格';
        }
      }

      const isEligible = isAboveLine && specialEligible;

      // Calculate recommendation score (higher = more recommended)
      let recommendationScore = 0;
      if (isEligible) {
        // Prefer parallel batches over sequential
        recommendationScore += config.volunteerMode === 'parallel' ? 10 : 5;
        // Prefer higher max group counts (more choices)
        recommendationScore += Math.min(config.maxGroupCount / 5, 10);
        // Score margin above batch line
        if (batchLineScore !== undefined) {
          const margin = student.totalScore - batchLineScore;
          recommendationScore += Math.min(margin / 10, 10);
        }
      }

      results.push({
        batch: config.batch,
        batchConfig: config,
        isEligible,
        recommendationScore,
        reason: !isEligible ? reason || '分数未达批次线' : undefined,
      });
    }

    // Sort: eligible first, then by recommendation score descending
    return results.sort((a, b) => {
      if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;
      return b.recommendationScore - a.recommendationScore;
    });
  }
}
