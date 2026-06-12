/**
 * 已确认政策加分的可用分值。
 * 四川口径: 多项加分不叠加, 取最高一项; 仅 bonusPolicyStatus = HAS_BONUS 且
 * 老师已在档案里选了具体细则 (bonusItems) 时才生效。
 * 注意: 地方性加分(三州十七县两区)严格说仅适用省属院校投档, 这里统一按加分口径
 * 参与梯度/风险测算, 由前端口径行提示差异 —— 比完全不吃加分(原状)更接近真实投档。
 */
export function confirmedBonusPoints(student: {
  bonusPolicyStatus?: string | null;
  bonusItems?: unknown;
} | null | undefined): number {
  if (!student || student.bonusPolicyStatus !== 'HAS_BONUS') return 0;
  const items = Array.isArray(student.bonusItems) ? student.bonusItems : [];
  let max = 0;
  for (const item of items) {
    const v = item && typeof item === 'object' ? Number((item as any).value) : NaN;
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}
