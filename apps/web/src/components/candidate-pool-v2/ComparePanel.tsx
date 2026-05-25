'use client';

import React from 'react';
import styles from './styles.module.css';

// 兼容 generate page CandidateGroup 的最小数据形状
export interface ComparableGroup {
  groupKey: string;
  universityName: string;
  groupName?: string | null;
  groupCode?: string | null;
  university?: {
    is985?: boolean;
    is211?: boolean;
    isDoubleFirstClass?: boolean;
    softRanking?: number | null;
    runningNature?: string | null;
    province?: string | null;
    city?: string | null;
    postgradRate?: string | null;
    employmentRate?: string | null;
    avgSalary?: string | null;
  };
  matchScore?: number | null;
  matchReason?: string | null;
  groupMinScore?: number | null;
  groupMinRank?: number | null;
  currentPlanCount?: number | null;
  planCountChange?: number | null;
  predictedMinRank?: {
    point?: number | null;
    confidence?: string | null;
  } | null;
  prefMatch?: {
    province?: 'match' | 'mismatch';
    tuition?: 'within' | 'over';
    career?: 'strong' | 'weak';
    subjects?: 'match';
  };
  history3y?: Array<{ year: number; score: number; rank: number }>;
}

interface Props {
  groups: ComparableGroup[];
}

/**
 * ComparePanel —— 抽屉内并排对比表（最多 4 张候选）
 * 11 行维度 × N 列学校
 */
