import { Injectable } from '@nestjs/common';
import {
  TEACHER_ONLY_FIELDS,
  STAGE_1_REQUIRED,
  STAGE_2_FIELDS,
  STAGE_3_FIELDS,
  STUDENT_ONLY_FIELDS,
  REQUIRED_FIELDS,
  RECOMMENDED_FIELDS,
} from './field-policy';
import { flattenPreferredMajors } from '../../utils/preferred-majors';

export interface StageStatus {
  filled: number;
  total: number;
  completed: boolean;
}

export interface ProfileProgress {
  studentSelfCompleteness: number;
  teacherDataCompleteness: number;
  stageProgress: {
    stage1: StageStatus;
    stage2: StageStatus;
    stage3: StageStatus;
  };
  overallCompleteness: number;
  isRecommendable: boolean;
  missingFieldsForRecommend: string[];
}

@Injectable()
export class ProgressService {
  /** 字段已填判定：null/undefined 视为未填；空数组视为未填；空字符串视为未填 */
  private isFilled(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.length > 0;
    return true;
  }

  private countFilled(profile: Record<string, unknown>, fields: readonly string[]): number {
    return fields.filter((f) => this.isFilled(profile[f])).length;
  }

  compute(profile: Record<string, unknown>): ProfileProgress {
    const stage1Filled = this.countFilled(profile, STAGE_1_REQUIRED);
    const stage2Filled = this.countFilled(profile, STAGE_2_FIELDS);
    const stage3Filled = this.countFilled(profile, STAGE_3_FIELDS);

    // 学生端总字段集（去重 — formFiller 在 STAGE_1 和 STUDENT_ONLY 都有）
    const studentFieldSet = new Set<string>([
      ...STAGE_1_REQUIRED,
      ...STAGE_2_FIELDS,
      ...STAGE_3_FIELDS,
      ...STUDENT_ONLY_FIELDS,
    ]);
    const studentTotalFilled = Array.from(studentFieldSet).filter((f) =>
      this.isFilled(profile[f]),
    ).length;
    const studentSelfCompleteness = Math.round(
      (studentTotalFilled / studentFieldSet.size) * 100,
    );

    const teacherFilled = this.countFilled(profile, TEACHER_ONLY_FIELDS);
    const teacherDataCompleteness = Math.round(
      (teacherFilled / TEACHER_ONLY_FIELDS.length) * 100,
    );

    const stageProgress = {
      stage1: {
        filled: stage1Filled,
        total: STAGE_1_REQUIRED.length,
        completed: stage1Filled === STAGE_1_REQUIRED.length,
      },
      stage2: {
        filled: stage2Filled,
        total: STAGE_2_FIELDS.length,
        completed: stage2Filled === STAGE_2_FIELDS.length,
      },
      stage3: {
        filled: stage3Filled,
        total: STAGE_3_FIELDS.length,
        completed: stage3Filled === STAGE_3_FIELDS.length,
      },
    };

    // 2026-06-25 双档加权: 必填 (REQUIRED_FIELDS, 23 项) 70% + 推荐 (RECOMMENDED_FIELDS) 30%.
    // preferredMajors 是梯队结构, 用 flattenPreferredMajors 判 "已填".
    const requiredFilled = REQUIRED_FIELDS.filter((f) => this.isFilled(profile[f])).length;
    const recommendedFilled = RECOMMENDED_FIELDS.filter((f) =>
      f === 'preferredMajors'
        ? flattenPreferredMajors(profile[f]).length > 0
        : this.isFilled(profile[f]),
    ).length;
    const requiredPct = (requiredFilled / REQUIRED_FIELDS.length) * 100;
    const recommendedPct = (recommendedFilled / RECOMMENDED_FIELDS.length) * 100;
    const overallCompleteness = Math.round(requiredPct * 0.7 + recommendedPct * 0.3);

    // 2026-06-25 业务收窄: 推荐硬约束 = 单层 REQUIRED_FIELDS (23 项).
    // 旧 3 层 (CORE_FOR_RECOMMEND + CORE_FOR_ELIGIBILITY + PHYSICAL_REQUIRED) 已废弃,
    // 缺 totalScore/birthDate/preferredMajors/身高体重 等不再阻塞"生成方案".
    // provincialRank (TEACHER_ONLY_FIELDS) 是自动计算字段, 不纳入阻塞判定.
    const missingFieldsForRecommend: string[] = REQUIRED_FIELDS.filter(
      (f) => !this.isFilled(profile[f]),
    );
    const isRecommendable = missingFieldsForRecommend.length === 0;

    return {
      studentSelfCompleteness,
      teacherDataCompleteness,
      stageProgress,
      overallCompleteness,
      isRecommendable,
      missingFieldsForRecommend,
    };
  }
}
