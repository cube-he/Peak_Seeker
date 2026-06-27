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
