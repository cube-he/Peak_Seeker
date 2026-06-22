// 招生类型筛选 (服务端, 分页层). 同批次混多招生类型时让老师按类聚焦; 空选择 = 全部。
// 对标 sino-foreign-filter.ts: 纯函数, 不碰 DB / 缓存键。

/** CSV → 去空白去空项的数组. */
export function parseRecruitTypeCsv(csv?: string | null): string[] {
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 按招生类型筛选院校专业组; 空 csv → 原样返回同引用(不过滤). */
export function filterGroupsByRecruitType<T extends { recruitType?: string | null }>(
  groups: T[],
  csv?: string | null,
): T[] {
  const selected = parseRecruitTypeCsv(csv);
  if (selected.length === 0) return groups;
  const allow = new Set(selected);
  return groups.filter((grp) => allow.has(String(grp.recruitType ?? '')));
}

/** 全量池里有哪些招生类型: distinct + 按出现组数降序(同数 localeCompare). 组数最多者居首(本科批里通常是普通类). */
export function collectRecruitTypes(groups: Array<{ recruitType?: string | null }>): string[] {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const rt = String(g.recruitType ?? '').trim();
    if (!rt) continue;
    counts.set(rt, (counts.get(rt) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([rt]) => rt);
}
