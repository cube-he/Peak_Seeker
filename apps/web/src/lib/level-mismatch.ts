export type ItemLevel = '本科' | '专科' | '兼有';
export type EligibleLevel = '本科' | '专科' | null;
// 与后端 apps/server/src/modules/enrollment-level/enrollment-levels.ts 的 OptionLevels 同形;
// 无共享 types 包, 改层次取值 (如新增"中职") 需两端同步。
export type OptionLevels = { phy: ItemLevel | null; his: ItemLevel | null };

/** 科类枚举 → 层次 lane。仅物理/历史可标。 */
export function laneOf(examType: string | null | undefined): 'phy' | 'his' | null {
  if (examType === 'PHYSICS') return 'phy';
  if (examType === 'HISTORY') return 'his';
  return null;
}

/** 条目层次与学生可上层次对不上时，返回要显示在括号里的层次；否则 null。 */
export function levelMismatchTag(
  itemLevel: ItemLevel | null | undefined,
  eligible: EligibleLevel,
): '本科' | '专科' | null {
  if (!eligible || !itemLevel || itemLevel === '兼有') return null;
  return itemLevel !== eligible ? itemLevel : null;
}

/** 从 option.levels + 科类 + eligibleLevel 解析出某名字的标记（给 picker/编辑器用）。 */
export function tagForLevels(
  levels: OptionLevels | null | undefined,
  examType: string | null | undefined,
  eligible: EligibleLevel,
): '本科' | '专科' | null {
  const lane = laneOf(examType);
  if (!lane || !levels) return null;
  return levelMismatchTag(levels[lane], eligible);
}
