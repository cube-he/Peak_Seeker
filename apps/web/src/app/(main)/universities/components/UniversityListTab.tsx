'use client';

import { useMemo, useState } from 'react';
import { Alert, Empty, Input, Pagination, Spin } from 'antd';
import {
  AppstoreOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  FireOutlined,
  SearchOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import { universityService, type UniversityQueryParams } from '@/services/university';

const PROVINCES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
  '广东', '广西', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海',
  '内蒙古', '西藏', '宁夏', '新疆', '香港', '澳门',
];

const TYPES = ['综合', '理工', '农林', '医药', '师范', '语言', '财经', '政法', '体育', '艺术', '民族', '军事'];
const NATURES = ['公办', '民办'];
const LEVELS = ['本科', '专科'];

const SORTS: Array<{ label: string; value?: Pick<UniversityQueryParams, 'sortBy' | 'sortOrder'>; disabled?: boolean }> = [
  { label: '综合排序', value: { sortBy: 'name', sortOrder: 'asc' } },
  { label: '按省份', value: { sortBy: 'province', sortOrder: 'asc' } },
  { label: '按类型', value: { sortBy: 'type', sortOrder: 'asc' } },
  { label: '分数排序待接入', disabled: true },
];

type ActiveFilter = {
  key: keyof UniversityQueryParams;
  label: string;
};

