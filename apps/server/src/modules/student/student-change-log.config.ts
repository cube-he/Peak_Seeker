/**
 * 学生资料变更日志:白名单字段配置。
 * 只追踪对方案生成 / 服务交付有显著影响的字段,避免日志爆炸。
 */
export interface ChangeLogFieldDef {
  key: string;
  label: string;
}

export const TRACKED_FIELDS: ChangeLogFieldDef[] = [
  { key: 'examType', label: '选科类型' },
  { key: 'examYear', label: '高考年份' },
  { key: 'totalScore', label: '模考总分' },
  { key: 'provincialRank', label: '预测位次' },
  { key: 'firstChoice', label: '首选科目' },
  { key: 'reChoices', label: '再选科目' },
  { key: 'subjectScores', label: '科目成绩' },
  { key: 'bonusPolicyStatus', label: '加分政策状态' },
  { key: 'bonusItems', label: '加分项目' },
  { key: 'province', label: '省份' },
  { key: 'city', label: '城市' },
  { key: 'county', label: '区县' },
  { key: 'isRural', label: '农村户口' },
  { key: 'examLocationProvince', label: '高考所在省' },
  { key: 'examLocationCity', label: '高考所在市' },
  { key: 'examLocationCounty', label: '高考所在县' },
  { key: 'preferredProvinces', label: '意向省份' },
  { key: 'preferredCities', label: '意向城市' },
  { key: 'preferredMajors', label: '意向专业' },
  { key: 'preferredMajorCategories', label: '意向专业类别' },
  { key: 'preferredUniversities', label: '意向院校' },
  { key: 'excludedCities', label: '排除城市' },
  { key: 'excludedMajors', label: '排除专业' },
  { key: 'stayPreference', label: '留省偏好' },
  { key: 'acceptLevel', label: '调剂接受度' },
  { key: 'colorBlind', label: '色盲' },
  { key: 'colorWeak', label: '色弱' },
  { key: 'height', label: '身高' },
  { key: 'weight', label: '体重' },
  { key: 'visionLeft', label: '左眼视力' },
  { key: 'visionRight', label: '右眼视力' },
  { key: 'careerPlan', label: '升学规划' },
  { key: 'priorityMode', label: '优先模式' },
  { key: 'tuitionBudget', label: '学费预算' },
];

export const TRACKED_FIELD_KEYS = new Set(TRACKED_FIELDS.map((f) => f.key));

export function serializeFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  const sa = serializeFieldValue(a);
  const sb = serializeFieldValue(b);
  return sa === sb;
}
