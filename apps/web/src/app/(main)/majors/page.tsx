'use client';

import { useState, useMemo } from 'react';
import { Input, Spin, Empty, Pagination } from 'antd';
import {
  SearchOutlined,
  BookOutlined,
  FireOutlined,
  RightOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { majorService, MajorQueryParams } from '@/services/major';

// 学科门类（参考学信网分类）
const CATEGORIES = [
  '哲学', '经济学', '法学', '教育学', '文学', '历史学',
  '理学', '工学', '农学', '医学', '管理学', '艺术学',
];

// 层次
const LEVELS = ['本科', '专科'];

// 门类图标色
const CATEGORY_COLORS: Record<string, string> = {
  '哲学': '#8B5CF6',
  '经济学': '#F59E0B',
  '法学': '#EF4444',
  '教育学': '#10B981',
  '文学': '#EC4899',
  '历史学': '#78716C',
  '理学': '#3B82F6',
  '工学': '#6366F1',
  '农学': '#22C55E',
  '医学': '#F43F5E',
  '管理学': '#0EA5E9',
  '艺术学': '#A855F7',
};

// 左侧门类导航
function CategoryNav({
  categories,
  selected,
  onSelect,
  counts,
}: {
  categories: string[];
  selected: string | undefined;
  onSelect: (cat: string | undefined) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <div className="px-4 py-3 font-serif font-semibold text-sm flex items-center gap-2 text-text border-b border-border">
        <BookOutlined className="text-primary" />
        学科门类
      </div>
      <div className="py-1">
        {/* "全部门类" item */}
        <div
          className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
            !selected
              ? 'bg-primary-fixed text-primary font-medium rounded-lg mx-1'
              : 'text-text-tertiary hover:bg-surface-dim rounded-lg mx-1'
          }`}
          onClick={() => onSelect(undefined)}
        >
          <span className="text-sm">全部门类</span>
          <RightOutlined
            className={`text-[10px] transition-opacity ${!selected ? 'opacity-100 text-primary' : 'opacity-0'}`}
          />
        </div>

        {categories.map((cat) => (
          <div
            key={cat}
            className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors rounded-lg mx-1 ${
              selected === cat
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-tertiary hover:bg-surface-dim'
            }`}
            onClick={() => onSelect(selected === cat ? undefined : cat)}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: CATEGORY_COLORS[cat] || '#94A3B8' }}
              />
              <span className="text-sm">{cat}</span>
            </div>
            <div className="flex items-center gap-2">
              {counts[cat] !== undefined && (
                <span className="text-xs text-text-muted">{counts[cat]}</span>
              )}
              {selected === cat && (
                <RightOutlined className="text-[10px] text-primary" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 专业卡片
function MajorCard({ major }: { major: any }) {
  return (
    <div className="bg-surface rounded-lg shadow-card hover:shadow-card-hover p-5 transition-all duration-300 cursor-pointer group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href={`/majors/${major.id}`}
              className="font-serif text-base font-semibold text-text hover:text-primary truncate transition-colors"
            >
              {major.name}
            </Link>
            {major.level && (
              <span className="bg-surface-dim text-text-secondary rounded-full px-2.5 py-0.5 text-xs">
                {major.level}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm text-text-tertiary">
            {major.code && <span>代码：{major.code}</span>}
            {major.category && (
              <span className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: CATEGORY_COLORS[major.category] || '#94A3B8' }}
                />
                {major.category}
              </span>
            )}
            {major.discipline && <span>{major.discipline}</span>}
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0 ml-4">
          {major.employmentRate != null && (
            <div className="text-center min-w-[64px]">
              <div className="text-xs mb-1 text-text-tertiary">就业率</div>
              <div className="w-full h-1.5 rounded-full bg-border mb-1">
                <div
                  className="h-1.5 rounded-full bg-safe transition-all"
                  style={{ width: `${Math.min(major.employmentRate, 100)}%` }}
                />
              </div>
              <div className="text-xs font-semibold font-serif text-text">
                {major.employmentRate}%
              </div>
            </div>
          )}
          {major.avgSalary != null && (
            <div className="text-center">
              <div className="text-xs mb-0.5 text-text-tertiary">平均薪资</div>
              <div className="font-serif text-lg font-semibold text-accent [font-variant-numeric:tabular-nums]">
                ¥{major.avgSalary.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 热门专业侧边栏
function HotMajorsSidebar() {
  const { data } = useQuery({
    queryKey: ['majors-hot'],
    queryFn: () => majorService.getHot(10),
  });

  const list = data?.data || data || [];

  return (
    <div className="bg-surface rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <FireOutlined className="text-accent text-base" />
        <span className="font-serif font-semibold text-sm text-text">
          热门专业
        </span>
      </div>
      <div className="space-y-3">
        {(Array.isArray(list) ? list : []).slice(0, 10).map((m: any, idx: number) => (
          <Link
            key={m.id}
            href={`/majors/${m.id}`}
            className="flex items-center gap-3 group no-underline"
          >
            <span
              className={`w-5 h-5 rounded text-xs flex items-center justify-center font-semibold shrink-0 ${
                idx < 3
                  ? 'bg-primary text-white'
                  : 'bg-surface-dim text-text-muted'
              }`}
            >
              {idx + 1}
            </span>
            <span className="text-sm truncate text-text-tertiary group-hover:text-primary transition-colors">
              {m.name}
            </span>
          </Link>
        ))}
        {(!Array.isArray(list) || list.length === 0) && (
          <div className="text-xs text-center py-4 text-text-muted">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}

export default function MajorsPage() {
  const [filters, setFilters] = useState<MajorQueryParams>({
    page: 1,
    pageSize: 20,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['majors', filters],
    queryFn: () => majorService.getList(filters),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['major-categories'],
    queryFn: () => majorService.getCategories(),
  });

  // 构建门类计数
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (Array.isArray(categoriesData)) {
      categoriesData.forEach((c: any) => {
        if (c.value) counts[c.value] = c.count || 0;
      });
    }
    return counts;
  }, [categoriesData]);

  const majors = data?.data || [];
  const total = data?.pagination?.total || 0;

  return (
    <MainLayout>
      {/* 页面标题 */}
      <div className="mb-5">
        <h2 className="text-xl font-serif font-bold mb-1 text-text">
          专业查询
        </h2>
        <p className="text-sm text-text-secondary">
          查找各类专业信息，了解专业详情与就业前景
        </p>
      </div>

      {/* 顶部：层次切换 + 搜索 */}
      <div className="bg-surface rounded-xl shadow-card p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <span
            className={`px-4 py-1.5 text-sm rounded-lg cursor-pointer transition-all duration-200 ${
              !filters.level
                ? 'bg-primary-fixed text-primary font-semibold'
                : 'bg-transparent text-text-tertiary hover:bg-surface-dim'
            }`}
            onClick={() => setFilters({ ...filters, level: undefined, page: 1 })}
          >
            全部
          </span>
          {LEVELS.map((lv) => (
            <span
              key={lv}
              className={`px-4 py-1.5 text-sm rounded-lg cursor-pointer transition-all duration-200 ${
                filters.level === lv
                  ? 'bg-primary-fixed text-primary font-semibold'
                  : 'bg-transparent text-text-tertiary hover:bg-surface-dim'
              }`}
              onClick={() =>
                setFilters({
                  ...filters,
                  level: filters.level === lv ? undefined : lv,
                  page: 1,
                })
              }
            >
              {lv}
            </span>
          ))}
        </div>
        <Input
          placeholder="搜索专业名称或代码"
          prefix={<SearchOutlined className="text-text-muted" />}
          value={filters.keyword}
          onChange={(e) =>
            setFilters({ ...filters, keyword: e.target.value, page: 1 })
          }
          allowClear
          style={{ width: 280 }}
          className="!bg-surface-dim !rounded-lg"
        />
      </div>

      {/* 主内容区：左侧门类导航 + 中间列表 + 右侧热门 */}
      <div className="flex gap-5">
        {/* 左侧门类导航 */}
        <div className="w-52 shrink-0 hidden md:block">
          <div className="sticky top-20">
            <CategoryNav
              categories={CATEGORIES}
              selected={filters.category}
              onSelect={(cat) =>
                setFilters({ ...filters, category: cat, page: 1 })
              }
              counts={categoryCounts}
            />
          </div>
        </div>

        {/* 中间专业列表 */}
        <div className="flex-1 min-w-0">
          {/* 结果统计 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ReadOutlined className="text-primary text-sm" />
              <span className="text-sm text-text-secondary">
                共{' '}
                <span className="font-semibold text-primary">
                  {total}
                </span>{' '}
                个专业
              </span>
              {filters.category && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-primary-fixed text-primary cursor-pointer hover:bg-primary-light/10 transition-colors"
                  onClick={() =>
                    setFilters({ ...filters, category: undefined, page: 1 })
                  }
                >
                  {filters.category}
                  <span className="text-primary/60 hover:text-primary ml-0.5">&times;</span>
                </span>
              )}
              {filters.level && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-primary-fixed text-primary cursor-pointer hover:bg-primary-light/10 transition-colors"
                  onClick={() =>
                    setFilters({ ...filters, level: undefined, page: 1 })
                  }
                >
                  {filters.level}
                  <span className="text-primary/60 hover:text-primary ml-0.5">&times;</span>
                </span>
              )}
            </div>
          </div>

          {/* 专业列表 */}
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Spin size="large" />
            </div>
          ) : majors.length > 0 ? (
            <div className="space-y-3">
              {majors.map((m: any) => (
                <MajorCard key={m.id} major={m} />
              ))}
            </div>
          ) : (
            <div className="bg-surface rounded-xl shadow-card p-12">
              <Empty description="暂无匹配的专业" />
            </div>
          )}

          {/* 分页 */}
          {total > 0 && (
            <div className="flex justify-center mt-6">
              <Pagination
                current={filters.page}
                pageSize={filters.pageSize}
                total={total}
                showSizeChanger
                showQuickJumper
                showTotal={(t) => `共 ${t} 个专业`}
                onChange={(page, pageSize) =>
                  setFilters({ ...filters, page, pageSize })
                }
              />
            </div>
          )}
        </div>

        {/* 右侧热门专业 */}
        <div className="w-56 shrink-0 hidden lg:block">
          <div className="sticky top-20">
            <HotMajorsSidebar />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
