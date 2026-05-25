export const BATCH_CATEGORIES = ['本科批', '提前批', '高职专科'] as const;
export type BatchCategory = typeof BATCH_CATEGORIES[number];

/**
 * 把后端细分 batch 字符串归类为 3 大类。
 * - "本科一批 *" → 本科批
 * - "本科提前批 *" → 提前批
 * - "高职 *" → 高职专科
 * - 其他/空 → null
 *
 * 注意：四川已合并本一/本二，所以本 spec 不处理 "本科二批"。
 * 顺序重要：先判断 "本科提前批"，再判断 "本科一批"，避免前缀误匹配。
 */
export function categorizeBatch(batch: string): BatchCategory | null {
  if (!batch) return null;
  if (batch.startsWith('本科提前批')) return '提前批';
  if (batch.startsWith('本科一批')) return '本科批';
  if (batch.startsWith('高职')) return '高职专科';
  return null;
}
