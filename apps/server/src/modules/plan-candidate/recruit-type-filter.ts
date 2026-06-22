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

/** 上卷视图: 组级先筛, 筛后无组的院校剔除; 空 csv → 原样返回同引用. */
export function filterUniversitiesByRecruitType<
  G extends { recruitType?: string | null },
  T extends { groups?: G[] },
>(universities: T[], csv?: string | null): T[] {
  const selected = parseRecruitTypeCsv(csv);
  if (selected.length === 0) return universities;
  const allow = new Set(selected);
  const out: T[] = [];
  for (const u of universities) {
    const kept = (u.groups ?? []).filter((grp) => allow.has(String(grp.recruitType ?? '')));
    if (kept.length > 0) out.push({ ...u, groups: kept });
  }
  return out;
}

/** 全量池里有哪些招生类型: distinct + 按组数降序(普通类自然置顶), 同数 localeCompare. */
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
