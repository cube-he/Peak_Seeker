'use client';

import { useMemo, useState } from 'react';
import { Alert, Empty, Input, Pagination, Spin } from 'antd';
import {
  BookOutlined,
  CloseOutlined,
  FireOutlined,
  ReadOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { RankInput } from '@/components/score/RankInput';
import { majorService, type MajorQueryParams } from '@/services/major';

const CATEGORIES = [
  '哲学', '经济学', '法学', '教育学', '文学', '历史学',
  '理学', '工学', '农学', '医学', '管理学', '艺术学',
];

const LEVELS = ['本科', '专科'];

const CATEGORY_COLORS: Record<string, string> = {
  哲学: '#7c3aed',
  经济学: '#b8860b',
  法学: '#c53030',
  教育学: '#276749',
  文学: '#be185d',
  历史学: '#78716c',
  理学: '#2c5282',
  工学: '#4f46e5',
  农学: '#15803d',
  医学: '#e11d48',
  管理学: '#0284c7',
  艺术学: '#9333ea',
};

type ActiveFilter = {
  key: keyof MajorQueryParams;
  label: string;
};

function parseRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatSalary(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value >= 1000) return `¥${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `¥${value}`;
}

function CategoryNav({
  categories,
  selected,
  onSelect,
  counts,
}: {
  categories: string[];
  selected: string | undefined;
  onSelect: (category: string | undefined) => void;
  counts: Record<string, number>;
}) {
  return (
    <aside className="rounded-xl bg-surface py-4 shadow-card lg:sticky lg:top-20">
      <div className="mb-2 flex items-center gap-2 px-4 font-serif text-sm font-semibold text-text">
        <BookOutlined className="text-primary" />
        学科门类
      </div>
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        className={`flex w-full items-center justify-between border-0 px-4 py-2.5 text-left text-sm transition-colors ${
          !selected ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-bg hover:text-text'
        }`}
      >
        <span>全部门类</span>
        <RightOutlined className={`text-[10px] ${!selected ? 'opacity-100' : 'opacity-0'}`} />
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(selected === category ? undefined : category)}
          className={`flex w-full items-center justify-between border-0 px-4 py-2.5 text-left text-sm transition-colors ${
            selected === category ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-bg hover:text-text'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[category] || '#94a3b8' }}
            />
            <span className="truncate">{category}</span>
          </span>
          <span className="ml-2 text-[11px] text-text-faint tabular-nums">
            {counts[category] ?? ''}
          </span>
        </button>
      ))}
    </aside>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-text-secondary transition-colors hover:border-primary hover:text-primary"
    >
      {label}
      <CloseOutlined className="text-[9px]" />
    </button>
  );
}

function MajorCard({ major }: { major: any }) {
  const employmentRate = parseRate(major.employmentRate);
  const categoryColor = CATEGORY_COLORS[major.category] || '#1e3a5f';
  const tags = [major.category, major.discipline, major.degree, major.level, major.softRating]
    .filter(Boolean)
    .slice(0, 5);

  return (
    <Link
      href={`/majors/${major.id}`}
      className="block rounded-xl bg-surface p-5 text-text no-underline shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="m-0 truncate font-serif text-[20px] font-semibold leading-tight text-text">
            {major.name}
          </h3>
          <div className="mt-2 inline-flex rounded bg-bg px-2 py-0.5 font-mono text-[11px] text-text-muted">
            {major.code || '暂无代码'}
          </div>
        </div>
        <span className="rounded-full bg-accent-fixed px-3 py-1 text-[11px] font-medium text-accent">
          {major.isRestricted ? '限报提示' : '可填报'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-y border-border-subtle py-4">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[1.2px] text-text-muted">就业率</div>
          <div className={`mt-1 font-serif text-lg font-semibold tabular-nums ${employmentRate ? 'text-safe' : 'text-text-muted'}`}>
            {employmentRate ? `${employmentRate}%` : '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[1.2px] text-text-muted">起薪</div>
          <div className="mt-1 font-serif text-lg font-semibold text-accent tabular-nums">
            {formatSalary(major.avgSalary)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[1.2px] text-text-muted">学制</div>
          <div className="mt-1 font-serif text-lg font-semibold text-text">
            {major.standardDuration || '4年'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span key={tag} className="rounded bg-bg px-2 py-0.5 text-[11px] text-text-tertiary">
              {tag}
            </span>
          ))
        ) : (
          <span className="rounded bg-bg px-2 py-0.5 text-[11px] text-text-faint">等待补充分类</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor }} />
          {major.category || '未分类'}
        </span>
        <span>查看详情 →</span>
      </div>
    </Link>
  );
}

