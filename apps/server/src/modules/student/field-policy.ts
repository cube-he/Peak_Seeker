/**
 * ① 老师独占字段：学生端不可见、不可写。
 *
 * 调整记录（2026-05-06）：
 * - 移除 totalScore + 6 个单科分（scoreChinese/Math/English/FirstChoice/Sub1/Sub2）
 *   → 学生自己最清楚自己分数，移到 STAGE_1（②）让学生填
 * - provincialRank 保留：永远由 ScoreSegment.scoreToRank 自动计算，谁都不手填
 * - bonusPolicyStatus + bonusItems 保留：政策解读，老师专业判断
 * - 户籍 / 高考所在地 保留：正式信息，老师录入
 */
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

/**
 * ③ 学生端独有字段：仅学生端写。
 */
export const STUDENT_ONLY_FIELDS = [
  'formFiller',
  'parentSignedAt',
] as const;

/**
 * W3 阶段 1：核心字段（学生 5 分钟搞定）
 *
 * 调整记录（2026-05-06）：
 * - 加 6 个分数字段 + 选科组合（firstChoice/reChoices）
 * - examType（物理类/历史类）+ firstChoice（具体首选科目）+ reChoices（再选 2 科）共同
 *   构成完整选考组合，是推荐算法的硬约束输入
 * - totalScore 由学生自填后，后端用 score-segment 自动计算 provincialRank
 */
export const STAGE_1_REQUIRED = [
  'realName',
  'phone',
  'gender',
  'examType',
  'parentPhone',
  // 同时归入 STUDENT_ONLY_FIELDS：学生端必填，但权限层视为 student-only 字段
  'formFiller',
  // 选科组合
  'firstChoice',
  'reChoices',
  // 分数（学生自填）
  'totalScore',
  'scoreChinese',
  'scoreMath',
  'scoreEnglish',
  'scoreFirstChoice',
  'scoreSub1',
  'scoreSub2',
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

const _STUDENT_EDITABLE_TUPLE = [
  ...STAGE_1_REQUIRED,
  ...STAGE_2_FIELDS,
  ...STAGE_3_FIELDS,
  ...STUDENT_ONLY_FIELDS,
] as const;

/**
 * 学生端总可编辑字段集（去重后的并集）。
 *
 * 注：`formFiller` 在 STAGE_1_REQUIRED（W3 阶段 1 必填项）和 STUDENT_ONLY_FIELDS
 * （仅学生端可写）中均出现 — 这是有意的 dual-tag。此处用 Set 去重以避免下游
 * 迭代消费者（如权限校验循环）对同一字段处理两次。
 */
export const ALL_STUDENT_EDITABLE_FIELDS: ReadonlyArray<typeof _STUDENT_EDITABLE_TUPLE[number]> =
  Array.from(new Set(_STUDENT_EDITABLE_TUPLE));

export type StudentEditableField = typeof _STUDENT_EDITABLE_TUPLE[number];
export type TeacherOnlyField = typeof TEACHER_ONLY_FIELDS[number];

/** 注：realName/phone/gender/ethnicity 在 User 模型上，余字段在 StudentProfile 模型上 */
export const USER_LEVEL_FIELDS = ['realName', 'phone', 'gender', 'ethnicity'] as const;
