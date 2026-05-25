'use client';

import styles from './styles.module.css';

export type PrefKind = 'province' | 'tuition' | 'career' | 'subjects';

interface Props {
  label: string;
  value: string | undefined;
  kind: PrefKind;
}

/**
 * PrefChip —— 单条偏好对比 chip
 * - good (✓ 绿) : value 为 match/within/strong
 * - bad (✗ 红)  : value 为 mismatch/over/weak
 * - mid (! 橙)  : 其他
 */
export function PrefChip({ label, value, kind }: Props) {
  if (!value) return null;
  const good = value === 'match' || value === 'within' || value === 'strong';
  const bad = value === 'mismatch' || value === 'over' || value === 'weak';
  const cls = good ? styles.prefChipGood : bad ? styles.prefChipBad : styles.prefChipMid;
  const sign = good ? '✓' : bad ? '✗' : '!';
  // 解读文案（hover 显示）
  let tip = '';
  if (kind === 'province') tip = good ? '本省院校（学生倾向）' : bad ? '外省院校（与本省偏好冲突）' : '中性';
  if (kind === 'tuition') tip = good ? '学费在预算范围' : bad ? '部分专业学费超预算' : '中等';
  if (kind === 'career') tip = good ? '强匹配学生职业方向' : bad ? '与学生职业方向偏差' : '部分匹配';
  if (kind === 'subjects') tip = good ? '选科完全匹配' : bad ? '选科要求不匹配' : '部分匹配';

  return (
    <span className={`${styles.prefChip} ${cls}`} title={tip}>
      <span className={styles.prefSign}>{sign}</span>
      {label}
    </span>
  );
}
