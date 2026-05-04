export type CanonicalSubject = '物理' | '历史' | '全部';

const MAP: Record<string, CanonicalSubject> = {
  '物理': '物理',
  '物理类': '物理',
  '理科': '物理',
  '历史': '历史',
  '历史类': '历史',
  '文科': '历史',
  '全部': '全部',
};

/**
 * Map raw subject/examType strings to canonical 3-value enum.
 * Returns null for unknown / unsupported values (e.g. "综合改革").
 */
export function normalizeSubject(raw: string | null | undefined): CanonicalSubject | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return MAP[trimmed] ?? null;
}
