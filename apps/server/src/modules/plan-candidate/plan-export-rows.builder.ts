// 把候选服务富化组 + 方案条目快照组装成「家长版 A3 数据表」数据模型。
// 纯函数, 无 Prisma 依赖, 便于单测。口径见 docs/superpowers/specs/2026-06-26-parent-explain-export-table-design.md。

export interface ExportMajor {
  majorCode: string | null;
  majorName: string;
  planCount: number | null; // 26 计划(当前年)
  planByYear: Record<number, number | null>;
  minScoreByYear: Record<number, number | null>;
  suppByYear: Record<number, number[] | null>; // 逐轮征集人数 [第1轮, 第2轮, ...]
  duration: string | null;
  tuition: number | null;
  planNotes: string | null;
  bookPageNumber: number | null; // 招生考试报页码(2026), 历史年 null
}

export interface ExportGroup {
  sequence: number;
  gradient: string;
  gradientLabel: string; // 冲/稳/保
  universityName: string;
  universityCode: string | null;
  schoolNature: string | null;
  schoolTags: string | null;
  city: string | null;
  universityRank: number | null;
  groupCode: string | null;
  groupPlanCount: number | null; // 组招生人数
  subjectRequirement: string | null; // 选科要求(组级): 首选/再选, 如「历史/政治」「物理/不限」
  fallback: boolean;
  majors: ExportMajor[];
}

export interface ExportSheet {
  student: { name: string; examTypeLabel: string; score: number | null; rank: number | null };
  plan: { id: number; name: string; year: number; batchName: string | null; version: number | null };
  years: number[]; // [b-2, b-1, b]
  groups: ExportGroup[];
}

const GRADIENT_LABEL: Record<string, string> = { CHONG: '冲', WEN: '稳', BAO: '保' };
const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
  COMPREHENSIVE_SCIENCE: '理科',
  COMPREHENSIVE_LIBERAL: '文科',
};

function groupKey(universityId: unknown, groupCode: unknown): string {
  return `${universityId}|${groupCode ?? ''}`;
}

function composeSchoolTags(u: any): string | null {
  if (!u) return null;
  const tags: string[] = [];
  if (u.is985) tags.push('985');
  if (u.is211) tags.push('211');
  if (u.isDoubleFirstClass) tags.push('双一流');
  return tags.length ? tags.join('/') : null;
}

// 选科要求: 首选科类(历史/物理) + 再选要求(政治/地理/不限...), 拼成「历史/政治」「物理/不限」。
function composeSubjectRequirement(subjects: any, reReq: any): string | null {
  const s = typeof subjects === 'string' ? subjects.trim() : '';
  const r = typeof reReq === 'string' ? reReq.trim() : '';
  if (s && r) return `${s}/${r}`;
  return s || r || null;
}

function pickHistoryByYear(
  history4y: any[] | null | undefined,
  years: number[],
  field: 'planCount' | 'minScore',
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const y of years) {
    const row = Array.isArray(history4y) ? history4y.find((h) => h?.year === y) : null;
    const v = row ? row[field] : null;
    out[y] = typeof v === 'number' ? v : null;
  }
  return out;
}

// 逐轮征集人数, 按轮次升序: [第1轮, 第2轮, 第3轮...]。无征集=null。
function buildSuppByYear(
  suppByYear: Record<number, number | null> | null | undefined,
  suppRoundsByYear: Record<number, Array<{ round: number; count: number }> | null> | null | undefined,
  years: number[],
): Record<number, number[] | null> {
  const out: Record<number, number[] | null> = {};
  for (const y of years) {
    const rounds = suppRoundsByYear?.[y];
    const total = suppByYear?.[y];
    if (Array.isArray(rounds) && rounds.length > 0) {
      out[y] = [...rounds]
        .sort((a, b) => (a?.round ?? 0) - (b?.round ?? 0))
        .map((r) => (typeof r?.count === 'number' ? r.count : 0));
    } else if (typeof total === 'number' && total > 0) {
      out[y] = [total]; // 无分轮明细(旧数据兜底): 当作单轮显示
    } else {
      out[y] = null;
    }
  }
  return out;
}

function buildEnrichedMajor(m: any, years: number[]): ExportMajor {
  return {
    majorCode: m.majorCode ?? null,
    majorName: m.majorName ?? '',
    planCount: typeof m.planCount === 'number' ? m.planCount : null,
    planByYear: pickHistoryByYear(m.majorHistory4y, years, 'planCount'),
    minScoreByYear: pickHistoryByYear(m.majorHistory4y, years, 'minScore'),
    suppByYear: buildSuppByYear(m.supplementaryByYear, m.supplementaryRoundsByYear, years),
    duration: m.duration ?? m.standardDuration ?? null,
    tuition: typeof m.tuition === 'number' ? m.tuition : null,
    planNotes: m.planNotes ?? null,
    bookPageNumber: typeof m.bookPageNumber === 'number' ? m.bookPageNumber : null,
  };
}

