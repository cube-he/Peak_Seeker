'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { universityService, type UniversityQueryParams } from '@/services/university';
import { FilterChipRow } from '../shared/FilterChipRow';
import { BACKGROUND_TAGS } from '../../lib/backgrounds';

/**
 * 全部院校 tab 的可折叠筛选面板。
 * 高频区(始终可见):所在地 / 城市(仅当选省) / 院校特性
 * 折叠区(默认隐藏,点「展开更多筛选」):办学层次 / 性质 / 类型 / 录取概率
 * 已选筛选数 > 3 且面板折叠时,右侧提示「已选 N 项 — 展开查看」
 */

type FeatureValue = 'is985' | 'is211' | 'isDoubleFirstClass';

interface Props {
  filters: UniversityQueryParams;
  setFilters: (next: UniversityQueryParams) => void;
  studentRank: number | null;
}

export function ListFiltersPanel({ filters, setFilters, studentRank }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { data: options } = useQuery({
    queryKey: ['university-filters'],
    queryFn: () => universityService.getFilters(),
    staleTime: Infinity,
  });

  const featureValue: FeatureValue | undefined = filters.is985
    ? 'is985'
    : filters.is211
      ? 'is211'
      : filters.isDoubleFirstClass
        ? 'isDoubleFirstClass'
        : undefined;
  const setFeature = (v: FeatureValue | undefined) =>
    setFilters({
      ...filters,
      is985: v === 'is985' || undefined,
      is211: v === 'is211' || undefined,
      isDoubleFirstClass: v === 'isDoubleFirstClass' || undefined,
      page: 1,
    });

  const toItems = <T extends string>(arr: Array<{ value: T; count: number }>) =>
    arr.map((a) => ({ value: a.value, label: `${a.value}` }));
  const toItemsWithCount = <T extends string>(arr: Array<{ value: T; count: number }>) =>
    arr.map((a) => ({ value: a.value, label: `${a.value} (${a.count})` }));

  const appliedCount = [
    filters.province,
    filters.city,
    filters.level,
    filters.nature,
    filters.type,
    featureValue,
    filters.tierFilter,
  ].filter(Boolean).length;

  return (
    <div style={{ marginTop: 10 }}>
      <FilterChipRow
        label="所在地"
        options={toItemsWithCount(options?.provinces ?? [])}
        value={filters.province as string | undefined}
        onChange={(v) =>
          setFilters({ ...filters, province: v as never, city: undefined, page: 1 })
        }
        maxVisible={14}
      />
      {filters.province && (
        <FilterChipRow
          label="城市"
          options={toItemsWithCount(
            (options?.cities ?? []).filter((c) => c.province === filters.province),
          )}
          value={filters.city as string | undefined}
          onChange={(v) => setFilters({ ...filters, city: v as never, page: 1 })}
        />
      )}
      <FilterChipRow<FeatureValue>
        label="院校特性"
        options={[
          { value: 'is985', label: '985 工程' },
          { value: 'is211', label: '211 工程' },
          { value: 'isDoubleFirstClass', label: '双一流' },
        ]}
        value={featureValue}
        onChange={setFeature}
      />
      <FilterChipRow
        label="院校背景"
        options={BACKGROUND_TAGS.map((t) => ({ value: t, label: t }))}
        value={filters.hasTag as string | undefined}
        onChange={(v) => setFilters({ ...filters, hasTag: v as never, page: 1 })}
        maxVisible={10}
      />

      {expanded && (
        <>
          <FilterChipRow
            label="办学层次"
            options={toItems(options?.levels ?? [])}
            value={filters.level as string | undefined}
            onChange={(v) => setFilters({ ...filters, level: v as never, page: 1 })}
          />
          <FilterChipRow
            label="办学性质"
            options={toItems(options?.natures ?? [])}
            value={filters.nature as string | undefined}
            onChange={(v) => setFilters({ ...filters, nature: v as never, page: 1 })}
          />
          <FilterChipRow
            label="学校类型"
            options={toItemsWithCount(options?.types ?? [])}
            value={filters.type as string | undefined}
            onChange={(v) => setFilters({ ...filters, type: v as never, page: 1 })}
            maxVisible={10}
          />
          <FilterChipRow
            label="录取概率"
            options={[
              { value: 'rush', label: '冲一冲' },
              { value: 'stable', label: '稳一稳' },
              { value: 'safe', label: '保一保' },
            ]}
            value={filters.tierFilter as string | undefined}
            onChange={(v) => setFilters({ ...filters, tierFilter: v as never, page: 1 })}
            disabled={studentRank == null}
            hint={studentRank == null ? '先在成绩页录入位次' : undefined}
          />
        </>
      )}

      <div
        style={{
          paddingTop: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: 'transparent',
            border: 0,
            padding: '6px 0',
            fontSize: 12.5,
            color: 'var(--primary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {expanded ? (
            '收起更多筛选 ▴'
          ) : (
            <>
              展开更多筛选 ▾
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                (层次 · 性质 · 类型 · 录取概率)
              </span>
            </>
          )}
        </button>
        {appliedCount > 3 && !expanded && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              background: 'var(--accent-fixed)',
              padding: '3px 10px',
              borderRadius: 999,
              fontWeight: 500,
            }}
          >
            已选 {appliedCount} 项 — 展开查看
          </span>
        )}
      </div>
    </div>
  );
}
