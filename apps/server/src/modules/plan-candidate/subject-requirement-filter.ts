// 再选科目要求过滤: 学生 reChoices 是否满足专业的"再选科目要求"(中文直接比对).
// 真实取值: 不限 / 单科(化学/政治/地理/生物) / X和Y(和=AND); "或"为防御性支持.

/** 学生 reChoices 是否满足该专业的再选科目要求.
 *  不限/空 → true; reChoices 空 → true(不过滤, 交生成前置校验催补);
 *  含 和/+ → 全部都要(AND); 含 或// → 任一即可(OR); 否则单科必含. */
export function studentMeetsSubjectRequirement(
  requirement: string | null | undefined,
  reChoices: string[],
): boolean {
  const req = String(requirement ?? '').trim();
  if (!req || req === '不限') return true;
  if (reChoices.length === 0) return true;
  const set = new Set(reChoices);
  if (req.includes('和') || req.includes('+')) {
    return req.split(/[和+]/).map((s) => s.trim()).filter(Boolean).every((r) => set.has(r));
  }
  if (req.includes('或') || req.includes('/')) {
    return req.split(/[或/]/).map((s) => s.trim()).filter(Boolean).some((o) => set.has(o));
  }
  return set.has(req);
}

/** 过滤候选行: 只留学生选科满足"再选科目要求"的.
 *  reChoices 清洗后为空 → 原样返回同引用(不过滤). */
export function filterEpsBySubjectRequirement<T extends { subjectRequirements?: string | null }>(
  eps: T[],
  reChoices: unknown,
): T[] {
  const clean = (Array.isArray(reChoices) ? reChoices : [])
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim());
  if (clean.length === 0) return eps;
  return eps.filter((ep) => studentMeetsSubjectRequirement(ep.subjectRequirements, clean));
}
