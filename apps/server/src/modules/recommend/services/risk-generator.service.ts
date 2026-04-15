import { Injectable } from '@nestjs/common';
import {
  ScoredCandidate,
  GradientType,
  CleanlinessLevel,
} from '../interfaces/recommend.types';

/**
 * Sub-module 13: Risk Generator
 *
 * Generates risk warnings based on:
 * 1. Gradient position risk
 * 2. Data reliability risk (old data)
 * 3. Adjustment risk (MIXED/POOR cleanliness)
 * 4. Supplementary trend risk
 */
@Injectable()
export class RiskGeneratorService {
  generate(
    candidate: ScoredCandidate,
    gradient: GradientType,
    cleanliness?: CleanlinessLevel,
    adjustmentAdvice?: string,
  ): string {
    const warnings: string[] = [];

    // 1. Gradient position risk
    warnings.push(...this.gradientRisk(gradient));

    // 2. Data reliability risk
    warnings.push(...this.dataReliabilityRisk(candidate));

    // 3. Adjustment risk (cleanliness)
    warnings.push(
      ...this.adjustmentRisk(cleanliness, adjustmentAdvice),
    );

    // 4. Supplementary trend risk
    if (candidate.supplementaryRiskNote) {
      warnings.push(candidate.supplementaryRiskNote);
    }

    // 5. Low plan count risk
    if (
      candidate.planCount !== null &&
      candidate.planCount !== undefined &&
      candidate.planCount < 3
    ) {
      warnings.push(`招生计划仅${candidate.planCount}人，录取波动大`);
    }

    // 6. Stability risk
    if (candidate.stabilityFactor < 0.7) {
      warnings.push('近三年录取位次波动较大，预测参考性有限');
    }

    // 7. Health restriction warnings
    if (candidate.healthRisks?.length) {
      for (const risk of candidate.healthRisks) {
        warnings.push(risk);
      }
    }

    return warnings.join('；');
  }

  private gradientRisk(gradient: GradientType): string[] {
    const warnings: string[] = [];

    switch (gradient) {
      case GradientType.HIGH_RUSH:
        warnings.push('高冲志愿，录取概率较低，仅作冲击目标');
        break;
      case GradientType.RUSH:
        warnings.push('冲刺志愿，有一定风险，需做好备选');
        break;
      case GradientType.STABLE_RUSH:
        warnings.push('稳冲志愿，录取概率适中');
        break;
      case GradientType.SAFE:
        warnings.push('保底志愿，注意该校是否为您的最低期望');
        break;
      default:
        // STABLE and SAFE_STABLE are normal, no special warning
        break;
    }

    return warnings;
  }

  private dataReliabilityRisk(candidate: ScoredCandidate): string[] {
    const warnings: string[] = [];

    if (candidate.dataReliabilityFactor < 0.7) {
      warnings.push('参考数据年份较旧（2年以上），预测准确性下降');
    } else if (candidate.dataReliabilityFactor < 0.8) {
      warnings.push('参考数据为上一年旧高考数据，新高考下位次可能有偏差');
    }

    return warnings;
  }

  private adjustmentRisk(
    cleanliness?: CleanlinessLevel,
    adjustmentAdvice?: string,
  ): string[] {
    const warnings: string[] = [];

    if (cleanliness === CleanlinessLevel.MIXED) {
      warnings.push('专业组内部分专业可能不符合偏好，服从调剂有被调剂风险');
    } else if (cleanliness === CleanlinessLevel.POOR) {
      warnings.push(
        '专业组内多数专业不理想，强烈建议重新评估此志愿',
      );
    }

    if (adjustmentAdvice) {
      warnings.push(adjustmentAdvice);
    }

    return warnings;
  }
}
