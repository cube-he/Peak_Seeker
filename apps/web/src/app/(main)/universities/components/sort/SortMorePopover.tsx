'use client';
import { useMemo, useState } from 'react';
import { Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import SortButton from './SortButton';
import { GROUP_LABELS, type SortDirection, type SortOption } from './sort-options';

interface Props {
  options: SortOption[];
  current: { key: string; direction: SortDirection } | null;
  disabled: boolean;
  onChange: (key: string | null, direction: SortDirection | null) => void;
}

export default function SortMorePopover({ options, current, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups = new Map<string, SortOption[]>();
    for (const o of options) {
      const arr = groups.get(o.group) ?? [];
      arr.push(o);
      groups.set(o.group, arr);
    }
    return Array.from(groups.entries());
  }, [options]);

  const handleSortChange = (key: string | null, direction: SortDirection | null) => {
    onChange(key, direction);
    setOpen(false);
  };

  const content = (
    <div className="space-y-3 min-w-[420px] max-w-[560px]">
      {grouped.map(([group, opts]) => (
        <div key={group}>
          <div className="text-[10px] uppercase tracking-[1.4px] text-text-muted mb-1.5">
            {GROUP_LABELS[group as keyof typeof GROUP_LABELS]}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {opts.map((o) => (
              <SortButton
                key={o.key}
                option={o}
                current={current}
                disabled={false}
                onChange={handleSortChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomLeft">
      <button
        type="button"
        disabled={disabled}
        className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
          disabled ? 'cursor-not-allowed bg-bg text-text-faint' : 'bg-bg text-text-tertiary hover:text-primary'
        }`}
      >
        更多排序 ({options.length}) <DownOutlined className="ml-1 text-[10px]" />
      </button>
    </Popover>
  );
}
