/**
 * ① 老师独占字段：学生端不可见、不可写。
 *
 * 调整记录（2026-05-06 redesign）：
 * - 户籍/加分/考试地 9 个字段下放给学生（移到 STUDENT_NEWLY_WRITABLE）
 * - provincialRank 仍由 ScoreSegment.scoreToRank 自动计算，不属于人工录入
 */
export const TEACHER_ONLY_FIELDS = ['provincialRank'] as const;

/**
 * 2026-05-06 重新放权：学生可填，老师可改/审核。
 * 这些字段不再过滤；学生 PATCH 时后端写对应组的 *UpdatedBy/*UpdatedAt provenance。
 */
export const STUDENT_NEWLY_WRITABLE = [
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

/** 字段所属的 provenance 组（用于决定写哪一对 *UpdatedBy/At） */
export const FIELD_TO_PROVENANCE_GROUP = {
  bonusPolicyStatus: 'bonus',
  bonusItems: 'bonus',
  province: 'hukou',
  city: 'hukou',
  county: 'hukou',
  isRural: 'hukou',
  examLocationProvince: 'examLocation',
  examLocationCity: 'examLocation',
  examLocationCounty: 'examLocation',
} as const;

export type ProvenanceGroup = 'hukou' | 'bonus' | 'examLocation';

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
  'ethnicity',
  'politicalStatus',
  'examType',
  'examYear',
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
 * @deprecated 2026-06-25 业务收窄后由 REQUIRED_FIELDS (单层) 替代.
 * 保留导出供未迁移的旧调用方 (短期), 全部迁完后删除.
 *
 * 推荐算法的硬约束字段 — 生成方案的最小集合.
 * 业务定义 (2026-05-28): 只要这些字段填齐 + provincialRank 算好, 就可生成方案.
 */
export const CORE_FOR_RECOMMEND = [
  'realName',
  'phone',
  'parentPhone',
  'examType',
  'firstChoice',
  'reChoices',
  'totalScore',
  // 2026-06-10 业务定调: 意向专业(梯队, 池子不算)与优先模式也是生成方案硬门槛
  'preferredMajors',
  'priorityMode',
  // 2026-06-11 业务定调: 语数外 + 选科三科成绩必填 (totalScore 由 9 科累加)
  'scoreChinese',
  'scoreMath',
  'scoreEnglish',
  'scoreFirstChoice',
  'scoreSub1',
  'scoreSub2',
] as const;

/**
 * @deprecated 2026-06-25 业务收窄后由 REQUIRED_FIELDS (单层) 替代.
 * 保留导出供未迁移的旧调用方 (短期), 全部迁完后删除.
 *
 * 批次资格判定必填 (2026-06-10 业务定调: 与 CORE_FOR_RECOMMEND 同为生成方案硬门槛).
 * 缺任一字段时, 地域专项 (国家专项/省级师范/地方优师/乡村振兴/区域均衡/少民预科)、
 * 农村类 (地方专项/高校专项/农村医学)、年龄类 (军校/公安/军士)、民族类批次
 * 的资格全部判不了; bonusPolicyStatus 直接影响投档有效分.
 * gender/birthDate/ethnicity 在 User 表 (USER_LEVEL_FIELDS), 调 compute 前需 merge.
 */
export const CORE_FOR_ELIGIBILITY = [
  'province',
  'city',
  'county',
  'isRural',
  'gender',
  'birthDate',
  'ethnicity',
  'bonusPolicyStatus',
  // 2026-06-11 业务定调: 政治面貌(政审类批次)与高考报名地也必填
  'politicalStatus',
  'examLocationProvince',
  'examLocationCity',
  'examLocationCounty',
] as const;

/**
 * @deprecated 2026-06-25 业务收窄后由 REQUIRED_FIELDS (单层) 替代.
 * 保留导出供未迁移的旧调用方 (短期), 全部迁完后删除.
 *
 * 体检必填 (2026-06-10 业务定调: 同为生成方案硬门槛).
 * 军队/公安/司法/航海/消防/定向军士的体检硬规则输入.
 */
export const PHYSICAL_REQUIRED = [
  'height',
  'weight',
  'visionLeft',
  'visionRight',
  'colorBlind',
  'colorWeak',
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
  'excludedMajorCategories',
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
] as const;

const _STUDENT_EDITABLE_TUPLE = [
  ...STAGE_1_REQUIRED,
  ...STAGE_2_FIELDS,
  ...STAGE_3_FIELDS,
  ...STUDENT_ONLY_FIELDS,
  ...STUDENT_NEWLY_WRITABLE,
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
export const USER_LEVEL_FIELDS = ['realName', 'phone', 'gender', 'ethnicity', 'birthDate'] as const;

/**
 * 2026-06-25 业务定调收窄: 生成方案唯一硬约束 = 这 21 项
 * (色觉 UI 单 enum, 但 DB 保留 colorBlind+colorWeak 两列, 这里两列都必填).
 * (原含 examYear/examSource 共 23 项; 这俩选择器删除/隐藏后移出必填门, 见下方注释.)
 *
 * 替代 (但暂保留旧导出): CORE_FOR_RECOMMEND + CORE_FOR_ELIGIBILITY + PHYSICAL_REQUIRED.
 * 旧导出仍可用但不再被 progress.service 引用; 第三方调用方迁移完后再删.
 */
export const REQUIRED_FIELDS = [
  // 基础 (User 表)
  'realName',
  'gender',
  'phone',
  'ethnicity',
  // 户籍 (StudentProfile)
  'province',
  'city',
  'county',
  'isRural',
  // 高考报名地
  'examLocationProvince',
  'examLocationCity',
  'examLocationCounty',
  // 色觉 (UI 单 enum, DB 双布尔: 正常=两个 false, 色盲=colorBlind=true, 色弱=colorWeak=true)
  'colorBlind',
  'colorWeak',
  // 考试成绩 (整张「考试成绩」卡)
  // 注: examYear(隐藏, 固定2026)/examSource(已删选择器) 不再是教师可填字段, 故移出必填门,
  //     否则旧档值为空时"可推荐"判定永远卡"还缺 examYear/examSource"且无处可填(2026-06-25)。
  //     examYear 的值仍由后端 `?? 2026` 兜底供取数用, 不受影响。
  'firstChoice',
  'reChoices',
  'scoreChinese',
  'scoreMath',
  'scoreEnglish',
  'scoreFirstChoice',
  'scoreSub1',
  'scoreSub2',
] as const;

/**
 * 推荐填写 (影响完整度评分, 不阻塞"生成方案"按钮):
 * REQUIRED_FIELDS 之外的常见选填字段集合.
 * 注: 不严格等于"学生可编辑字段集 - REQUIRED" - 个别学生端字段 (如 parentSignedAt 签字时间戳) 不属于完整度计算口径, 不在本集合内.
 */
export const RECOMMENDED_FIELDS = [
  'parentPhone',
  'politicalStatus',
  'birthDate',
  'examType',
  'formFiller',
  'totalScore',
  'bonusPolicyStatus',
  'bonusItems',
  'height',
  'weight',
  'visionLeft',
  'visionRight',
  'visionLeftCorrected',
  'visionRightCorrected',
  'medicalHistory',
  'physicalLimits',
  'preferredProvinces',
  'preferredCities',
  'preferredMajors',
  'preferredUniversities',
  'preferredMajorCategories',
  'priorityMode',
  'careerPlan',
  'careerDirection',
  'preferredBatches',
  'remoteAreaAcceptance',
  'coldMajorAcceptance',
  'stayPreference',
  'preferredTags',
  'excludedProvinces',
  'excludedCities',
  'excludedUniversities',
  'excludedMajors',
  'excludedMajorCategories',
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
  'highSchool',
  'classInfo',
] as const;