export function ComparePanel({ groups }: Props) {
  if (groups.length === 0) {
    return <div className={styles.compareEmpty}>未选择任何候选</div>;
  }

  const rows: Array<{ key: string; label: string; render: (g: ComparableGroup) => React.ReactNode }> = [
    {
      key: 'tiers',
      label: '院校档次',
      render: (g) => (
        <div className={styles.compareTierCell}>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {g.university?.is985 && <b style={{ background: '#1e3a5f', color: '#fff', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>985</b>}
            {g.university?.is211 && <b style={{ background: '#2c5282', color: '#fff', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>211</b>}
            {g.university?.isDoubleFirstClass && <b style={{ background: 'linear-gradient(135deg,#b8860b,#d4a017)', color: '#fff', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>双一流</b>}
            {!g.university?.is985 && !g.university?.is211 && !g.university?.isDoubleFirstClass && <b style={{ background: '#f0eee6', color: '#4d4c48', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>普本</b>}
          </span>
          <span className={styles.compareSubtext}>软科 #{g.university?.softRanking ?? '—'} · {g.university?.runningNature ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'city',
      label: '地理',
      render: (g) => <span>{g.university?.province ?? '—'}{g.university?.city ? ' · ' + g.university.city : ''}</span>,
    },
    {
      key: 'match',
      label: '匹配度',
      render: (g) => {
        const ms = g.matchScore;
        if (ms == null || ms <= 0) return <span className={styles.compareSubtext}>—</span>;
        const tone = ms >= 85 ? styles.compareMatchHigh : ms >= 70 ? styles.compareMatchMid : styles.compareMatchLow;
        return (
          <div className={styles.compareMatchCell}>
            <span className={`${styles.compareMatchValue} ${tone}`}>{ms}</span>
            {g.matchReason ? <span className={styles.compareSubtext}>{g.matchReason}</span> : null}
          </div>
        );
      },
    },
    {
      key: 'history',
      label: '近 3 年组最低',
      render: (g) => {
        const hist = g.history3y;
        if (!hist || hist.length === 0) return <span className={styles.compareSubtext}>—</span>;
        const last = hist[hist.length - 1];
        const first = hist[0];
        const delta = last.score - first.score;
        return (
          <div>
            <span className={styles.compareNum}>{last.score}</span>
            <span className={styles.compareSubtext}> 位次 {last.rank.toLocaleString()}</span>
            {hist.length >= 2 ? (
              <div className={styles.compareSubtext}>
                {hist.length} 年趋势 {first.score} → {last.score}（{delta > 0 ? '+' : ''}{delta}）
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'pred',
      label: '2026 预测位次',
      render: (g) => {
        const p = g.predictedMinRank;
        if (!p?.point) return <span className={styles.compareSubtext}>—</span>;
        return (
          <div>
            <span className={styles.compareNum}>~{p.point.toLocaleString()}</span>
            {p.confidence ? <span className={styles.compareSubtext}> · 信心 {p.confidence === 'high' ? '高' : p.confidence === 'medium' ? '中' : '低'}</span> : null}
          </div>
        );
      },
    },
    {
      key: 'plan',
      label: '本组招生',
      render: (g) => (
        <div>
          <span className={styles.compareNum}>{g.currentPlanCount ?? '—'}</span>
          <span className={styles.compareSubtext}> 人</span>
          {g.planCountChange != null && g.planCountChange !== 0 ? (
            <span className={`${styles.compareDelta} ${g.planCountChange > 0 ? 'deltaDown' : 'deltaUp'}`}
              style={{ marginLeft: 4, color: g.planCountChange > 0 ? '#276749' : '#c53030' }}>
              {g.planCountChange > 0 ? '+' : ''}{g.planCountChange}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'postgrad',
      label: '升学走向',
      render: (g) => {
        if (!g.university?.postgradRate && !g.university?.employmentRate) {
          return <span className={styles.compareSubtext}>—</span>;
        }
        return (
          <div>
            {g.university?.postgradRate ? <span className={styles.compareNum}>保研 {g.university.postgradRate}</span> : null}
            {g.university?.employmentRate ? <div className={styles.compareSubtext}>就业 {g.university.employmentRate}</div> : null}
          </div>
        );
      },
    },
    {
      key: 'salary',
      label: '平均薪资',
      render: (g) => g.university?.avgSalary ? <span className={styles.compareNum}>{g.university.avgSalary}</span> : <span className={styles.compareSubtext}>—</span>,
    },
    {
      key: 'prefs',
      label: '学生偏好',
      render: (g) => {
        if (!g.prefMatch) return <span className={styles.compareSubtext}>—</span>;
        const Chip = ({ label, ok }: { label: string; ok: boolean | undefined }) => (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 999,
            fontSize: 11, fontWeight: 600,
            background: ok ? '#e8f5ec' : '#fef2f2',
            color: ok ? '#276749' : '#c53030',
            marginRight: 4, marginBottom: 4,
          }}>
            {ok ? '✓' : '✗'} {label}
          </span>
        );
        return (
          <div className={styles.comparePrefCell}>
            {g.prefMatch.province !== undefined && <Chip label="本省" ok={g.prefMatch.province === 'match'} />}
            {g.prefMatch.tuition !== undefined && <Chip label="学费" ok={g.prefMatch.tuition === 'within'} />}
            {g.prefMatch.career !== undefined && <Chip label="考研" ok={g.prefMatch.career === 'strong'} />}
            {g.prefMatch.subjects !== undefined && <Chip label="选科" ok={g.prefMatch.subjects === 'match'} />}
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.comparePanel}>
      <div
        className={styles.compareGrid}
        style={{ gridTemplateColumns: `120px repeat(${groups.length}, minmax(220px, 1fr))` }}
      >
        <div className={styles.compareCornerCell}></div>
        {groups.map((g) => (
          <div key={g.groupKey} className={styles.compareHeadCell}>
            <div className={styles.compareHeadName}>{g.universityName}</div>
            <div className={styles.compareSubtext}>{g.groupName}{g.groupCode ? `（${g.groupCode}）` : ''}</div>
          </div>
        ))}
        {rows.map((r) => (
          <React.Fragment key={r.key}>
            <div className={styles.compareLabelCell}>{r.label}</div>
            {groups.map((g) => (
              <div key={g.groupKey + r.key} className={styles.compareDataCell}>
                {r.render(g)}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
