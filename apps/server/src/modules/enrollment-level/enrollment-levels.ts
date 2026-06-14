export type MajorLevel = '本科' | '专科' | '兼有';
export type OptionLevels = { phy: MajorLevel | null; his: MajorLevel | null };

/** 由本科批次计数 bk、专科批次计数 zk 归约出层次。 */
export function classifyLevel(bk: number, zk: number): MajorLevel | null {
  if (bk > 0 && zk > 0) return '兼有';
  if (bk > 0) return '本科';
  if (zk > 0) return '专科';
  return null;
}
