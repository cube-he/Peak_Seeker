// 中外合作办学筛选 (服务端). 判定口径: 组内任一专业 isSinoForeign=true 即"含中外合作".
export type SinoForeignMode = 'only' | 'exclude';

/**
 * 直接从专业备注(plan_notes)判定该专业是否中外合作办学。
 * 口径与 backfill-sino-foreign.sql 完全一致(已对 2025/2026 全量核对, 命中数 992 一致):
 *   含"中外合作", 但排除两类显式否定:
 *     · (不含…中外合作办学)        —— 普通专业, 备注声明"不含中外合作"
 *     · (中外合作办学，/,专业除外)  —— 整批除该专业外是中外
 * 改为运行时读备注后, 不再依赖 is_sino_foreign 物化列 —— 重导数据后无需再跑回填脚本, 不会失效。
 */
export function isSinoForeignFromNotes(planNotes?: string | null): boolean {
  const n = planNotes ?? '';
  if (!n.includes('中外合作')) return false;
  if (/不含[\s\S]*中外合作/.test(n)) return false;
  if (n.includes('中外合作办学，专业除外') || n.includes('中外合作办学,专业除外')) return false;
  return true;
}

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
