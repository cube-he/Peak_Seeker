'use client';

import { Checkbox } from 'antd';
import styles from './styles.module.css';
import { PrefChip } from './PrefChip';
import type { PrefMatch } from './types';

interface Props {
  matchScore: number;
  matchReason?: string | null;
  prefMatch?: PrefMatch;
  /** 可选：候选对比复选框（不传则不显示） */
  compared?: boolean;
  onCompareToggle?: () => void;
}

/**
 * MatchHeader —— 候选卡顶部「匹配度 + 一句话理由 + 偏好对比 chip」横条
 * - matchScore ≥ 85 绿 / 70-84 蓝 / < 70 橙
 * - 复选框是可选的（用于跨卡对比）
 */
export function MatchHeader({ matchScore, matchReason, prefMatch, compared, onCompareToggle }: Props) {
  // 数据缺失/无效（service 在没有 anchor 时回退到 -999）→ 不渲染
  if (matchScore == null || matchScore <= 0) return null;

  const tone = matchScore >= 85 ? 'high' : matchScore >= 70 ? 'mid' : 'low';
  const toneClass =
    tone === 'high' ? styles.matchScoreHigh :
    tone === 'mid' ? styles.matchScoreMid :
    styles.matchScoreLow;

  const showCompare = typeof compared === 'boolean' && onCompareToggle;
  const headerClass = `${styles.matchHeader} ${showCompare ? styles.matchHeaderWithCompare : ''}`;

  return (
    <div className={headerClass}>
      {showCompare ? (
        <label className={styles.prefChip} style={{ borderStyle: 'dashed', cursor: 'pointer' }}>
          <Checkbox checked={compared} onChange={onCompareToggle} />
          <span style={{ marginLeft: 4 }}>对比</span>
        </label>
      ) : null}
      <div className={`${styles.matchScoreBox} ${toneClass}`}>
        <div className={styles.matchScoreLabel}>匹配度</div>
        <div className={styles.matchScoreValue}>{matchScore}</div>
        <div className={styles.matchScoreUnit}>分</div>
      </div>
      <div className={styles.matchReason}>{matchReason || '—'}</div>
      <div className={styles.prefChips}>
        {prefMatch?.province !== undefined && <PrefChip label="本省" value={prefMatch.province} kind="province" />}
        {prefMatch?.tuition !== undefined && <PrefChip label="学费" value={prefMatch.tuition} kind="tuition" />}
        {prefMatch?.career !== undefined && <PrefChip label="考研方向" value={prefMatch.career} kind="career" />}
      </div>
    </div>
  );
}
