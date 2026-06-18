import { Injectable } from '@nestjs/common';
import {
  TEACHER_ONLY_FIELDS,
  STAGE_1_REQUIRED,
  STAGE_2_FIELDS,
  STAGE_3_FIELDS,
  STUDENT_ONLY_FIELDS,
  CORE_FOR_RECOMMEND,
  CORE_FOR_ELIGIBILITY,
  PHYSICAL_REQUIRED,
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

    const overallCompleteness = Math.round(
      teacherDataCompleteness * 0.4 + studentSelfCompleteness * 0.6,
    );

    // 推荐硬约束 (2026-06-10 业务定调三层全必填):
    //   ① CORE_FOR_RECOMMEND — 推荐算法输入 (选科/分数/联系方式)
    //   ② CORE_FOR_ELIGIBILITY — 批次资格判定 (户籍/农村/性别/出生日期/民族/加分)
    //   ③ PHYSICAL_REQUIRED — 体检字段 (军/警/司法/航海/消防/军士硬规则)
    // 其余字段 (政治面貌/分科分数/偏好等) 仍计入完整度但不阻塞"生成方案"按钮.
    const missingFieldsForRecommend: string[] = TEACHER_ONLY_FIELDS.filter(
      (f) => !this.isFilled(profile[f]),
    );
    // 手机号 / 家长手机号 二选一: 只要其一填了就算"联系方式已满足"(业务: 保证能联系上).
    const contactFilled =
      this.isFilled(profile['phone']) || this.isFilled(profile['parentPhone']);
    for (const f of [...CORE_FOR_RECOMMEND, ...CORE_FOR_ELIGIBILITY, ...PHYSICAL_REQUIRED]) {
      // preferredMajors 是梯队结构: 只有意向池(tier=0)不算"已填", 池子专业不参与推荐
      const filled =
        f === 'phone' || f === 'parentPhone'
          ? contactFilled
          : f === 'preferredMajors'
            ? flattenPreferredMajors(profile[f]).length > 0
            : this.isFilled(profile[f]);
      if (!filled) missingFieldsForRecommend.push(f);
    }
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
