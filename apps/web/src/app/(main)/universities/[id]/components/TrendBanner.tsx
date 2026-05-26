'use client';

import { useMemo } from 'react';
import type { ExamType } from '@/services/score-segment';

/**
 * 详情页"近 N 年录取走势"主角卡。
 * 数据来源:从 admissionRecords[] groupBy year 抽出每年该 subject 的最低分 + 位次。
 * 设计稿 SVG 横向折线:
 *   - 网格 4 条横线
 *   - 区域填色 area + 主线 line
 *   - 每个数据点 dot + 头顶 score / 位次 / 年份
 *   - 用户位次水平虚线
 *   - 顶部 RHS 3 个统计:2024 最低分 / vs 上年 / 位次变化
 */

interface YearPoint {
  year: number;
  score: number;
  rank: number;
}

interface AdmissionRecordLike {
  year?: number | null;
  subject?: string | null;
  minScore?: number | null;
  minRank?: number | null;
  majorMinScore?: number | null;
  majorMinRank?: number | null;
  examType?: string | null;
}

function deriveYearly(records: AdmissionRecordLike[], subject: ExamType): YearPoint[] {
  if (!records?.length) return [];
  // 优先选 examType 匹配当前科类的;其次选 subject 字段匹配;最后兜底用全部
  const matched = records.filter((r) => {
    const t = r.examType ?? r.subject ?? '';
    return t.includes(subject);
  });
  const pool = matched.length > 0 ? matched : records;
  // groupBy year,每年取 minScore / minRank 最低值(同年多条 → 选录取门槛最低那条)
  const m = new Map<number, YearPoint>();
  for (const r of pool) {
    if (!r.year) continue;
    const score = r.minScore ?? r.majorMinScore ?? null;
    const rank = r.minRank ?? r.majorMinRank ?? null;
    if (score == null || rank == null) continue;
    const cur = m.get(r.year);
    if (!cur || score < cur.score) m.set(r.year, { year: r.year, score, rank });
  }
  return Array.from(m.values()).sort((a, b) => a.year - b.year);
}

interface TrendBannerProps {
  admissions: AdmissionRecordLike[];
  studentRank: number | null;
  subject: ExamType;
}

export function TrendBanner({ admissions, studentRank, subject }: TrendBannerProps) {
  const years = useMemo(() => deriveYearly(admissions, subject), [admissions, subject]);
  if (years.length === 0) return null;

  const w = 800;
  const h = 200;
  const padL = 60;
  const padR = 60;
  const padT = 32;
  const padB = 36;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const ranks = years.map((y) => y.rank).concat(studentRank != null ? [studentRank] : []);
  const minR = Math.min(...ranks);
  const maxR = Math.max(...ranks);
  const yPad = (maxR - minR) * 0.15 || 500;
  const yMin = Math.max(0, minR - yPad);
  const yMax = maxR + yPad;
  const ySpan = yMax - yMin || 1;

  const yToPx = (rank: number) => padT + ((rank - yMin) / ySpan) * innerH;
  const xToPx = (i: number) =>
    padL + (years.length === 1 ? innerW / 2 : (i / (years.length - 1)) * innerW);

  const pts = years.map((y, i) => ({ x: xToPx(i), y: yToPx(y.rank), ...y }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const fillPath = `${linePath} L ${pts[pts.length - 1].x},${padT + innerH} L ${pts[0].x},${padT + innerH} Z`;

  const youY = studentRank != null ? yToPx(studentRank) : null;
  const last = years[years.length - 1];
  const prev = years.length >= 2 ? years[years.length - 2] : null;
  const scoreDelta = prev ? last.score - prev.score : 0;
  const rankDelta = prev ? last.rank - prev.rank : 0;

  return (
    <section className="trend-banner">
      <div className="trend-banner-head">
        <div className="lhs">
          <h3>近 {years.length} 年录取走势 · {subject}类</h3>
          <div className="sub">基于四川省考试院公开数据 · 含同等位次估算</div>
        </div>
        <div className="rhs">
          <div className="stat">
            <div className="k">{last.year} 最低分</div>
            <div className="v gold">{last.score}</div>
          </div>
          {prev && (
            <>
              <div className="stat">
                <div className="k">vs 上年</div>
                <div
                  className="v"
                  style={{ color: scoreDelta > 0 ? 'var(--rush)' : scoreDelta < 0 ? 'var(--safe)' : 'var(--text-tertiary)' }}
                >
                  {scoreDelta > 0 ? '↑' : scoreDelta < 0 ? '↓' : '—'} {Math.abs(scoreDelta)} 分
                </div>
              </div>
              <div className="stat">
                <div className="k">位次变化</div>
                <div className="v dim">
                  {rankDelta < 0 ? '↑' : rankDelta > 0 ? '↓' : '—'} {Math.abs(rankDelta).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="trend-chart-wrap">
        <svg className="trend-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <g className="grid">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <line key={t} x1={padL} y1={padT + t * innerH} x2={w - padR} y2={padT + t * innerH} />
            ))}
          </g>

          {youY != null && studentRank != null && (
            <g>
              <line className="you-line" x1={padL} y1={youY} x2={w - padR} y2={youY} />
              <text className="you-label" x={w - padR + 6} y={youY + 4}>
                你 · {studentRank.toLocaleString()}
              </text>
            </g>
          )}

          <path className="area" d={fillPath} />
          <path className="line" d={linePath} />

          {pts.map((p, i) => {
            const isCur = i === pts.length - 1;
            return (
              <g key={i}>
                <text className="score-label" x={p.x} y={p.y - 14}>
                  {p.score}
                </text>
                <text className="rank-label" x={p.x} y={p.y - 4}>
                  位次 {p.rank.toLocaleString()}
                </text>
                <circle className={`dot ${isCur ? 'cur' : ''}`} cx={p.x} cy={p.y} r={isCur ? 5 : 4} />
                <text className="year-label" x={p.x} y={padT + innerH + 18}>
                  {p.year}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="legend">
        <span className="item">
          <span className="sw dot cur" /> {last.year} 最新
        </span>
        <span className="item">
          <span className="sw dot" /> 历年最低分
        </span>
        {studentRank != null && (
          <span className="item">
            <span className="sw you" /> 你的位次({studentRank.toLocaleString()})
          </span>
        )}
      </div>
    </section>
  );
}
