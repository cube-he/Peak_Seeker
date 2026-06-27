// 志愿表多级排序: 段内(冲/稳/保 各自)对方案行做可堆叠的稳定排序。
// 梯度是固定分组层, 不在此 SortKey 内(见 buildAppliedOrder)。null 值一律沉底。

export type SortKey =
  | 'SCHOOL_NATURE'    // 办学性质 公办/民办/中外合作
  | 'PROVINCE_INOUT'   // 川内 / 川外
  | 'GROUP_MIN_SCORE'  // 专业组最低分
  | 'GROUP_MIN_RANK'   // 专业组最低位次
  | 'PLAN_COUNT'       // 招生计划数
  | 'UNIVERSITY_RANK'  // 院校排名(软科)
  | 'TUITION'          // 学费
  | 'TAGS'             // 985/211/双一流
  | 'RANK_DIFF';       // 相对学生位次差

export type SortDir = 'asc' | 'desc';
export interface SortRule { key: SortKey; dir: SortDir; }

// 排序读取的最小行形状(后端 findById 已透出这些字段)
export interface SortableItem {
  id: number;
  gradient: string; // CHONG / WEN / BAO
  schoolNature: string | null;
  province: string | null;
  inSichuan: boolean;
  score25Group: number | null;
  rank25Group: number | null;
  planCount: number | null;
  tuition: number | null;
  softRanking: number | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  rank25Major: number | null;
  lastYearMinRank: number | null;
}

export interface SortContext { studentRank: number | null; }

// 办学性质 → 序: 公办0 < 民办1 < 中外合作2; 无法判定 = null(沉底)
function natureRank(s: string | null): number | null {
  if (!s) return null;
  if (s.includes('公办')) return 0;
  if (s.includes('民办')) return 1;
  if (s.includes('中外') || s.includes('合作')) return 2;
  return null;
}

// 取某行某键的数值化比较值; null = 该键无值 → 沉底
function getSortValue(item: SortableItem, key: SortKey, ctx: SortContext): number | null {
  switch (key) {
    case 'SCHOOL_NATURE':
      return natureRank(item.schoolNature);
    case 'PROVINCE_INOUT':
      return item.inSichuan ? 0 : item.province ? 1 : null;
    case 'GROUP_MIN_SCORE':
      return item.score25Group ?? null;
    case 'GROUP_MIN_RANK':
      return item.rank25Group ?? null;
    case 'PLAN_COUNT':
      return item.planCount ?? null;
    case 'UNIVERSITY_RANK':
      return item.softRanking ?? null;
    case 'TUITION':
      return item.tuition ?? null;
    case 'TAGS':
      return item.is985 || item.is211 || item.isDoubleFirstClass ? 0 : 1;
    case 'RANK_DIFF': {
      const histRank = item.rank25Major ?? item.rank25Group ?? item.lastYearMinRank ?? null;
      if (histRank == null || ctx.studentRank == null) return null;
      return histRank - ctx.studentRank;
    }
    default:
      return null;
  }
}

function compareByRule(a: SortableItem, b: SortableItem, rule: SortRule, ctx: SortContext): number {
  const va = getSortValue(a, rule.key, ctx);
  const vb = getSortValue(b, rule.key, ctx);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;  // null 沉底
  if (vb == null) return -1;
  const base = va - vb;       // 升序基准
  if (base === 0) return 0;
  return rule.dir === 'asc' ? base : -base;
}

// 段内稳定多级排序: 用原索引兜底保证稳定
export function sortPlanItems(items: SortableItem[], rules: SortRule[], ctx: SortContext): SortableItem[] {
  const decorated = items.map((item, i) => ({ item, i }));
  decorated.sort((a, b) => {
    for (const rule of rules) {
      const c = compareByRule(a.item, b.item, rule, ctx);
      if (c !== 0) return c;
    }
    return a.i - b.i;
  });
  return decorated.map((d) => d.item);
}

// 写回志愿顺位: 投档铁律强制 冲→稳→保 分块, 块内套用段内多级排序, 返回扁平 itemId 顺序。
// 喂给现有 reorderItems(planId, itemIds) 即可(后端两阶段提交避让唯一约束)。
const TIER_ORDER: string[] = ['CHONG', 'WEN', 'BAO'];

export function buildAppliedOrder(items: SortableItem[], rules: SortRule[], ctx: SortContext): number[] {
  const buckets: Record<string, SortableItem[]> = { CHONG: [], WEN: [], BAO: [] };
  for (const it of items) {
    (buckets[it.gradient] ?? buckets.CHONG).push(it); // 未知梯度兜底进冲块
  }
  const ordered = TIER_ORDER.flatMap((g) => sortPlanItems(buckets[g], rules, ctx));
  return ordered.map((it) => it.id);
}

// 排序键下拉选项: label + 默认方向 + 双向标签(切键时方向重置为 defaultDir)
export const SORT_KEY_OPTIONS: Array<{
  key: SortKey; label: string; defaultDir: SortDir; dir: { asc: string; desc: string };
}> = [
  { key: 'SCHOOL_NATURE',   label: '办学性质',       defaultDir: 'asc',  dir: { asc: '公办优先', desc: '中外优先' } },
  { key: 'PROVINCE_INOUT',  label: '川内川外',       defaultDir: 'asc',  dir: { asc: '川内优先', desc: '川外优先' } },
  { key: 'GROUP_MIN_SCORE', label: '专业组最低分',   defaultDir: 'desc', dir: { asc: '分低', desc: '分高' } },
  { key: 'GROUP_MIN_RANK',  label: '专业组最低位次', defaultDir: 'asc',  dir: { asc: '位次靠前', desc: '位次靠后' } },
  { key: 'PLAN_COUNT',      label: '招生计划数',     defaultDir: 'desc', dir: { asc: '计划少', desc: '计划多' } },
  { key: 'UNIVERSITY_RANK', label: '院校排名',       defaultDir: 'asc',  dir: { asc: '排名高', desc: '排名低' } },
  { key: 'TUITION',         label: '学费',           defaultDir: 'asc',  dir: { asc: '学费低', desc: '学费高' } },
  { key: 'TAGS',            label: '985/211/双一流',  defaultDir: 'asc',  dir: { asc: '有标签优先', desc: '无标签优先' } },
  { key: 'RANK_DIFF',       label: '相对位次差',     defaultDir: 'desc', dir: { asc: '偏冲', desc: '偏稳' } },
];

export const SORT_KEY_LABEL: Record<SortKey, string> = Object.fromEntries(
  SORT_KEY_OPTIONS.map((o) => [o.key, o.label]),
) as Record<SortKey, string>;

export function defaultDirOf(key: SortKey): SortDir {
  return SORT_KEY_OPTIONS.find((o) => o.key === key)?.defaultDir ?? 'desc';
}

// 快捷预设: 一键填入常用规则栈
export const SORT_PRESETS: Array<{ label: string; rules: SortRule[] }> = [
  { label: '公办优先', rules: [{ key: 'SCHOOL_NATURE', dir: 'asc' }] },
  { label: '川内优先', rules: [{ key: 'PROVINCE_INOUT', dir: 'asc' }] },
  { label: '分数线高→低', rules: [{ key: 'GROUP_MIN_SCORE', dir: 'desc' }] },
];
