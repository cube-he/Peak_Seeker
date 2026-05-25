'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Empty, Input, Pagination, Select, Spin } from 'antd';
import {
  CloseOutlined,
  EnvironmentOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import { universityService, type UniversityQueryParams } from '@/services/university';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStudentRank } from '@/stores/studentRankStore';
import { classifyRank, getTier } from '@/utils/classify-rank';
import RankTierBadge from '@/components/admission/RankTierBadge';
import RankDistance from '@/components/admission/RankDistance';
import type { UniversityListItem } from '@/services/university';
import { SORT_OPTIONS, type SortDirection } from './sort/sort-options';
import SortButton from './sort/SortButton';
import SortMorePopover from './sort/SortMorePopover';

type ActiveFilter = {
  key: keyof UniversityQueryParams;
  label: string;
};

const TIER_ITEMS: Array<{ key: 'rush' | 'stable' | 'safe'; label: string }> = [
  { key: 'rush', label: '冲' },
  { key: 'stable', label: '稳' },
  { key: 'safe', label: '保' },
];

// Top horizontal filter bar — feature chips + 5 dropdowns + tier chips,
// 所有筛选条件并排在顶部一行（搜索框那个 card 内），列表占满宽度,移除 240px 左栏。
function TopFilterBar({
  filters,
  setFilters,
  onClear,
}: {
  filters: UniversityQueryParams;
  setFilters: (filters: UniversityQueryParams) => void;
  onClear: () => void;
}) {
  const { data: options } = useQuery({
    queryKey: ['university-filters'],
    queryFn: () => universityService.getFilters(),
    staleTime: Infinity,
  });
  const studentRank = useStudentRank((s) => s.rank);

  const featureItems: Array<{ key: 'is985' | 'is211' | 'isDoubleFirstClass'; label: string }> = [
    { key: 'is985', label: '985' },
    { key: 'is211', label: '211' },
    { key: 'isDoubleFirstClass', label: '双一流' },
  ];

  const toOptions = (items: Array<{ value: string; count: number }>) =>
    items.map((i) => ({ value: i.value, label: `${i.value} (${i.count})` }));

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <span className="text-xs text-text-muted">筛选:</span>
      {/* 学校层次 chip */}
      {featureItems.map((item) => {
        const active = !!filters[item.key];
        return (
          <button
            key={item.key}
            type="button"
            onClick={() =>
              setFilters({ ...filters, [item.key]: active ? undefined : true, page: 1 })
            }
            className={`rounded-md border-0 px-2.5 py-1 text-[12px] transition-colors ${
              active
                ? 'bg-primary-fixed font-medium text-primary'
                : 'bg-bg text-text-tertiary hover:text-primary'
            }`}
          >
            {item.label}
          </button>
        );
      })}
      <span className="text-border mx-1">|</span>
      {/* 5 个 dropdown */}
      <Select
        placeholder="所在地"
        value={filters.province}
        allowClear
        size="small"
        style={{ minWidth: 110 }}
        options={toOptions(options?.provinces ?? [])}
        onChange={(province) => setFilters({ ...filters, province, city: undefined, page: 1 })}
      />
      {filters.province && (
        <Select
          placeholder="城市"
          value={filters.city}
          allowClear
          size="small"
          style={{ minWidth: 110 }}
          options={toOptions((options?.cities ?? []).filter((c) => c.province === filters.province))}
          onChange={(city) => setFilters({ ...filters, city, page: 1 })}
        />
      )}
      <Select
        placeholder="类型"
        value={filters.type}
        allowClear
        size="small"
        style={{ minWidth: 100 }}
        options={toOptions(options?.types ?? [])}
        onChange={(type) => setFilters({ ...filters, type, page: 1 })}
      />
      <Select
        placeholder="办学性质"
        value={filters.nature}
        allowClear
        size="small"
        style={{ minWidth: 110 }}
        options={toOptions(options?.natures ?? [])}
        onChange={(nature) => setFilters({ ...filters, nature, page: 1 })}
      />
      <Select
        placeholder="办学层次"
        value={filters.level}
        allowClear
        size="small"
        style={{ minWidth: 110 }}
        options={toOptions(options?.levels ?? [])}
        onChange={(level) => setFilters({ ...filters, level, page: 1 })}
      />
      <span className="text-border mx-1">|</span>
      {/* 冲稳保 chip（仅有 userRank 时可用） */}
      {TIER_ITEMS.map((item) => {
        const active = filters.tierFilter === item.key;
        const disabled = studentRank == null;
        return (
          <button
            key={item.key}
            type="button"
            disabled={disabled}
            title={disabled ? '先在成绩页录入位次' : undefined}
            onClick={() =>
              setFilters({ ...filters, tierFilter: active ? undefined : item.key, page: 1 })
            }
            className={`rounded-md border-0 px-2.5 py-1 text-[12px] transition-colors ${
              active
                ? 'bg-primary-fixed font-medium text-primary'
                : disabled
                  ? 'cursor-not-allowed bg-bg text-text-faint'
                  : 'bg-bg text-text-tertiary hover:text-primary'
            }`}
          >
            {item.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto border-0 bg-transparent text-[11px] uppercase tracking-[1.4px] text-text-faint hover:text-primary"
      >
        清除全部
      </button>
    </div>
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
  userRank,
  examType,
}: {
  uni: UniversityListItem;
  userRank: number | null;
  examType: '物理' | '历史';
}) {
  const tags: string[] = [];
  if (uni.is985) tags.push('985');
  if (uni.is211) tags.push('211');
  if (uni.isDoubleFirstClass) tags.push('双一流');

  const admission = uni.latestAdmission;
  // 直辖市 province === city：用 Set 去重，避免同值 chip 触发 React 重复 key 警告
  const infoItems = Array.from(
    new Set([uni.type, uni.province, uni.city, uni.runningNature].filter(Boolean)),
  );

  const tier = getTier({ is985: uni.is985, is211: uni.is211, batch: uni.level ?? '' });
  const verdict =
    userRank != null
      ? classifyRank(userRank, uni.predictedMinRank, tier, examType === '历史')
      : null;
  const rankDiff =
    userRank != null && uni.predictedMinRank != null
      ? uni.predictedMinRank - userRank
      : null;

  return (
    <div className="grid gap-4 rounded-xl bg-surface px-4 py-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover sm:px-5 lg:grid-cols-[64px_minmax(0,1fr)_140px] lg:items-center">
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
              {verdict && <RankTierBadge tier={verdict} />}
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
              {uni.softRanking != null && (
                <span>
                  软科{uni.softRankYear ?? ''} {uni.softRankList ?? ''}#{uni.softRanking}
                </span>
              )}
              {uni.softCategory && uni.softCategoryRank != null && (
                <span>{uni.softCategory} #{uni.softCategoryRank}</span>
              )}
              {uni.code && <span>院校代码 {uni.code}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-bg px-3 py-3 text-left lg:text-right">
        <span className="block font-serif text-[24px] font-semibold leading-none text-text tabular-nums">
          {admission?.minScore ?? '-'}
        </span>
        <span className="mt-1 block text-[11px] text-text-muted">
          {examType}类 · 最近一年最低分
        </span>
        <span className="mt-1 block text-[11px] text-text-tertiary tabular-nums">
          位次 {admission?.minRank ?? '-'}
        </span>
        {rankDiff != null && verdict && (
          <span className="mt-1 block text-[11px] text-text-muted">
            距你 <RankDistance diff={rankDiff} tier={verdict} />
          </span>
        )}
      </div>
    </div>
  );
}

export function UniversityListTab() {
  const [filters, setFilters] = useState<UniversityQueryParams>({
    page: 1,
    pageSize: 12,
    sortBy: 'softRank',
    sortOrder: 'asc',
  });
  const [keywordInput, setKeywordInput] = useState('');
  const debouncedKeyword = useDebouncedValue(keywordInput, 300);
  const examType = useStudentRank((s) => s.examType);
  const setExamType = useStudentRank((s) => s.setExamType);
  const studentRank = useStudentRank((s) => s.rank);

  // 位次被清空时，将依赖位次的排序/筛选重置，避免向后端发语义错误的请求
  useEffect(() => {
    if (studentRank != null) return;
    setFilters((prev) => {
      if (prev.sortBy !== 'tier' && prev.tierFilter == null) return prev;
      return {
        ...prev,
        sortBy: prev.sortBy === 'tier' ? 'name' : prev.sortBy,
        sortOrder: prev.sortBy === 'tier' ? 'asc' : prev.sortOrder,
        tierFilter: undefined,
      };
    });
  }, [studentRank]);

  // 防抖后才写入 filters，避免每次击键都触发请求
  useEffect(() => {
    setFilters((prev) => ({ ...prev, keyword: debouncedKeyword || undefined, page: 1 }));
  }, [debouncedKeyword]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['universities', filters, examType, studentRank],
    queryFn: () => universityService.getList({
      ...filters,
      // ExamType 包含 '理科'/'文科'，但 UniversityQueryParams 只接受 '物理'/'历史'
      // UI 只提供 '物理'/'历史' 两个选项，断言类型安全
      examType: examType as '物理' | '历史',
      userRank: studentRank ?? undefined,
    }),
  });

  const universities = data?.data || [];
  const total = data?.pagination?.total || 0;

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const items: ActiveFilter[] = [];
    if (filters.province) items.push({ key: 'province', label: filters.province });
    if (filters.city) items.push({ key: 'city', label: filters.city });
    if (filters.type) items.push({ key: 'type', label: filters.type });
    if (filters.nature) items.push({ key: 'nature', label: filters.nature });
    if (filters.level) items.push({ key: 'level', label: filters.level });
    if (filters.is985) items.push({ key: 'is985', label: '985' });
    if (filters.is211) items.push({ key: 'is211', label: '211' });
    if (filters.isDoubleFirstClass) items.push({ key: 'isDoubleFirstClass', label: '双一流' });
    if (filters.tierFilter) {
      const label = { rush: '冲', stable: '稳', safe: '保' }[filters.tierFilter];
      items.push({ key: 'tierFilter', label: `录取概率：${label}` });
    }
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
    const next: UniversityQueryParams = { ...filters, [key]: undefined, page: 1 };
    if (key === 'province') next.city = undefined;
    setFilters(next);
  };

  return (
    <div className="pb-12">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            University Directory · 院校库
          </div>
          <h1 className="m-0 font-serif text-[32px] font-semibold leading-tight text-text sm:text-[36px]">
            {total.toLocaleString()} 所院校 · 在川招生
          </h1>
          <p className="mt-2 text-sm text-text-tertiary">
            按省份、类型、层次筛选，结合录取位次找到更值得关注的学校。
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-xl bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-text-muted">科类</span>
          {(['物理', '历史'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setExamType(t)}
              className={`rounded-full border px-3.5 py-1 text-[13px] transition-colors ${
                examType === t
                  ? 'border-primary bg-primary-fixed font-medium text-primary'
                  : 'border-border bg-surface text-text-tertiary hover:text-primary'
              }`}
            >
              {t}类
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Input
            placeholder="搜索学校名 / 城市 / 关键词，例如“上海”“医科”"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            allowClear
            className="min-w-0 flex-1"
            size="large"
          />

          <div className="flex flex-wrap gap-2 items-center">
            {SORT_OPTIONS.filter((o) => o.group === 'hot').map((o, idx) => {
              const disabled =
                !!(o.requiresExamType && !examType) ||
                !!(o.requiresUserRank && studentRank == null);
              return (
                <SortButton
                  key={`${o.group}-${o.key}-${idx}`}
                  option={o}
                  current={{
                    key: filters.sortBy ?? 'softRank',
                    direction: (filters.sortOrder ?? 'asc') as SortDirection,
                  }}
                  disabled={disabled}
                  onChange={(key, dir) => {
                    setFilters({
                      ...filters,
                      sortBy: key ?? 'softRank',
                      sortOrder: dir ?? 'asc',
                      page: 1,
                    });
                  }}
                />
              );
            })}
            <SortMorePopover
              options={SORT_OPTIONS.filter((o) => o.group !== 'hot')}
              current={{
                key: filters.sortBy ?? 'softRank',
                direction: (filters.sortOrder ?? 'asc') as SortDirection,
              }}
              disabled={false}
              onChange={(key, dir) => {
                setFilters({
                  ...filters,
                  sortBy: key ?? 'softRank',
                  sortOrder: dir ?? 'asc',
                  page: 1,
                });
              }}
            />
          </div>
          <TopFilterBar filters={filters} setFilters={setFilters} onClear={clearFilters} />
        </div>
      </div>

      <div>
        <main>
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
              {universities.map((uni: UniversityListItem) => (
                // UI 只提供 '物理'/'历史' 两个选项，断言类型安全
                <UniversityCard key={uni.id} uni={uni} userRank={studentRank} examType={examType as '物理' | '历史'} />
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
                pageSizeOptions={['12', '24', '48']}
                showTotal={(count) => `共 ${count} 所院校`}
                onChange={(page, pageSize) => {
                  setFilters((prev) => ({ ...prev, page, pageSize }));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
