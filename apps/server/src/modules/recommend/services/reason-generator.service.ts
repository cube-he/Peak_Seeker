import { Injectable } from '@nestjs/common';
import {
  ScoredCandidate,
  StudentProfileSnapshot,
  GradientType,
  CleanlinessLevel,
} from '../interfaces/recommend.types';
import { BinSamplerService } from './bin-sampler.service';

/**
 * Sub-module 12: Reason Generator
 *
 * Generates a 9-segment selection reason string:
 * 1. University tags (985/211/双一流)
 * 2. Public/private nature
 * 3. Recommended major indicator
 * 4. Discipline evaluation
 * 5. Postgrad rate
 * 6. Plan count
 * 7. City preference match
 * 8. Gradient position
 * 9. Student preference match
 */
@Injectable()
export class ReasonGeneratorService {
  generate(
    candidate: ScoredCandidate,
    student: StudentProfileSnapshot,
    gradient: GradientType,
    cleanliness?: CleanlinessLevel,
  ): string {
    const segments: string[] = [];

    // 1. University tags
    const uniTags: string[] = [];
    if (candidate.is985) uniTags.push('985');
    if (candidate.is211) uniTags.push('211');
    if (candidate.isDoubleFirstClass) uniTags.push('双一流');
    if (uniTags.length > 0) {
      segments.push(`${uniTags.join('/')}`);
    }

    // 2. Public/private
    if (candidate.runningNature) {
      segments.push(candidate.runningNature);
    }

    // 3. Recommended major indicator
    if (student.preferredMajors?.includes(candidate.majorName)) {
      segments.push('推荐专业');
    } else if (
      student.preferredMajorCategories?.includes(candidate.majorCategory || '')
    ) {
      segments.push('偏好类别专业');
    }

    // 4. Discipline evaluation
    if (candidate.disciplineEval) {
      segments.push(`学科评估${candidate.disciplineEval}`);
    }
    if (candidate.isNationalFeature) {
      segments.push('国家级特色专业');
    }

    // 5. Postgrad rate
    if (candidate.postgradRate) {
      const rate = parseFloat(candidate.postgradRate);
      if (!isNaN(rate) && rate >= 5) {
        segments.push(`考研率${rate.toFixed(1)}%`);
      }
    }

    // 6. Plan count
    if (candidate.planCount !== null && candidate.planCount !== undefined) {
      if (candidate.planCount >= 10) {
        segments.push(`招生${candidate.planCount}人`);
      } else if (candidate.planCount >= 5) {
        segments.push(`招生${candidate.planCount}人`);
      } else {
        segments.push(`招生仅${candidate.planCount}人`);
      }
    }

    // 7. City preference match
    if (student.preferredCities?.includes(candidate.universityCity || '')) {
      segments.push(`在偏好城市${candidate.universityCity}`);
    } else if (
      student.preferredProvinces?.includes(candidate.universityProvince || '')
    ) {
      segments.push(`在偏好省份${candidate.universityProvince}`);
    } else if (candidate.universityCity) {
      segments.push(`位于${candidate.universityCity}`);
    }

    // 8. Gradient position
    const gradientLabel = BinSamplerService.gradientLabel(gradient);
    segments.push(`${gradientLabel}梯度`);

    // 9. Student preference match summary
    if (student.preferredUniversities?.includes(candidate.universityName)) {
      segments.push('目标院校');
    }

    // Add cleanliness note if relevant
    if (cleanliness === CleanlinessLevel.MIXED) {
      segments.push('部分专业需注意');
    }

    return segments.join('，');
  }
}
