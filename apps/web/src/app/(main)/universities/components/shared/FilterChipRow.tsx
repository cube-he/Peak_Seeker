/**
 * 文字 link 样式的 chip 筛选行(.filter-row)。
 * 列首 label + 全部 + 每个选项 + 可选「更多」折叠。
 */
'use client';

import { useState } from 'react';

interface Option<V extends string> {
  value: V;
  label: string;
}

interface FilterChipRowProps<V extends string> {
  label: string;
  options: Array<Option<V>>;
  value: V | undefined;
  onChange: (v: V | undefined) => void;
  disabled?: boolean;
  hint?: string;
  /** 超过这个数量时,默认只显示前 N 个 + 一个「更多 +M」按钮 */
  maxVisible?: number;
}

export function FilterChipRow<V extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  hint,
  maxVisible,
}: FilterChipRowProps<V>) {
  const [expanded, setExpanded] = useState(false);
  if (!options || options.length === 0) return null;
  const needsCollapse = maxVisible != null && options.length > maxVisible;
  // 已选项被折叠时强制展开,避免看不到当前值
  const activeHidden =
    needsCollapse &&
    value != null &&
    options.findIndex((o) => o.value === value) >= (maxVisible ?? 0);
  const showAll = !needsCollapse || expanded || activeHidden;
  const visible = showAll ? options : options.slice(0, maxVisible);

  return (
    <div className="filter-row">
      <span className="lbl">{label}</span>
      <div className="opts">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className={value == null ? 'is-active' : ''}
        >
          全部
        </button>
        {visible.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === opt.value ? undefined : opt.value)}
            className={value === opt.value ? 'is-active' : ''}
          >
            {opt.label}
          </button>
        ))}
        {needsCollapse && !activeHidden && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{ color: 'var(--text-muted)' }}
          >
            {expanded ? '收起' : `更多 +${options.length - (maxVisible ?? 0)}`}
          </button>
        )}
        {disabled && hint && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>{hint}</span>
        )}
      </div>
    </div>
  );
}
