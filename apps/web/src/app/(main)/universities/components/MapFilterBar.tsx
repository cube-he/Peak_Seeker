'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { universityService } from '@/services/university';
import { useUniversityFilters } from '@/stores/universityFilterStore';

/**
 * 地图视图的 filter 条:复用同一个 useUniversityFilters store,
 * 跟「全部院校」tab 双向同步——任意一处改了,另一处 map 数据自动重 fetch。
 *
 * 字段:办学性质 / 标签(985/211/双一流) / 办学层次 / 学校类型
 * (跟 list tab 的 TopFilterBar 列出的 7 行相比刻意精简,只留地图导航有意义的几个)
 */

type TagKey = 'is985' | 'is211' | 'isDoubleFirstClass';
const TAG_OPTIONS: Array<{ value: TagKey; label: string }> = [
  { value: 'is985', label: '985' },
  { value: 'is211', label: '211' },
  { value: 'isDoubleFirstClass', label: '双一流' },
];

function ChipRow<V extends string>({
  label,
  items,
  value,
  onChange,
  maxVisible,
}: {
  label: string;
  items: Array<{ value: V; label: string }>;
  value: V | undefined;
  onChange: (v: V | undefined) => void;
  // 超过这个数量时自动折叠,显示前 N 个 + "更多"切换。undefined 表示全显示。
  // 用于「学校类型」这种 ~30 项的长列表。
  maxVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const needsCollapse = maxVisible != null && items.length > maxVisible;
  // 如果当前选中项落在被折叠的尾部 items 里,强制展开,避免选中后却看不到当前值
  const activeHiddenWhenCollapsed =
    needsCollapse &&
    value != null &&
    items.findIndex((i) => i.value === value) >= (maxVisible ?? 0);
  const showAll = !needsCollapse || expanded || activeHiddenWhenCollapsed;
  const visibleItems = showAll ? items : items.slice(0, maxVisible);

  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-border-subtle last:border-b-0">
      <span className="shrink-0 text-[13px] text-text-muted pt-0.5 w-20">{label}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`text-[13px] border-0 bg-transparent px-1 py-0.5 cursor-pointer transition-colors ${
            value == null ? 'text-primary font-medium' : 'text-text hover:text-primary'
          }`}
        >
          全部
        </button>
        {visibleItems.map((item) => {
          const active = value === item.value;
          return (
            <button
              key={String(item.value)}
              type="button"
              onClick={() => onChange(active ? undefined : item.value)}
              className={`text-[13px] border-0 bg-transparent px-1 py-0.5 cursor-pointer transition-colors ${
                active ? 'text-primary font-medium' : 'text-text hover:text-primary'
              }`}
            >
              {item.label}
            </button>
          );
        })}
        {needsCollapse && !activeHiddenWhenCollapsed && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[13px] border-0 bg-transparent px-1 py-0.5 cursor-pointer text-text-muted hover:text-primary transition-colors"
          >
            {expanded ? '收起' : `更多 (${items.length - (maxVisible ?? 0)}+)`}
          </button>
        )}
      </div>
    </div>
  );
}

export function MapFilterBar() {
  const filters = useUniversityFilters((s) => s.filters);
  const setFilters = useUniversityFilters((s) => s.setFilters);

  const { data: options } = useQuery({
    queryKey: ['university-filters'],
    queryFn: () => universityService.getFilters(),
    staleTime: Infinity,
  });

  // 985/211/双一流 三互斥选项,合并成单选 ChipRow
  const tagValue: TagKey | undefined = filters.is985
    ? 'is985'
    : filters.is211
      ? 'is211'
      : filters.isDoubleFirstClass
        ? 'isDoubleFirstClass'
        : undefined;
  const setTag = (v: TagKey | undefined) => {
    setFilters({
      ...filters,
      is985: v === 'is985' || undefined,
      is211: v === 'is211' || undefined,
      isDoubleFirstClass: v === 'isDoubleFirstClass' || undefined,
      page: 1,
    });
  };

  const toItems = <T extends string>(arr: Array<{ value: T; count: number }>) =>
    arr.map((a) => ({ value: a.value, label: String(a.value) }));

  return (
    <div className="mb-3 rounded-lg bg-surface px-4 py-2 shadow-card">
      <ChipRow
        label="办学性质"
        items={toItems(options?.natures ?? [])}
        value={filters.nature}
        onChange={(v) => setFilters({ ...filters, nature: v, page: 1 })}
      />
      <ChipRow
        label="标签"
        items={TAG_OPTIONS}
        value={tagValue}
        onChange={setTag}
      />
      <ChipRow
        label="办学层次"
        items={toItems(options?.levels ?? [])}
        value={filters.level}
        onChange={(v) => setFilters({ ...filters, level: v, page: 1 })}
      />
      <ChipRow
        label="学校类型"
        items={toItems(options?.types ?? [])}
        value={filters.type}
        onChange={(v) => setFilters({ ...filters, type: v, page: 1 })}
        maxVisible={12}
      />
    </div>
  );
}