function buildEnrichedGroup(item: any, g: any, years: number[]): ExportGroup {
  return {
    sequence: item.sequence,
    gradient: item.gradient,
    gradientLabel: GRADIENT_LABEL[item.gradient] ?? '-',
    universityName: g.universityName ?? item.universityName ?? '',
    universityCode: g.universityCode ?? item.universityCode ?? null,
    schoolNature: g.university?.runningNature ?? item.schoolNature ?? null,
    schoolTags: item.schoolTags ?? composeSchoolTags(g.university),
    city: g.university?.city ?? null,
    universityRank: typeof g.universityRank === 'number' ? g.universityRank : null,
    groupCode: item.groupCode ?? g.groupCode ?? null,
    groupPlanCount: typeof g.currentPlanCount === 'number' ? g.currentPlanCount : null,
    // 选科要求(组级): 首选科类(g.subjects) + 再选要求(组内首个专业 subjectRequirements, 专业组内统一)
    subjectRequirement: composeSubjectRequirement(
      g.subjects,
      Array.isArray(g.majors) ? g.majors[0]?.subjectRequirements : null,
    ) ?? item.subjectRequirement ?? null,
    fallback: false,
    majors: Array.isArray(g.majors) ? g.majors.map((m: any) => buildEnrichedMajor(m, years)) : [],
  };
}

// 快照兜底: 富化结果缺该组时, 用 planItem 自身渲染单个锚定专业。
function buildFallbackGroup(item: any, years: number[]): ExportGroup {
  const minScoreByYear: Record<number, number | null> = {};
  for (const y of years) minScoreByYear[y] = null;
  // 快照线字段名锁定 2024/2025 两年, 按真实年份映射(而非数组位置), years 平移也不会错位。
  if (typeof item.score24Major === 'number' && years.includes(2024)) minScoreByYear[2024] = item.score24Major;
  if (typeof item.score25Major === 'number' && years.includes(2025)) minScoreByYear[2025] = item.score25Major;
  const planByYear: Record<number, number | null> = {};
  const suppByYear: Record<number, number[] | null> = {};
  for (const y of years) { planByYear[y] = null; suppByYear[y] = null; }

  return {
    sequence: item.sequence,
    gradient: item.gradient,
    gradientLabel: GRADIENT_LABEL[item.gradient] ?? '-',
    universityName: item.universityName ?? '',
    universityCode: item.universityCode ?? null,
    schoolNature: item.schoolNature ?? null,
    schoolTags: item.schoolTags ?? null,
    city: null,
    universityRank: null,
    groupCode: item.groupCode ?? null,
    groupPlanCount: null,
    subjectRequirement: item.subjectRequirement ?? null,
    fallback: true,
    majors: [
      {
        majorCode: item.majorCode ?? null,
        majorName: item.majorName ?? '',
        planCount: typeof item.planCount === 'number' ? item.planCount : null,
        planByYear,
        minScoreByYear,
        suppByYear,
        duration: null,
        tuition: typeof item.tuition === 'number' ? item.tuition : null,
        planNotes: null,
        bookPageNumber: null,
      },
    ],
  };
}

export function buildExportSheet(input: {
  plan: any;
  enrichedGroups: any[];
  years: number[];
}): ExportSheet {
  const { plan, enrichedGroups, years } = input;
  const byKey = new Map<string, any>();
  for (const g of enrichedGroups ?? []) byKey.set(groupKey(g.universityId, g.groupCode), g);

  const items: any[] = Array.isArray(plan.planItems) ? plan.planItems : [];
  const groups = items.map((item) => {
    const g = byKey.get(groupKey(item.universityId, item.groupCode));
    return g ? buildEnrichedGroup(item, g, years) : buildFallbackGroup(item, years);
  });

  return {
    student: {
      name: plan.student?.user?.realName ?? '学生',
      examTypeLabel: EXAM_TYPE_LABEL[plan.student?.examType] ?? '',
      score: plan.scoreUsed ?? plan.student?.totalScore ?? null,
      rank: plan.rankUsed ?? plan.student?.provincialRank ?? null,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      year: plan.year,
      batchName: plan.batchName ?? null,
      version: plan.versionNo ?? plan.version ?? null,
    },
    years,
    groups,
  };
}
