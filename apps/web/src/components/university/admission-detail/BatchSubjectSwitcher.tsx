'use client';
import { BATCH_CATEGORIES } from '@/utils/batch-categorize';
import type { BatchSubjectSwitcherProps, Subject } from './types';

const SUBJECTS: Subject[] = ['物理类', '历史类'];

export default function BatchSubjectSwitcher({
  subject,
  batchCategory,
  onSubjectChange,
  onBatchChange,
}: BatchSubjectSwitcherProps) {
  const btnClass = (active: boolean) =>
    `px-2.5 py-0.5 rounded text-[10px] font-semibold border ${
      active
        ? 'bg-amber-700 text-white border-amber-700'
        : 'bg-white text-text-tertiary border-amber-300'
    }`;

  return (
    <div className="flex gap-1 flex-wrap items-center">
      {SUBJECTS.map(s => (
        <button
          key={s}
          type="button"
          aria-pressed={s === subject}
          onClick={() => onSubjectChange(s)}
          className={btnClass(s === subject)}
        >
          {s}
        </button>
      ))}
      <span className="text-border mx-1">|</span>
      {BATCH_CATEGORIES.map(b => (
        <button
          key={b}
          type="button"
          aria-pressed={b === batchCategory}
          onClick={() => onBatchChange(b)}
          className={btnClass(b === batchCategory)}
        >
          {b}
        </button>
      ))}
    </div>
  );
}
