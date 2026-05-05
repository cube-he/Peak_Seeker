/**
 * 计算两年间的趋势信息。
 *  - 'score' 语义：值升为红（对学生不利），值降为绿
 *  - 'rank'  语义：位次本身越小越好；位次"上升"（数值变小）= 红，反之 = 绿
 */
export type TrendSemantic = 'score' | 'rank';
export type TrendColor = 'red' | 'green' | 'flat';

export interface TrendInfo {
  delta: number;
  arrow: '↑' | '↓' | '─';
  color: TrendColor;
  /** 用于直接渲染的文本，如 "↑20" / "↓5" / "─" */
  text: string;
}

export function computeTrend(
  prev: number | undefined,
  curr: number | undefined,
  semantic: TrendSemantic,
): TrendInfo | null {
  if (prev == null || curr == null) return null;
  const delta = curr - prev;
  if (delta === 0) {
    return { delta: 0, arrow: '─', color: 'flat', text: '─' };
  }

  const isRise = delta > 0;
  // score: rise=红； rank: rise(数值变大→位次更差)=绿，fall(数值变小→位次更好)=红
  const color: TrendColor =
    semantic === 'score'
      ? isRise
        ? 'red'
        : 'green'
      : isRise
        ? 'green'
        : 'red';

  // 箭头方向："对学生不利时↑、有利时↓" 的统一感觉。
  // score 语义：rise=↑（分数变高=不利），fall=↓
  // rank  语义：rise(数值变大=位次更差=对学生有利)=↓；fall(数值变小=位次更高=不利)=↑
  const arrow: '↑' | '↓' =
    semantic === 'score' ? (isRise ? '↑' : '↓') : isRise ? '↓' : '↑';

  return {
    delta,
    arrow,
    color,
    text: `${arrow}${Math.abs(delta)}`,
  };
}

/** Tailwind 类映射，组件层用 */
export const trendColorClass: Record<TrendColor, string> = {
  red: 'text-red-500',
  green: 'text-emerald-600',
  flat: 'text-text-faint',
};
