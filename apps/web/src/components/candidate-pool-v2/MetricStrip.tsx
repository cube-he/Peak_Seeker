'use client';

import styles from './styles.module.css';

interface Props {
  planCount?: number | null;
  planDelta?: number | null;
  postgradRate?: string | null;
  furtherStudyRate?: string | null;
  abroadRate?: string | null;
  employmentRate?: string | null;
  tuition?: number | string | null;
  duration?: string | null;
  satisfaction?: number | null;
  satisfactionSample?: number | null;
  avgSalary?: string | null;
}

function formatTuition(t: Props['tuition']): string {
  if (t == null) return '—';
  if (typeof t === 'number') return `${t}/年起`;
  return String(t);
}

function formatSample(n: Props['satisfactionSample']): string {
  if (n == null) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * MetricStrip —— 候选卡定量条（4 列）
 * 本组招生 · 升学走向 · 学费学制 · 口碑薪资
 */
export function MetricStrip(props: Props) {
  const showSatisfaction = props.satisfaction != null;

  return (
    <div className={styles.metricStrip}>
      {/* 1. 本组招生 */}
      <div className={styles.metricTile}>
        <span className={styles.metricLabel}>本组招生</span>
        <span className={styles.metricValue}>
          {props.planCount ?? '—'}
          <small> 人</small>
          {props.planDelta != null && props.planDelta !== 0 ? (
            <span className={`${styles.metricDelta} ${props.planDelta > 0 ? styles.metricDeltaDown : styles.metricDeltaUp}`}>
              {props.planDelta > 0 ? '+' : ''}{props.planDelta}
            </span>
          ) : null}
        </span>
        <span className={styles.metricSub}>
          {props.planDelta == null ? '招生口径'
            : props.planDelta > 0 ? '较去年扩招'
            : props.planDelta < 0 ? '较去年缩招'
            : '与去年持平'}
        </span>
      </div>

      {/* 2. 升学走向 */}
      <div className={styles.metricTile}>
        <span className={styles.metricLabel}>升学走向</span>
        <span className={styles.metricValue}>
          {props.postgradRate ? `保研 ${props.postgradRate}` : props.employmentRate ? `就业 ${props.employmentRate}` : '—'}
        </span>
        <span className={styles.metricSub}>
          {props.furtherStudyRate ? `升学 ${props.furtherStudyRate}` : ''}
          {props.abroadRate ? ` · 出国 ${props.abroadRate}` : ''}
          {props.employmentRate && props.postgradRate ? ` · 就业 ${props.employmentRate}` : ''}
        </span>
      </div>

      {/* 3. 学费 · 学制 */}
      <div className={styles.metricTile}>
        <span className={styles.metricLabel}>学费 · 学制</span>
        <span className={styles.metricValue}>{formatTuition(props.tuition)}</span>
        <span className={styles.metricSub}>学制 {props.duration ?? '4 年'}</span>
      </div>

      {/* 4. 口碑 · 薪资 */}
      <div className={styles.metricTile}>
        <span className={styles.metricLabel}>口碑 · 薪资</span>
        <span className={styles.metricValue}>
          {showSatisfaction ? (
            <>
              <SatisStars value={props.satisfaction!} />
              <span style={{ fontSize: 13, marginLeft: 4 }}>{props.satisfaction!.toFixed(1)}</span>
            </>
          ) : (
            <small style={{ fontSize: 13 }}>—</small>
          )}
        </span>
        <span className={styles.metricSub}>
          {props.avgSalary ? `月薪 ${props.avgSalary}` : ''}
          {props.satisfactionSample ? ` · 样本 ${formatSample(props.satisfactionSample)}` : ''}
          {!props.avgSalary && !props.satisfactionSample ? '暂无样本' : ''}
        </span>
      </div>
    </div>
  );
}

function SatisStars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className={styles.satisStars} aria-label={`${value.toFixed(1)} 分`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={
          i < full ? styles.satisStarFull :
          i === full && half ? styles.satisStarHalf :
          styles.satisStarEmpty
        }>★</span>
      ))}
    </span>
  );
}
