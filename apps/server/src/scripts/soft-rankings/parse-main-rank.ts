/**
 * 解析软科主榜 sheet「排名」列的单元格值。
 *
 * 背景:软科「中国大学排名（总榜）」sheet 里
 *   - 综合/理工等校用纯数字排名("1"、"2"、"3"...)
 *   - 财经/医药/中医药/语言/政法/民族/体育 等专门类院校用**类别前缀编号**
 *     ("医1"=北京协和、"财1"=上海财经、"政1"=中国政法、"语1"=北外...)
 *     ——这些前缀编号在 sheet 里只是占位标记,**不参与综合排序**;
 *     专门类院校的真实名次在各自的类别榜里(对应 softCategoryRank)。
 *
 * 因此本函数只接受纯整数,对前缀编号(及任何非纯整数文本)返回 null,
 * 避免把"医1"误读成 softRanking=1,污染主榜排序。
 */
export function parseMainRank(value: unknown): number | null {
  const text = toText(value).trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) return richText.map((i) => i.text ?? '').join('');
    const text = (value as { text?: string }).text;
    if (text != null) return String(text);
    const result = (value as { result?: unknown }).result;
    if (result != null) return toText(result);
  }
  return String(value);
}
