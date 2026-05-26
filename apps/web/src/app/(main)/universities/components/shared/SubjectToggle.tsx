/**
 * 物理 / 历史 科类切换 chip 行,跟 useStudentRank store 绑定。
 * styles.css 提供 .chip-row / .chip / .chip.is-active 样式。
 */
'use client';

import type { ExamType } from '@/services/score-segment';

interface SubjectToggleProps {
  value: ExamType;
  onChange: (v: ExamType) => void;
  className?: string;
}

export function SubjectToggle({ value, onChange, className }: SubjectToggleProps) {
  return (
    <div className={`chip-row ${className ?? ''}`}>
      <span className="label">科类</span>
      {(['物理', '历史'] as const satisfies ReadonlyArray<ExamType>).map((s) => (
        <button
          key={s}
          type="button"
          className={`chip ${value === s ? 'is-active' : ''}`}
          onClick={() => onChange(s)}
        >
          {s}类
        </button>
      ))}
    </div>
  );
}
