// 中外合作办学筛选 (服务端). 判定口径: 组内任一专业 isSinoForeign=true 即"含中外合作".
export type SinoForeignMode = 'only' | 'exclude';

/** 组内是否含中外合作办学专业. */
export function groupHasSinoForeign(
  group: { majors?: Array<{ isSinoForeign?: boolean }> } | null | undefined,
): boolean {
  return !!group && Array.isArray(group.majors) && group.majors.some((m) => !!m?.isSinoForeign);
}

/** 三态匹配: 空 mode = 全通过; only = 要含中外; exclude = 要不含中外. */
export function matchSinoForeign(hasSino: boolean, mode?: SinoForeignMode | null): boolean {
  if (mode === 'only') return hasSino;
  if (mode === 'exclude') return !hasSino;
  return true;
}

/** 按中外合作筛选院校专业组; 空 mode → 原样返回同引用. */
export function filterGroupsBySinoForeign<T extends { majors?: Array<{ isSinoForeign?: boolean }> }>(
  groups: T[],
  mode?: SinoForeignMode | null,
): T[] {
  if (mode !== 'only' && mode !== 'exclude') return groups;
  return groups.filter((grp) => matchSinoForeign(groupHasSinoForeign(grp), mode));
}

/** 按中外合作筛选院校(上卷视图): 校内任一组含中外即视为有; 空 mode → 原样返回同引用. */
export function filterUniversitiesBySinoForeign<
  T extends { groups?: Array<{ majors?: Array<{ isSinoForeign?: boolean }> }> },
>(universities: T[], mode?: SinoForeignMode | null): T[] {
  if (mode !== 'only' && mode !== 'exclude') return universities;
  return universities.filter((u) =>
    matchSinoForeign((u.groups ?? []).some((grp) => groupHasSinoForeign(grp)), mode),
  );
}
