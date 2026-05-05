/**
 * ① 老师独占字段：学生端不可见、不可写。
 * 计算关键输入 + 政策解读类字段。
 */
export const TEACHER_ONLY_FIELDS = [
  'totalScore',
  'provincialRank',
  'scoreChinese',
  'scoreMath',
  'scoreEnglish',
  'scoreFirstChoice',
  'scoreSub1',
  'scoreSub2',
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

/**
 * ③ 学生端独有字段：仅学生端写。
 */
export const STUDENT_ONLY_FIELDS = [
  'formFiller',
  'parentSignedAt',
] as const;

/**
 * W3 阶段 1：核心字段（学生 5 分钟搞定）
 */
export const STAGE_1_REQUIRED = [
  'realName',
  'phone',
  'gender',
  'examType',
  'parentPhone',
  'formFiller',
] as const;

/**
 * W3 阶段 2：完善字段
 */
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

/**
 * W3 阶段 3：高级字段
 */
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

/**
 * 学生端总可编辑字段集（含 STAGE_1/2/3 + STUDENT_ONLY）
 */
export const ALL_STUDENT_EDITABLE_FIELDS = [
  ...STAGE_1_REQUIRED,
  ...STAGE_2_FIELDS,
  ...STAGE_3_FIELDS,
  ...STUDENT_ONLY_FIELDS,
] as const;

export type StudentEditableField = typeof ALL_STUDENT_EDITABLE_FIELDS[number];
export type TeacherOnlyField = typeof TEACHER_ONLY_FIELDS[number];

/** 注：realName/phone/gender/ethnicity 在 User 模型上，余字段在 StudentProfile 模型上 */
export const USER_LEVEL_FIELDS = ['realName', 'phone', 'gender', 'ethnicity'] as const;
