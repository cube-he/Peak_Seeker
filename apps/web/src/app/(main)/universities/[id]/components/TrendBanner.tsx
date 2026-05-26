'use client';

import { useMemo, useState } from 'react';
import type { ExamType } from '@/services/score-segment';

/**
 * 详情页"近 N 年录取走势"主角卡。
 *
 * 数据:从 admissionRecords[] 按 examType groupBy year,取每年该科类最低门槛(取
 *   多条记录里的最低 minScore / minRank)。
 *
 * 视觉重做(2025-05-26 反馈):
 *   - SVG 去掉 preserveAspectRatio="none" 改默认 meet,横向拉伸时数字不变形
 *   - score-label / rank-label 间距拉开(避免几个数字糊在一起)
 *   - 顶部 trend-banner-head 加物理/历史 chip 切换,数据按当前科类筛
 *   - 没数据时显示"暂无 {subject}类数据"占位,而不是空白
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
  // 按科类筛(examType / subject 字段命中 '物理' or '历史')
  const matched = records.filter((r) => {
    const t = (r.examType ?? r.subject ?? '') as string;
    return t.includes(subject);
  });
  if (matched.length === 0) return [];
  // 同年多条 → 取最低 score 那条(代表该科类该年的最低门槛)
  const m = new Map<number, YearPoint>();
  for (const r of matched) {
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
  /** 初始科类(跟全局 useStudentRank.examType 同步进来),组件内部可独立切换 */
  defaultSubject: ExamType;
}

export function TrendBanner({ admissions, studentRank, defaultSubject }: TrendBannerProps) {
  const [subject, setSubject] = useState<ExamType>(defaultSubject);
  const years = useMemo(() => deriveYearly(admissions, subject), [admissions, subject]);

  // 统计两个科类各有多少年数据,空就 disable 那个 chip
  const physicsYears = useMemo(() => deriveYearly(admissions, '物理'), [admissions]);
  const historyYears = useMemo(() => deriveYearly(admissions, '历史'), [admissions]);

  // ── 图表常量 ────────────────────────────────────────
  const w = 800;
  const h = 220;
  const padL = 64;
  const padR = 64;
  const padT = 48; // 留更多顶部空间放 score + rank label
  const padB = 32;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  // 没数据短路渲染
  if (years.length === 0) {
    return (
      <section className="trend-banner">
        <SubjectSwitch
          subject={subject}
          setSubject={setSubject}
          physicsAvailable={physicsYears.length > 0}
          historyAvailable={historyYears.length > 0}
        />
        <div
          style={{
            padding: '60px 0',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          暂无{subject}类历年录取数据
        </div>
      </section>
    );
  }

  const ranks = years.map((y) => y.rank).concat(studentRank != null ? [studentRank] : []);
  const minR = Math.min(...ranks);
  const maxR = Math.max(...ranks);
  const yPad = (maxR - minR) * 0.2 || 500;
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
          <h3>近 {years.length} 年录取走势</h3>
          <div className="sub">基于四川省考试院公开数据 · 含同等位次估算</div>
        </div>
        <div className="rhs">
          <SubjectSwitch
            subject={subject}
            setSubject={setSubject}
            physicsAvailable={physicsYears.length > 0}
            historyAvailable={historyYears.length > 0}
          />
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
                  style={{
                    color:
                      scoreDelta > 0
                        ? 'var(--rush)'
                        : scoreDelta < 0
                          ? 'var(--safe)'
                          : 'var(--text-tertiary)',
                  }}
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

      {/* viewBox + 默认 preserveAspectRatio (meet) → 文字不再被横向拉伸 */}
      <div className="trend-chart-wrap">
        <svg
          className="trend-chart"
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height={h}
          style={{ display: 'block' }}
        >
          {/* 横向网格 */}
          <g className="grid">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <line
                key={t}
                x1={padL}
                y1={padT + t * innerH}
                x2={w - padR}
                y2={padT + t * innerH}
              />
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
                {/* score 字号 14,放 dot 上方 28px 处 */}
                <text className="score-label" x={p.x} y={p.y - 26}>
                  {p.score}
                </text>
                {/* rank 字号 10,放 dot 上方 12px(score 跟它中间留 4px) */}
                <text className="rank-label" x={p.x} y={p.y - 11}>
                  #{p.rank.toLocaleString()}
                </text>
                <circle className={`dot ${isCur ? 'cur' : ''}`} cx={p.x} cy={p.y} r={isCur ? 5.5 : 4} />
                {/* year 字号 11,放底部 */}
                <text className="year-label" x={p.x} y={padT + innerH + 20}>
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

// 物理/历史 chip 切换(详情页 trend-banner 专用,比 SubjectToggle 紧凑)
function SubjectSwitch({
  subject,
  setSubject,
  physicsAvailable,
  historyAvailable,
}: {
  subject: ExamType;
  setSubject: (v: ExamType) => void;
  physicsAvailable: boolean;
  historyAvailable: boolean;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 3,
        background: 'var(--surface-dim)',
        borderRadius: 999,
        marginRight: 4,
      }}
    >
      {(
        [
          { v: '物理', avail: physicsAvailable },
          { v: '历史', avail: historyAvailable },
        ] as const
      ).map(({ v, avail }) => {
        const active = subject === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => setSubject(v as ExamType)}
            disabled={!avail}
            title={!avail ? `暂无${v}类数据` : undefined}
            style={{
              border: 0,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              padding: '4px 12px',
              borderRadius: 999,
              cursor: avail ? 'pointer' : 'not-allowed',
              opacity: avail ? 1 : 0.4,
              boxShadow: active ? '0 1px 3px rgba(0,0,0,.06)' : undefined,
              transition: 'all var(--dur) var(--ease)',
            }}
          >
            {v}类
          </button>
        );
      })}
    </div>
  );
}
