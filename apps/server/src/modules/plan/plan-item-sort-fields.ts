// 方案行排序字段: 从 PlanItem 快照 + University(单独查) merge 出多级排序所需的原始字段。
// University 字段优先于快照(快照可能稀疏/过期); 派生 inSichuan 供"川内川外"排序。
export interface UniversitySortSource {
  province: string | null;
  runningNature: string | null;
  softRanking: number | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
}

export function toSortFields(item: any, university?: UniversitySortSource | null) {
  const province = university?.province ?? null;
  return {
    // 历史分/位次原始字段(拆开, 不再压成一个 historicalMin*)
    score25Group: item.score25Group ?? null,
    rank25Group: item.rank25Group ?? null,
    score25Major: item.score25Major ?? null,
    rank25Major: item.rank25Major ?? null,
    score24Major: item.score24Major ?? null,
    lastYearMinScore: item.lastYearMinScore ?? null,
    lastYearMinRank: item.lastYearMinRank ?? null,
    // 院校属性(University 优先, 缺失回退快照)
    schoolNature: university?.runningNature ?? item.schoolNature ?? null,
    province,
    inSichuan: province === '四川',
    softRanking: university?.softRanking ?? null,
    is985: university?.is985 ?? false,
    is211: university?.is211 ?? false,
    isDoubleFirstClass: university?.isDoubleFirstClass ?? false,
  };
}
