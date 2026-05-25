'use client';
import type { SortDirection, SortOption } from './sort-options';

interface Props {
  option: SortOption;
  current: { key: string; direction: SortDirection } | null;
  disabled: boolean;
  onChange: (key: string | null, direction: SortDirection | null) => void;
}

export default function SortButton({ option, current, disabled, onChange }: Props) {
  const isActive = current?.key === option.key;
  const direction = isActive ? current.direction : null;

  const handleClick = () => {
    if (!isActive) {
      onChange(option.key, option.defaultDir);
      return;
    }
    if (option.lockedAsc || direction === 'desc') {
      // 锁升序 或 已经是 desc：直接取消
      onChange(null, null);
    } else {
      // asc → desc
      onChange(option.key, 'desc');
    }
  };

  const icon = !isActive ? '' : direction === 'asc' ? ' ↑' : ' ↓';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
        isActive
          ? 'bg-surface-high text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
          : disabled
            ? 'cursor-not-allowed bg-bg text-text-faint'
            : 'bg-bg text-text-tertiary hover:text-primary'
      }`}
    >
      {option.label}{icon}
    </button>
  );
}
