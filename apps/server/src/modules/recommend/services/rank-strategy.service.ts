import { Injectable } from '@nestjs/common';
import {
  AdmissionVolatilityResult,
  RankStrategyInput,
  RankStrategyResult,
} from '../interfaces/recommend.types';
import { AdmissionVolatilityService } from './admission-volatility.service';

@Injectable()
export class RankStrategyService {
  constructor(private readonly volatility: AdmissionVolatilityService) {}

  async evaluateCandidate(
    input: RankStrategyInput,
  ): Promise<RankStrategyResult> {
    const sourceAdmissionYear =
      input.sourceAdmissionYear ?? input.studentExamYear - 1;
    const rankSourceYear = this.getRankSourceYear(
      input.studentExamYear,
      sourceAdmissionYear,
    );

    if (!this.isPositiveRank(input.studentRank) || !this.isPositiveRank(input.candidateRank)) {
      return {
        ...this.emptyVolatility(sourceAdmissionYear),
        rankSourceYear,
        candidateRank: input.candidateRank ?? null,
        requiredEasierDelta: null,
        safetyMargin: null,
        eligibility: 'INSUFFICIENT_DATA',
        reason: 'missing valid student or candidate rank',
      };
    }

    const volatility = await this.volatility.calculate({
      province: input.province,
      examType: input.examType,
      batch: input.batch,
      candidateRank: input.candidateRank,
      sourceAdmissionYear,
    });

    if (volatility.insufficientData) {
      return {
        ...volatility,
        rankSourceYear,
        candidateRank: input.candidateRank,
        requiredEasierDelta: null,
        safetyMargin: null,
        eligibility: 'INSUFFICIENT_DATA',
        reason: 'insufficient same-bucket admission volatility sample',
      };
    }

    const requiredEasierDelta =
      input.candidateRank < input.studentRank
        ? input.studentRank - input.candidateRank
        : null;
    const safetyMargin =
      input.candidateRank >= input.studentRank
        ? input.candidateRank - input.studentRank
        : null;

    if (requiredEasierDelta === null) {
      return {
        ...volatility,
        rankSourceYear,
        candidateRank: input.candidateRank,
        requiredEasierDelta,
        safetyMargin,
        eligibility: 'FORMAL',
        reason: 'candidate rank is not higher than student rank',
      };
    }

    if (requiredEasierDelta <= volatility.rushFormalLimit) {
      return {
        ...volatility,
        rankSourceYear,
        candidateRank: input.candidateRank,
        requiredEasierDelta,
        safetyMargin,
        eligibility: 'FORMAL',
        reason: 'within historical P75 easier boundary',
      };
    }

    if (requiredEasierDelta <= volatility.rushObserveLimit) {
      return {
        ...volatility,
        rankSourceYear,
        candidateRank: input.candidateRank,
        requiredEasierDelta,
        safetyMargin,
        eligibility: 'OBSERVE_ONLY',
        reason: 'between historical P75 and P90 easier boundaries',
      };
    }

    return {
      ...volatility,
      rankSourceYear,
      candidateRank: input.candidateRank,
      requiredEasierDelta,
      safetyMargin,
      eligibility: 'REJECTED',
      reason: 'outside historical P90 easier boundary',
    };
  }

  private getRankSourceYear(
    studentExamYear: number,
    sourceAdmissionYear: number,
  ): number | string {
    if (studentExamYear > sourceAdmissionYear) {
      return `${sourceAdmissionYear}_ESTIMATED`;
    }
    return studentExamYear;
  }

  private emptyVolatility(sourceAdmissionYear: number): AdmissionVolatilityResult {
    return {
      sourceAdmissionYear,
      rankBucket: 'UNKNOWN',
      sampleScope: 'INSUFFICIENT_DATA',
      sampleSize: 0,
      basisPairs: [],
      rushFormalLimit: 0,
      rushObserveLimit: 0,
      safeNormalMargin: 0,
      safeStrongMargin: 0,
      insufficientData: true,
    };
  }

  private isPositiveRank(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }
}
