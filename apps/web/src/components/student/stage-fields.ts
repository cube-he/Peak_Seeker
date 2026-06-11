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
  'ethnicity',
  'politicalStatus',
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
] as const;

/**
 * 镜像后端 TEACHER_ONLY_FIELDS。2026-05-06 redesign 后只剩 provincialRank。
 * 户籍/加分/考试地 9 个字段已下放给学生（见后端 STUDENT_NEWLY_WRITABLE）。
 */
export const TEACHER_ONLY_FIELDS = ['provincialRank'] as const;

/**
 * 字段 key → 中文 label 映射。
 * 用于把 missingFieldsForRecommend 等接口返回的英文 key 翻译给老师看。
 * 没列出的 key 会原样回显（兜底）。
 */
export const FIELD_LABELS: Record<string, string> = {
  // Stage 1 — 核心
  realName: '真实姓名',
  phone: '联系电话',
  gender: '性别',
  ethnicity: '民族',
  politicalStatus: '政治面貌',
  examType: '考试类型',
  parentPhone: '家长电话',
  formFiller: '填表人',
  firstChoice: '首选科目',
  reChoices: '再选科目',
  totalScore: '总分',
  scoreChinese: '语文',
  scoreMath: '数学',
  scoreEnglish: '英语',
  scoreFirstChoice: '首选科目分数',
  scoreSub1: '再选 1 分数',
  scoreSub2: '再选 2 分数',
  provincialRank: '省排名',
  // Stage 2 — 完善
  height: '身高',
  weight: '体重',
  visionLeft: '左眼视力',
  visionRight: '右眼视力',
  colorBlind: '色盲',
  colorWeak: '色弱',
  preferredProvinces: '意向省份',
  preferredCities: '意向城市',
  preferredMajors: '意向专业',
  preferredUniversities: '意向院校',
  preferredMajorCategories: '意向专业大类',
  priorityMode: '优先策略',
  careerPlan: '生涯规划',
  careerDirection: '职业方向',
  preferredBatches: '意向批次',
  // Stage 3 — 高级
  remoteAreaAcceptance: '是否接受偏远地区',
  coldMajorAcceptance: '是否接受冷门专业',
  stayPreference: '本地/外地倾向',
  preferredTags: '偏好标签',
  excludedProvinces: '排除省份',
  excludedCities: '排除城市',
  excludedUniversities: '排除院校',
  excludedMajors: '排除专业',
  interests: '兴趣爱好',
  personalityType: '性格类型',
  selfDescription: '自我描述',
  militaryInterest: '军校意向',
  teacherInterest: '师范意向',
  tuitionBudget: '学费预算',
  acceptSinoForeign: '是否接受中外合作',
  acceptPrivate: '是否接受民办',
  acceptCooperation: '是否接受合作办学',
  otherRequirements: '其他要求',
  visionLeftCorrected: '左眼矫正视力',
  visionRightCorrected: '右眼矫正视力',
  physicalLimits: '身体限制',
  medicalHistory: '病史',
  // Common
  highSchool: '高中学校',
  classInfo: '所在班级',
  birthDate: '出生日期',
  // 资格判定必填 (2026-06-10 三层必填定调)
  province: '户籍省份',
  city: '户籍市',
  county: '户籍县（区）',
  isRural: '是否农村户籍',
  bonusPolicyStatus: '加分政策',
  examLocationProvince: '高考报名省份',
  examLocationCity: '高考报名市',
  examLocationCounty: '高考报名县（区）',
};

/** 把英文字段 key 翻译成中文 label；未知 key 原样返回 */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

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
