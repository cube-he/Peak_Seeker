/**
 * 前端镜像后端 field-policy.ts。
 * 后端是单一真理来源；如有 drift 以后端为准（CI 应跑 contract test）。
 *
 * 来源：apps/server/src/modules/student/field-policy.ts
 */

export const STAGE_1_REQUIRED = [
  'realName',
  'phone',
  'gender',
  'examType',
  'parentPhone',
  'formFiller',
  // 选科组合（推荐算法硬约束）
  'firstChoice',
  'reChoices',
  // 分数（学生自填；后端用 score-segment 自动计算位次）
  'totalScore',
  'scoreChinese',
  'scoreMath',
  'scoreEnglish',
  'scoreFirstChoice',
  'scoreSub1',
  'scoreSub2',
] as const;

export const STAGE_2_FIELDS = [
  'height',
  'weight',
  'visionLeft',
  'visionRight',
  'colorBlind',
  'colorWeak',
  'preferredProvinces',
  'preferredCities',
  'preferredMajors',
  'preferredUniversities',
  'preferredMajorCategories',
  'priorityMode',
  'careerPlan',
  'careerDirection',
  'preferredBatches',
] as const;

export const STAGE_3_FIELDS = [
  'remoteAreaAcceptance',
  'coldMajorAcceptance',
  'stayPreference',
  'preferredTags',
  'excludedProvinces',
  'excludedCities',
  'excludedUniversities',
  'excludedMajors',
  'interests',
  'personalityType',
  'selfDescription',
  'militaryInterest',
  'teacherInterest',
  'tuitionBudget',
  'acceptSinoForeign',
  'acceptPrivate',
  'acceptCooperation',
  'otherRequirements',
  'visionLeftCorrected',
  'visionRightCorrected',
  'physicalLimits',
  'medicalHistory',
  'ethnicity',
  'politicalStatus',
] as const;

export const TEACHER_ONLY_FIELDS = [
  'provincialRank',
  'bonusPolicyStatus',
  'bonusItems',
  'province',
  'city',
  'county',
  'isRural',
  'examLocationProvince',
  'examLocationCity',
  'examLocationCounty',
] as const;

/** W3 阶段卡片的展示文案 */
export const STAGE_LABELS: Record<
  '1' | '2' | '3',
  { title: string; subtitle: string; badge: string }
> = {
  '1': {
    title: '核心信息',
    subtitle: '5 分钟搞定基础档案，老师据此联系你',
    badge: '初步档案',
  },
  '2': {
    title: '完善信息',
    subtitle: '身体条件 + 偏好 + 升学规划，让方案更贴合你',
    badge: '可生成方案',
  },
  '3': {
    title: '高级信息',
    subtitle: '兴趣性格 + 经济条件 + 排除项，精准推荐',
    badge: '精准推荐',
  },
};
