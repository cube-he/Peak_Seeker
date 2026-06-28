// 候选卡片「转专业政策」取值口径(用户拍板):
// transfer_difficulty(转专业情况/难度, 本科覆盖高、对老师更实用) 优先,
// 空则回退 charter_transfer_limit(招生章程转专业限制, 专科靠它)。两者皆空 → null(卡片不显示)。
export function resolveTransferPolicy(
  u?: { transferDifficulty?: string | null; charterTransferLimit?: string | null } | null,
): string | null {
  const td = u?.transferDifficulty?.trim();
  if (td) return td;
  const cl = u?.charterTransferLimit?.trim();
  if (cl) return cl;
  return null;
}