function HotMajorsSidebar() {
  const { data } = useQuery({
    queryKey: ['majors-hot'],
    queryFn: () => majorService.getHot(10),
  });

  const list = data?.data || data || [];

  return (
    <div className="rounded-xl bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-fixed">
          <FireOutlined className="text-sm text-accent" />
        </div>
        <span className="font-serif text-base font-semibold text-text">热门专业</span>
      </div>
      <div className="space-y-2">
        {(Array.isArray(list) ? list : []).slice(0, 10).map((major: any, idx: number) => (
          <Link
            key={major.id}
            href={`/majors/${major.id}`}
            className="group flex items-center gap-3 rounded-lg px-2 py-1.5 no-underline transition-colors hover:bg-surface-dim"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-semibold ${
                idx < 3 ? 'bg-primary text-white' : 'bg-surface-dim text-text-muted'
              }`}
            >
              {idx + 1}
            </span>
            <span className="truncate text-sm text-text-tertiary transition-colors group-hover:text-primary">
              {major.name}
            </span>
          </Link>
        ))}
        {(!Array.isArray(list) || list.length === 0) && (
          <div className="py-5 text-center text-xs text-text-muted">暂无数据</div>
        )}
      </div>
    </div>
  );
}

export default function MajorsPage() {
  const [filters, setFilters] = useState<MajorQueryParams>({
    page: 1,
    pageSize: 12,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['majors', filters],
    queryFn: () => majorService.getList(filters),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['major-categories'],
    queryFn: () => majorService.getCategories(),
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (Array.isArray(categoriesData)) {
      categoriesData.forEach((category: any) => {
        if (category.value) counts[category.value] = category.count || 0;
      });
    }
    return counts;
  }, [categoriesData]);

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const items: ActiveFilter[] = [];
    if (filters.category) items.push({ key: 'category', label: filters.category });
    if (filters.level) items.push({ key: 'level', label: filters.level });
    return items;
  }, [filters.category, filters.level]);

  const majors = data?.data || [];
  const total = data?.pagination?.total || 0;

  return (
    <MainLayout>
      <div className="pb-12">
        <div className="mb-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            Major Directory · 专业库
          </div>
          <h1 className="m-0 font-serif text-[32px] font-semibold leading-tight text-text sm:text-[36px]">
            1,434 个本科专业
          </h1>
          <p className="mt-2 text-sm text-text-tertiary">
            12 大学科门类，结合就业方向、薪资中位数和对口院校，帮你判断专业的长期适配度。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-4">
            <CategoryNav
              categories={CATEGORIES}
              selected={filters.category}
              onSelect={(category) => setFilters({ ...filters, category, page: 1 })}
              counts={categoryCounts}
            />
            <div className="hidden lg:block">
              <RankInput variant="compact" className="!border-border !bg-surface" />
            </div>
          </div>

          <main className="min-w-0">
            <div className="mb-4 rounded-xl bg-surface p-4 shadow-card">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <Input
                  placeholder="搜索专业名 / 代码 / 关键词，例如“金融”“人工智能”"
                  prefix={<SearchOutlined className="text-text-muted" />}
                  value={filters.keyword}
                  onChange={(event) => setFilters({ ...filters, keyword: event.target.value, page: 1 })}
                  allowClear
                  className="min-w-0 flex-1"
                  size="large"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, level: undefined, page: 1 })}
                    className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                      !filters.level ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-bg text-text-tertiary hover:text-primary'
                    }`}
                  >
                    全部
                  </button>
                  {LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setFilters({ ...filters, level: filters.level === level ? undefined : level, page: 1 })}
                      className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                        filters.level === level ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-bg text-text-tertiary hover:text-primary'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-md border-0 bg-bg px-3.5 py-2 text-[13px] text-text-faint"
                  >
                    就业/薪资排序待接入
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm text-text-tertiary">
                <ReadOutlined className="text-primary" />
                找到 <strong className="font-serif text-lg font-semibold text-text tabular-nums">{total}</strong> 个专业
              </div>
              <div className="flex flex-wrap gap-2">
                {activeFilters.length > 0 ? (
                  activeFilters.map((item) => (
                    <FilterChip
                      key={item.key}
                      label={item.label}
                      onRemove={() => setFilters({ ...filters, [item.key]: undefined, page: 1 })}
                    />
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-text-faint">
                    暂未限定条件
                  </span>
                )}
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
                  message="专业数据加载失败"
                  description={(error as Error)?.message || '请稍后刷新重试，或检查当前站点网络配置。'}
                />
              </div>
            ) : majors.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {majors.map((major: any) => (
                  <MajorCard key={major.id} major={major} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-8 shadow-card sm:p-12">
                <Empty description="暂无匹配的专业" />
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
                  showTotal={(count) => `共 ${count} 个专业`}
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
              <div className="mb-2 font-serif text-base font-semibold text-text">适配说明</div>
              <p className="m-0 text-sm leading-relaxed text-text-tertiary">
                当前后端支持专业关键词、门类和层次筛选；设计稿中的就业率排序、薪资排序和报考热度需要新增排序字段或聚合接口，已在界面中标注为待接入。
              </p>
            </div>
            <HotMajorsSidebar />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
