/**
 * 西典 2025 接待单 单元格 → 学生档案字段映射
 *
 * 模板：apps/server/templates/intake-form-2025-v1.xlsx (Sheet1)
 * 数据来源：data/03_专家版主表/output/2025西典志愿填报接待单.xlsx
 *
 * 三种映射类型：
 * - user：取 profile.user[field]
 * - profile：取 profile[field]（StudentProfile 字段）
 * - computed：调用 computeIntakeValue(key) 计算值
 */
export interface IntakeCellMapping {
  cell: string;
  source:
    | { kind: 'user'; field: string }
    | { kind: 'profile'; field: string }
    | { kind: 'computed'; key: string };
  /** 可选：把原始值变换成单元格要展示的内容（如枚举 → 中文勾选框） */
  transform?: (value: unknown) => string | number | null;
}

export const INTAKE_CELL_MAP: IntakeCellMapping[] = [
  // ── 个人信息 ────────────────────────────
  { cell: 'B2', source: { kind: 'user', field: 'realName' } },
  {
    cell: 'B3',
    source: { kind: 'user', field: 'gender' },
    transform: (v) => (v === 'MALE' ? '男' : v === 'FEMALE' ? '女' : ''),
  },
  { cell: 'B4', source: { kind: 'user', field: 'ethnicity' } },
  {
    cell: 'B5',
    source: { kind: 'profile', field: 'politicalStatus' },
    transform: (v) =>
      v === 'PARTY_MEMBER' ? '党员☑ 团员☐ 群众☐' :
      v === 'LEAGUE_MEMBER' ? '党员☐ 团员☑ 群众☐' :
      v === 'MASSES' ? '党员☐ 团员☐ 群众☑' : '党员☐ 团员☐ 群众☐',
  },
  { cell: 'D2', source: { kind: 'computed', key: 'householdLocation' } },
  { cell: 'D3', source: { kind: 'computed', key: 'examLocation' } },
  { cell: 'D4', source: { kind: 'user', field: 'phone' } },

  // ── 身体条件 ────────────────────────────
  { cell: 'B6', source: { kind: 'profile', field: 'height' } },
  { cell: 'D6', source: { kind: 'profile', field: 'weight' } },
  { cell: 'C7', source: { kind: 'computed', key: 'visionNaked' } },
  { cell: 'E7', source: { kind: 'computed', key: 'visionCorrected' } },
  { cell: 'C9', source: { kind: 'computed', key: 'colorVision' } },
  { cell: 'D10', source: { kind: 'profile', field: 'medicalHistory' } },

  // ── 高考分数 ────────────────────────────
  { cell: 'B14', source: { kind: 'profile', field: 'scoreChinese' } },
  { cell: 'C14', source: { kind: 'profile', field: 'scoreMath' } },
  { cell: 'D14', source: { kind: 'profile', field: 'scoreEnglish' } },
  { cell: 'E14', source: { kind: 'computed', key: 'firstChoiceLabel' } },
  { cell: 'F14', source: { kind: 'computed', key: 'reChoicesLabel' } },
  { cell: 'B16', source: { kind: 'profile', field: 'totalScore' } },
  { cell: 'E16', source: { kind: 'profile', field: 'provincialRank' } },

  // ── 志愿倾向 ────────────────────────────
  {
    cell: 'C17',
    source: { kind: 'profile', field: 'bonusPolicyStatus' },
    transform: (v) =>
      v === 'NONE' ? '没有☑ 有☐ 不清楚☐' :
      v === 'HAS_BONUS' ? '没有☐ 有☑ 不清楚☐' :
      v === 'UNKNOWN' ? '没有☐ 有☐ 不清楚☑' : '没有☐ 有☐ 不清楚☐',
  },
  {
    cell: 'C18',
    source: { kind: 'profile', field: 'priorityMode' },
    transform: (v) =>
      v === 'UNIVERSITY_FIRST' ? '院校优先☑ 专业优先☐' :
      v === 'MAJOR_FIRST' ? '院校优先☐ 专业优先☑' : '院校优先☐ 专业优先☐',
  },
  {
    cell: 'B19',
    source: { kind: 'profile', field: 'preferredBatches' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'B20',
    source: { kind: 'profile', field: 'preferredProvinces' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'B21',
    source: { kind: 'profile', field: 'preferredUniversities' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'B22',
    source: { kind: 'profile', field: 'preferredMajors' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'C23',
    source: { kind: 'profile', field: 'acceptLevel' },
    transform: (v) =>
      v === 'STRICT' ? '完全不考虑☑ 与意向相近的☐ 非冷门可考虑☐' :
      v === 'MODERATE' ? '完全不考虑☐ 与意向相近的☑ 非冷门可考虑☐' :
      v === 'RELAXED' ? '完全不考虑☐ 与意向相近的☐ 非冷门可考虑☑' : '',
  },
  {
    cell: 'C24',
    source: { kind: 'profile', field: 'remoteAreaAcceptance' },
    transform: (v) =>
      v === 'ABSOLUTELY_NO' ? '绝对不接受☑ 保底可☐ 名校可☐ 好专业可☐' :
      v === 'BACKUP_ONLY' ? '绝对不接受☐ 保底可☑ 名校可☐ 好专业可☐' :
      v === 'FAMOUS_OK' ? '绝对不接受☐ 保底可☐ 名校可☑ 好专业可☐' :
      v === 'GOOD_MAJOR_OK' ? '绝对不接受☐ 保底可☐ 名校可☐ 好专业可☑' : '',
  },
  {
    cell: 'C25',
    source: { kind: 'profile', field: 'coldMajorAcceptance' },
    transform: (v) =>
      v === 'ABSOLUTELY_NO' ? '绝对不接受☑ 名校可☐ 发达地区可☐ 前景好可☐' :
      v === 'FAMOUS_OK' ? '绝对不接受☐ 名校可☑ 发达地区可☐ 前景好可☐' :
      v === 'DEVELOPED_AREA_OK' ? '绝对不接受☐ 名校可☐ 发达地区可☑ 前景好可☐' :
      v === 'GOOD_PROSPECT_OK' ? '绝对不接受☐ 名校可☐ 发达地区可☐ 前景好可☑' : '',
  },
];

/**
 * 计算字段（多字段拼接、需要业务逻辑）。
 * 返回 null 表示未填，导出时跳过该单元格（保留模板原值）。
 */
export function computeIntakeValue(
  key: string,
  profile: Record<string, any>,
  user: Record<string, any> | undefined,
): string | number | null {
  void user;
  switch (key) {
    case 'householdLocation':
      return [profile.province, profile.city, profile.county]
        .filter(Boolean)
        .join('/') || null;
    case 'examLocation':
      return [
        profile.examLocationProvince,
        profile.examLocationCity,
        profile.examLocationCounty,
      ]
        .filter(Boolean)
        .join('/') || null;
    case 'visionNaked':
      return profile.visionLeft != null || profile.visionRight != null
        ? `${profile.visionLeft ?? ''}/${profile.visionRight ?? ''}`
        : null;
    case 'visionCorrected':
      return profile.visionLeftCorrected != null ||
        profile.visionRightCorrected != null
        ? `${profile.visionLeftCorrected ?? ''}/${profile.visionRightCorrected ?? ''}`
        : null;
    case 'colorVision':
      if (profile.colorBlind) return '正常☐ 色弱☐ 色盲☑';
      if (profile.colorWeak) return '正常☐ 色弱☑ 色盲☐';
      return '正常☑ 色弱☐ 色盲☐';
    case 'firstChoiceLabel': {
      const v = profile.firstChoice;
      if (v === '物理' || v === 'PHYSICS') return '物理☑ 历史☐';
      if (v === '历史' || v === 'HISTORY') return '物理☐ 历史☑';
      return '物理☐ 历史☐';
    }
    case 'reChoicesLabel': {
      const arr: string[] = profile.reChoices ?? [];
      const subjects = ['化学', '生物', '政治', '地理'];
      return subjects.map((s) => `${s}${arr.includes(s) ? '☑' : '☐'}`).join(' ');
    }
    default:
      return null;
  }
}
