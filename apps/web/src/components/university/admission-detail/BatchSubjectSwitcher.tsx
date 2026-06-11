'use client';
import type { BatchSubjectSwitcherProps, Subject } from './types';

const SUBJECTS: Subject[] = ['物理类', '历史类'];

/** 科类切换。批次维度已改为"按批次结构表逐批次展示"(AdmissionDetailTab), 不再用大类按钮过滤。 */
export default function BatchSubjectSwitcher({
  subject,
  onSubjectChange,
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
    </div>
  );
}
