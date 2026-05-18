'use client';

import styles from './styles.module.css';

interface Props {
  universityName: string;
  meta?: string; // 副信息，如 "稳 · 软科 #28 · 成都"
  onRestore: () => void;
}

/**
 * HiddenCard —— 被排除的候选卡塌缩成单行灰带
 */
export function HiddenCard({ universityName, meta, onRestore }: Props) {
  return (
    <div className={styles.hiddenCard}>
      <span className={styles.hiddenCardIcon}>✕</span>
      <div className={styles.hiddenCardInfo}>
        <b>{universityName}</b>
        {meta ? <span className={styles.hiddenCardMeta}>{meta}</span> : null}
      </div>
      <span className={styles.hiddenCardReason}>已排除</span>
      <button type="button" className={styles.hiddenCardBtn} onClick={onRestore}>
        恢复
      </button>
    </div>
  );
}