function FilterGroup({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: string[];
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="border-b border-border-subtle py-4 last:border-b-0">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
        {title}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`flex w-full items-center justify-between rounded-md border-0 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
            !value ? 'bg-primary-fixed font-medium text-primary' : 'text-text-secondary hover:bg-surface-dim hover:text-text'
          }`}
        >
          <span>不限</span>
          <span className="text-[11px] text-text-faint">ALL</span>
        </button>
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(value === item ? undefined : item)}
            className={`flex w-full items-center justify-between rounded-md border-0 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              value === item ? 'bg-primary-fixed font-medium text-primary' : 'text-text-secondary hover:bg-surface-dim hover:text-text'
            }`}
          >
            <span>{item}</span>
            <span className="text-[11px] text-text-faint">{value === item ? 'ON' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FeatureFilters({
  filters,
  setFilters,
}: {
  filters: UniversityQueryParams;
  setFilters: (filters: UniversityQueryParams) => void;
}) {
  const featureItems: Array<{ key: 'is985' | 'is211' | 'isDoubleFirstClass'; label: string; count: string }> = [
    { key: 'is985', label: '985 工程', count: '39' },
    { key: 'is211', label: '211 工程', count: '116' },
    { key: 'isDoubleFirstClass', label: '双一流', count: '147' },
  ];

  return (
    <div className="border-b border-border-subtle py-4">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
        学校层次
      </div>
      <div className="space-y-1">
        {featureItems.map((item) => {
          const active = !!filters[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilters({ ...filters, [item.key]: active ? undefined : true, page: 1 })}
              className={`flex w-full items-center justify-between rounded-md border-0 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                active ? 'bg-primary-fixed font-medium text-primary' : 'text-text-secondary hover:bg-surface-dim hover:text-text'
              }`}
            >
              <span>{item.label}</span>
              <span className="text-[11px] text-text-faint">{item.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterPanel({
  filters,
  setFilters,
  onClear,
}: {
  filters: UniversityQueryParams;
  setFilters: (filters: UniversityQueryParams) => void;
  onClear: () => void;
}) {
  return (
    <aside className="rounded-xl bg-surface p-4 shadow-card lg:sticky lg:top-20">
      <div className="flex items-center justify-between">
        <h3 className="m-0 font-serif text-base font-semibold text-text">筛选</h3>
        <button
          type="button"
          onClick={onClear}
          className="border-0 bg-transparent text-[11px] uppercase tracking-[1.4px] text-text-faint transition-colors hover:text-primary"
        >
          清除
        </button>
      </div>

      <FeatureFilters filters={filters} setFilters={setFilters} />
      <FilterGroup
        title="所在地"
        items={PROVINCES.slice(0, 12)}
        value={filters.province}
        onChange={(province) => setFilters({ ...filters, province, city: undefined, page: 1 })}
      />
      <FilterGroup
        title="学校类型"
        items={TYPES.slice(0, 8)}
        value={filters.type}
        onChange={(type) => setFilters({ ...filters, type, page: 1 })}
      />
      <FilterGroup
        title="办学性质"
        items={NATURES}
        value={filters.nature}
        onChange={(nature) => setFilters({ ...filters, nature, page: 1 })}
      />
      <FilterGroup
        title="办学层次"
        items={LEVELS}
        value={filters.level}
        onChange={(level) => setFilters({ ...filters, level, page: 1 })}
      />
    </aside>
  );
}

function AppliedFilterChips({
  activeFilters,
  onRemove,
}: {
  activeFilters: ActiveFilter[];
  onRemove: (key: keyof UniversityQueryParams) => void;
}) {
  if (activeFilters.length === 0) {
    return (
      <span className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-text-faint">
        暂未限定条件
      </span>
    );
  }

  return (
    <>
      {activeFilters.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onRemove(item.key)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-text-secondary transition-colors hover:border-primary hover:text-primary"
        >
          {item.label}
          <CloseOutlined className="text-[9px]" />
        </button>
      ))}
    </>
  );
}

function UniversityCard({
  uni,
  selected,
  onToggleSelect,
}: {
  uni: any;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const tags: string[] = [];
  if (uni.is985) tags.push('985');
  if (uni.is211) tags.push('211');
  if (uni.isDoubleFirstClass) tags.push('双一流');

  const admission = uni.latestAdmission;
  const infoItems = [uni.type, uni.province, uni.city, uni.runningNature].filter(Boolean);

  return (
    <div className="grid gap-4 rounded-xl bg-surface px-4 py-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover sm:px-5 lg:grid-cols-[64px_minmax(0,1fr)_140px_48px] lg:items-center">
      <Link href={`/universities/${uni.id}`} className="hidden no-underline lg:block">
        <UniversityLogo name={uni.name} logoUrl={uni.logoUrl} size={64} />
      </Link>

      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <Link href={`/universities/${uni.id}`} className="mt-0.5 shrink-0 no-underline lg:hidden">
            <UniversityLogo name={uni.name} logoUrl={uni.logoUrl} size={52} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/universities/${uni.id}`}
                className="truncate font-serif text-[19px] font-semibold text-text no-underline transition-colors hover:text-primary"
              >
                {uni.name}
              </Link>
              {tags.map((tag) => (
                <span key={tag} className="rounded bg-accent-fixed px-2 py-0.5 text-[11px] font-medium text-accent">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {infoItems.map((item) => (
                <span key={item} className="rounded bg-bg px-2 py-0.5 text-[11px] text-text-tertiary">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1">
                <EnvironmentOutlined />
                {uni.province || '-'} {uni.city || ''}
              </span>
              {uni.ranking && <span>综合排名 {uni.ranking}</span>}
              {uni.code && <span>院校代码 {uni.code}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-bg px-3 py-3 text-left lg:text-right">
        <span className="block font-serif text-[24px] font-semibold leading-none text-text tabular-nums">
          {admission?.minScore || '-'}
        </span>
        <span className="mt-1 block text-[11px] text-text-muted">最近一年最低分</span>
        <span className="mt-1 block text-[11px] text-text-tertiary tabular-nums">
          位次 {admission?.minRank || '-'}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onToggleSelect}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 transition-colors ${
            selected ? 'bg-accent text-white' : 'bg-surface-dim text-accent hover:bg-accent-fixed'
          }`}
          aria-label={selected ? '取消对比' : '加入对比'}
        >
          <StarOutlined />
        </button>
      </div>
    </div>
  );
}

function HotUniversitiesSidebar() {
  const { data } = useQuery({
    queryKey: ['universities-hot'],
    queryFn: () => universityService.getHot(10),
  });

  const list = data?.data || data || [];

  return (
    <div className="rounded-xl bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-fixed">
          <FireOutlined className="text-sm text-accent" />
        </div>
        <span className="font-serif text-base font-semibold text-text">热门院校</span>
      </div>
      <div className="space-y-2">
        {(Array.isArray(list) ? list : []).slice(0, 10).map((uni: any, idx: number) => (
          <Link
            key={uni.id}
            href={`/universities/${uni.id}`}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 no-underline transition-colors hover:bg-surface-dim"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-semibold ${
                idx < 3 ? 'bg-primary text-white' : 'bg-surface-dim text-text-tertiary'
              }`}
            >
              {idx + 1}
            </span>
            <UniversityLogo name={uni.name} logoUrl={uni.logoUrl} size={24} />
            <span className="truncate text-sm text-text-tertiary transition-colors group-hover:text-primary">
              {uni.name}
            </span>
          </Link>
        ))}
        {(!Array.isArray(list) || list.length === 0) && (
          <div className="py-6 text-center text-xs text-text-muted">暂无数据</div>
        )}
      </div>
    </div>
  );
}

export function UniversityListTab() {
  const [filters, setFilters] = useState<UniversityQueryParams>({
    page: 1,
    pageSize: 12,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['universities', filters],
    queryFn: () => universityService.getList(filters),
  });

  const universities = data?.data || [];
  const total = data?.pagination?.total || 0;

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const items: ActiveFilter[] = [];
    if (filters.province) items.push({ key: 'province', label: filters.province });
    if (filters.type) items.push({ key: 'type', label: filters.type });
    if (filters.nature) items.push({ key: 'nature', label: filters.nature });
    if (filters.level) items.push({ key: 'level', label: filters.level });
    if (filters.is985) items.push({ key: 'is985', label: '985' });
    if (filters.is211) items.push({ key: 'is211', label: '211' });
    if (filters.isDoubleFirstClass) items.push({ key: 'isDoubleFirstClass', label: '双一流' });
    return items;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      page: 1,
      pageSize: filters.pageSize,
      keyword: filters.keyword,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
  };

  const removeFilter = (key: keyof UniversityQueryParams) => {
    setFilters({ ...filters, [key]: undefined, page: 1 });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="pb-12">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            University Directory · 院校库
          </div>
          <h1 className="m-0 font-serif text-[32px] font-semibold leading-tight text-text sm:text-[36px]">
            2,237 所院校 · 在川招生
          </h1>
          <p className="mt-2 text-sm text-text-tertiary">
            覆盖 2022-2025 录取数据，按省份、类型、层次筛出更值得关注的学校。
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border-0 bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(184,134,11,0.2)] transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
          disabled={selectedIds.size === 0}
        >
          对比已选 ({selectedIds.size}/3)
        </button>
      </div>

      <div className="mb-5 rounded-xl bg-surface p-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Input
            placeholder="搜索学校名 / 城市 / 关键词，例如“上海”“医科”"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value, page: 1 })}
            allowClear
            className="min-w-0 flex-1"
            size="large"
          />

          <div className="flex flex-wrap gap-2">
            {SORTS.map((sort) => {
              const active = sort.value && filters.sortBy === sort.value.sortBy && filters.sortOrder === sort.value.sortOrder;
              return (
                <button
                  key={sort.label}
                  type="button"
                  disabled={sort.disabled}
                  onClick={() => sort.value && setFilters({ ...filters, ...sort.value, page: 1 })}
                  className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                    active
                      ? 'bg-surface-high text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                      : sort.disabled
                        ? 'cursor-not-allowed bg-bg text-text-faint'
                        : 'bg-bg text-text-tertiary hover:text-primary'
                  }`}
                >
                  {sort.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-4">
          <FilterPanel filters={filters} setFilters={setFilters} onClear={clearFilters} />
        </div>

        <main className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 rounded-xl bg-bg md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-text-tertiary">
              找到 <strong className="font-serif text-lg font-semibold text-text tabular-nums">{total}</strong> 所院校
              <span className="ml-2 text-text-faint">
                第 {filters.page || 1} 页 · 每页 {filters.pageSize} 所
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppliedFilterChips activeFilters={activeFilters} onRemove={removeFilter} />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center rounded-xl bg-surface py-20 shadow-card">
              <Spin size="large" />
            </div>
          ) : isError ? (
            <div className="rounded-xl bg-surface p-6 shadow-card sm:p-8">
              <Alert
                type="error"
                showIcon
                message="院校数据加载失败"
                description={(error as Error)?.message || '请稍后刷新重试，或检查当前站点网络配置。'}
              />
            </div>
          ) : universities.length > 0 ? (
            <div className="space-y-3">
              {universities.map((uni: any) => (
                <UniversityCard
                  key={uni.id}
                  uni={uni}
                  selected={selectedIds.has(uni.id)}
                  onToggleSelect={() => toggleSelect(uni.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-surface p-8 shadow-card sm:p-12">
              <Empty description="暂无匹配的院校" />
            </div>
          )}

          {total > 0 && (
            <div className="mt-8 flex justify-center">
              <Pagination
                current={filters.page}
                pageSize={filters.pageSize}
                total={total}
                showSizeChanger
                showQuickJumper
                showTotal={(count) => `共 ${count} 所院校`}
                onChange={(page, pageSize) => setFilters({ ...filters, page, pageSize })}
              />
            </div>
          )}
        </main>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-xl bg-surface p-5 shadow-card">
            <div className="mb-2 flex items-center gap-2 text-text">
              <AppstoreOutlined className="text-primary" />
              <span className="font-serif text-base font-semibold">数据说明</span>
            </div>
            <p className="m-0 text-sm leading-relaxed text-text-tertiary">
              分数排序和地图视图需要后端新增聚合接口。目前页面保留排序口径内的稳定功能。
            </p>
          </div>
          <HotUniversitiesSidebar />
        </div>
      </div>
    </div>
  );
}
