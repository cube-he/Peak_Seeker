export type CanonicalSubject = '物理' | '历史' | '全部' | '物理化学';

const MAP: Record<string, CanonicalSubject> = {
  '物理': '物理',
  '物理类': '物理',
  '理科': '物理',
  '历史': '历史',
  '历史类': '历史',
  '文科': '历史',
  '全部': '全部',
  // 物理类要求化学的子池 (新高考 3+1+2 选化学的考生)
  '物理化学': '物理化学',
  '物化': '物理化学',
  '物化组合': '物理化学',
};

/**
 * Map raw subject/examType strings to canonical enum.
 * Returns null for unknown / unsupported values (e.g. "综合改革").
 *
 * Canonical values:
 * - 物理 / 历史: top-level subject (新高考首选 OR 旧高考 理科/文科)
 * - 全部: aggregate of all subjects (used in ProvinceYearStat for total registrants)
 * - 物理化学: subset of 物理 — students who chose chemistry as one of their two re-elected subjects.
 *           used for predicting majors with subjectRequirements containing "化学".
 */
export function normalizeSubject(raw: string | null | undefined): CanonicalSubject | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return MAP[trimmed] ?? null;
}

/**
 * Decide which canonical pool a (subject, subjectRequirements) pair maps to.
 * Use this in ETL pool-selection (subjectWeight calculation), NOT for general
 * subject-string normalization.
 *
 * Rule (Sichuan, 2025 onward):
 * - subject=物理 AND subjectRequirements contains "化学" → '物理化学' (subset pool ~307k of 327k)
 * - subject=物理 otherwise → '物理' (full pool ~327k)
 * - subject=历史 → '历史' (历史类含化学 < 1%, no subset)
 *
 * For 旧高考 years (2017-2024), subjectRequirements may be empty/混合/无 — those fall through
 * to the parent pool (物理 or 历史), which is correct since 旧高考 has no subject-combo concept.
 */
export function decidePoolKey(
  subject: string | null | undefined,
  subjectRequirements: string | null | undefined,
): CanonicalSubject | null {
  const subj = normalizeSubject(subject);
  if (subj === '物理' && /化学/.test(subjectRequirements ?? '')) {
    return '物理化学';
  }
  return subj;
}
