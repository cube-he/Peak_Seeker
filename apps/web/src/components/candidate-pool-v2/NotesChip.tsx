'use client';

import { Tooltip } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import styles from './styles.module.css';
import type { NoteTone, NoteType } from './types';

/**
 * 自动识别备注类型并分配色调（不暴露给消费方，但导出供测试 / 共享逻辑使用）
 */
export function classifyNotes(notes: string): { type: NoteType; tone: NoteTone } {
  if (/色盲|色弱|色觉/.test(notes)) return { type: 'health', tone: 'danger' };
  if (/政审/.test(notes)) return { type: 'political', tone: 'danger' };
  if (/身高|视力/.test(notes)) return { type: 'physical', tone: 'warn' };
  if (/单科|英语\s*≥|数学\s*≥|分数\s*≥/.test(notes)) return { type: 'subject', tone: 'warn' };
  if (/男生|女生|比例|招收/.test(notes)) return { type: 'gender', tone: 'warn' };
  if (/学费/.test(notes)) return { type: 'tuition', tone: 'info' };
  if (/新增|首届/.test(notes)) return { type: 'new', tone: 'info' };
  return { type: 'other', tone: 'info' };
}

interface Props {
  notes?: string | null;
}

/**
 * NotesChip —— 招生备注小 chip
 * - 摘要：首句 ≤ 14 字（多则 ellipsis）
 * - 颜色：按 classifyNotes 自动分 3 色（红/橙/蓝）
 * - Hover：完整明细 Tooltip（按 "；" 分行）
 */
export function NotesChip({ notes }: Props) {
  if (!notes) return null;

  const firstClause = notes.split(/[；;]/)[0].trim();
  const truncated = firstClause.length > 14 ? firstClause.slice(0, 13) + '…' : firstClause;
  const { tone } = classifyNotes(notes);
  const segments = notes.split(/[；;]/);
  const hasMore = segments.length > 1;

  const toneClass =
    tone === 'danger' ? styles.notesChipDanger :
    tone === 'warn' ? styles.notesChipWarn :
    styles.notesChipInfo;

  const tooltipContent = (
    <div className={styles.notesTooltip}>
      <div className={styles.notesTooltipTitle}>
        <WarningOutlined /> 招生备注
      </div>
      {segments.map((line, i) => (
        <div key={i} className={styles.notesTooltipLine}>· {line.trim()}</div>
      ))}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="top" styles={{ root: { maxWidth: 360 } }}>
      <span className={`${styles.notesChip} ${toneClass}`}>
        <WarningOutlined className={styles.notesChipIcon} />
        <span className={styles.notesChipText}>{truncated}</span>
        {hasMore ? <span className={styles.notesChipMore}>+{segments.length - 1}</span> : null}
      </span>
    </Tooltip>
  );
}
