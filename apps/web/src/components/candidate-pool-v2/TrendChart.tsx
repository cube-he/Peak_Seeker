'use client';

import type { YearPoint, RankPrediction } from './types';

interface Props {
  points: YearPoint[];
  /** 可选：2026 预测点（含置信区间），不传则不显示预测部分 */
  prediction?: RankPrediction;
  /** SVG 视口宽度（缺省 240） */
  width?: number;
  /** SVG 视口高度（缺省 46） */
  height?: number;
}

/**
 * TrendChart —— 3 年录取趋势 mini 折线图（SVG）
 * - 历史点：实心圆 + 分数标签 + 年份标签
 * - 预测点（可选）：金色菱形 + 虚线连接 + 垂直误差带
 */
export function TrendChart({ points, prediction, width = 240, height = 46 }: Props) {
  if (points.length === 0) return null;

  const W = width;
  const H = height;
  const PAD_X = 12;
  const PAD_Y = 10;

  const allScores = [...points.map((p) => p.score)];
  if (prediction) allScores.push(prediction.score, prediction.scoreLow, prediction.scoreHigh);
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  const span = maxScore - minScore || 1;

  const totalPts = points.length + (prediction ? 1 : 0);
  const stepX = totalPts > 1 ? (W - PAD_X * 2) / (totalPts - 1) : 0;
  const yOf = (s: number) => H - PAD_Y - ((s - minScore) / span) * (H - PAD_Y * 2 - 2);
  const xOf = (i: number) => PAD_X + i * stepX;

  const historicalPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(p.score)}`)
    .join(' ');
  const lastHist = points[points.length - 1];
  const predX = xOf(points.length);
  const predY = prediction ? yOf(prediction.score) : 0;
  const dashedPath = prediction
    ? `M ${xOf(points.length - 1)} ${yOf(lastHist.score)} L ${predX} ${predY}`
    : '';
  const areaPath = `${historicalPath} L ${xOf(points.length - 1)} ${H - PAD_Y} L ${xOf(0)} ${H - PAD_Y} Z`;

  const predBandTop = prediction ? yOf(prediction.scoreHigh) : 0;
  const predBandBottom = prediction ? yOf(prediction.scoreLow) : 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      <defs>
        <linearGradient id="trend-grad-shared" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c5282" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2c5282" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trend-grad-shared)" />
      <path
        d={historicalPath}
        fill="none"
        stroke="#1e3a5f"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {prediction ? (
        <>
          <rect
            x={predX - 5}
            y={predBandTop}
            width="10"
            height={predBandBottom - predBandTop}
            fill="#b8860b"
            opacity="0.18"
            rx="2"
          />
          <path
            d={dashedPath}
            fill="none"
            stroke="#b8860b"
            strokeWidth="1.5"
            strokeDasharray="3 2"
            strokeLinecap="round"
          />
        </>
      ) : null}

      {points.map((p, i) => (
        <g key={p.year}>
          <circle cx={xOf(i)} cy={yOf(p.score)} r="2.8" fill="#fff" stroke="#1e3a5f" strokeWidth="1.6" />
          <text
            x={xOf(i)}
            y={yOf(p.score) - 5}
            textAnchor="middle"
            fontSize="9"
            fill="#1a1a19"
            fontWeight="700"
          >
            {p.score}
          </text>
          <text x={xOf(i)} y={H - 1} textAnchor="middle" fontSize="8" fill="#87867f">
            &apos;{String(p.year).slice(-2)}
          </text>
        </g>
      ))}

      {prediction ? (
        <g>
          <rect
            x={predX - 3}
            y={predY - 3}
            width="6"
            height="6"
            fill="#fff"
            stroke="#b8860b"
            strokeWidth="1.6"
            transform={`rotate(45 ${predX} ${predY})`}
          />
          <text
            x={predX}
            y={predY - 5}
            textAnchor="middle"
            fontSize="9"
            fill="#8a6510"
            fontWeight="700"
          >
            {prediction.score}
          </text>
          <text x={predX} y={H - 1} textAnchor="middle" fontSize="8" fill="#b8860b" fontWeight="600">
            &apos;{String(prediction.year).slice(-2)}预
          </text>
        </g>
      ) : null}
    </svg>
  );
}
