/** 学生「能上的层次」：过本科线=本科，没过=专科，缺分/缺线=null。 */
export function eligibleLevelFromScore(
  totalScore: number | null | undefined,
  undergradLine: number | null | undefined,
): '本科' | '专科' | null {
  if (totalScore == null || undergradLine == null) return null;
  return totalScore >= undergradLine ? '本科' : '专科';
}
