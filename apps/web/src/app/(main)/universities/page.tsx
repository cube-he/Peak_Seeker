'use client';

import { useState, useMemo } from 'react';
import { Input, Spin, Pagination, Empty } from 'antd';
import {
  SearchOutlined,
  EnvironmentOutlined,
  FireOutlined,
  RiseOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { universityService, UniversityQueryParams } from '@/services/university';

// 省份列表
const PROVINCES = [
  '北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江',
  '江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南',
  '广东','广西','海南','四川','贵州','云南','陕西','甘肃','青海',
  '内蒙古','西藏','宁夏','新疆','香港','澳门',
];

// 院校类型
const TYPES = ['综合','理工','农林','医药','师范','语言','财经','政法','体育','艺术','民族','军事'];

// 院校特色
const FEATURES = [
  { key: 'is985', label: '985' },
  { key: 'is211', label: '211' },
  { key: 'isDoubleFirstClass', label: '双一流' },
];

// 院校性质
const NATURES = ['公办', '民办'];

// 办学层次
const LEVELS = ['本科', '专科'];

// 筛选标签行组件
function FilterRow({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { key: string; label: string }[];
  value: string | undefined;
  onChange: (val: string | undefined) => void;
}) {
  return (
    <div className="flex items-start py-3 bg-surface-dim rounded-lg mb-1.5 px-4 overflow-x-auto">
      <span className="shrink-0 text-xs font-medium font-sans mr-4 mt-0.5 text-text-muted tracking-wide" style={{ width: 70 }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-block px-3 py-1 text-sm rounded-full cursor-pointer transition-colors ${
            !value
              ? 'bg-primary-fixed text-primary font-medium'
              : 'text-text-secondary hover:bg-primary-fixed hover:text-primary'
          }`}
          onClick={() => onChange(undefined)}
        >
          不限
        </span>
        {items.map((item) => (
          <span
            key={item.key}
            className={`inline-block px-3 py-1 text-sm rounded-full cursor-pointer transition-colors ${
              value === item.key
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-secondary hover:bg-primary-fixed hover:text-primary'
            }`}
            onClick={() => onChange(value === item.key ? undefined : item.key)}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// 特色标签多选行
function FeatureFilterRow({
  filters,
  setFilters,
}: {
  filters: UniversityQueryParams;
  setFilters: (f: UniversityQueryParams) => void;
}) {
  const noneActive = !filters.is985 && !filters.is211 && !filters.isDoubleFirstClass;

  return (
    <div className="flex items-start py-3 bg-surface-dim rounded-lg mb-1.5 px-4 overflow-x-auto">
      <span className="shrink-0 text-xs font-medium font-sans mr-4 mt-0.5 text-text-muted tracking-wide" style={{ width: 70 }}>
        院校特色
      </span>
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-block px-3 py-1 text-sm rounded-full cursor-pointer transition-colors ${
            noneActive
              ? 'bg-primary-fixed text-primary font-medium'
              : 'text-text-secondary hover:bg-primary-fixed hover:text-primary'
          }`}
          onClick={() =>
            setFilters({
              ...filters,
              is985: undefined,
              is211: undefined,
              isDoubleFirstClass: undefined,
              page: 1,
            })
          }
        >
          不限
        </span>
        {FEATURES.map((f) => {
          const active = !!(filters as any)[f.key];
          return (
            <span
              key={f.key}
              className={`inline-block px-3 py-1 text-sm rounded-full cursor-pointer transition-colors ${
                active
                  ? 'bg-primary-fixed text-primary font-medium'
                  : 'text-text-secondary hover:bg-primary-fixed hover:text-primary'
              }`}
              onClick={() =>
                setFilters({
                  ...filters,
                  [f.key]: active ? undefined : true,
                  page: 1,
                })
              }
            >
              {f.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// 院校卡片
function UniversityCard({ uni }: { uni: any }) {
  const tags: string[] = [];
  if (uni.is985) tags.push('985');
  if (uni.is211) tags.push('211');
  if (uni.isDoubleFirstClass) tags.push('双一流');

  const admission = uni.latestAdmission;
  const infoItems = [uni.province, uni.city, uni.type, uni.runningNature].filter(Boolean);

  return (
    <div className="bg-surface rounded-lg shadow-card hover:shadow-card-hover transition-all duration-300 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Link
              href={`/universities/${uni.id}`}
              className="font-serif text-base sm:text-lg font-semibold text-text hover:text-primary truncate transition-colors"
            >
              {uni.name}
            </Link>
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-surface-dim text-text-secondary rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 text-xs mb-3 text-text-tertiary">
            <EnvironmentOutlined />
            <span>{infoItems.join(' / ') || '-'}</span>
          </div>

          {/* 标签展示 */}
          {uni.tags && Array.isArray(uni.tags) && uni.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(uni.tags as string[]).slice(0, 6).map((tag: string) => (
                <span
                  key={tag}
                  className="bg-surface-dim text-text-secondary rounded-full px-2.5 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 右侧数据 */}
        <div className="flex items-center gap-4 sm:gap-6 shrink-0 sm:ml-4">
          {uni.ranking && (
            <div className="text-center">
              <div className="text-xs mb-1 text-text-tertiary">
                <RiseOutlined className="mr-1" />排名
              </div>
              <div className="text-sm font-semibold text-text-secondary [font-variant-numeric:tabular-nums]">
                {uni.ranking}
              </div>
            </div>
          )}
          {admission && (
            <div className="text-center">
              <div className="text-xs mb-1 text-text-tertiary">最低分/位次</div>
              <div className="text-sm [font-variant-numeric:tabular-nums]">
                <span className="font-semibold text-text-secondary">
                  {admission.minScore || '-'}
                </span>
                <span className="text-text-muted"> / </span>
                <span className="text-text-tertiary">{admission.minRank || '-'}</span>
              </div>
            </div>
          )}
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-accent hover:text-accent-light cursor-pointer transition-colors"
          >
            <StarOutlined />
          </button>
        </div>
      </div>
    </div>
  );
}

// 热门院校侧边栏
function HotUniversitiesSidebar() {
  const { data } = useQuery({
    queryKey: ['universities-hot'],
    queryFn: () => universityService.getHot(10),
  });

  const list = data?.data || data || [];

  return (
    <div className="bg-surface rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-accent-fixed flex items-center justify-center">
          <FireOutlined className="text-accent text-sm" />
        </div>
        <span className="font-serif text-base font-semibold text-text">
          热门院校排名
        </span>
      </div>
      <div className="space-y-2.5">
        {(Array.isArray(list) ? list : []).slice(0, 10).map((uni: any, idx: number) => (
          <Link
            key={uni.id}
            href={`/universities/${uni.id}`}
            className="flex items-center gap-3 group no-underline py-1.5 px-2 rounded-lg hover:bg-surface-dim transition-colors duration-200"
          >
            <span
              className={`w-5 h-5 rounded text-xs flex items-center justify-center font-semibold shrink-0 ${
                idx < 3
                  ? 'bg-primary text-white'
                  : 'bg-surface-dim text-text-tertiary'
              }`}
            >
              {idx + 1}
            </span>
            <span className="text-sm truncate text-text-tertiary group-hover:text-primary transition-colors duration-200">
              {uni.name}
            </span>
          </Link>
        ))}
        {(!Array.isArray(list) || list.length === 0) && (
          <div className="text-xs text-center py-6 text-text-muted">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}

export default function UniversitiesPage() {
  const [filters, setFilters] = useState<UniversityQueryParams>({
    page: 1,
    pageSize: 15,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['universities', filters],
    queryFn: () => universityService.getList(filters),
  });

  const provinceItems = useMemo(
    () => PROVINCES.map((p) => ({ key: p, label: p })),
    [],
  );
  const typeItems = useMemo(
    () => TYPES.map((t) => ({ key: t, label: t })),
    [],
  );
  const natureItems = useMemo(
    () => NATURES.map((n) => ({ key: n, label: n })),
    [],
  );
  const levelItems = useMemo(
    () => LEVELS.map((l) => ({ key: l, label: l })),
    [],
  );

  const universities = data?.data || [];
  const total = data?.pagination?.total || 0;

  return (
    <MainLayout>
      {/* 页面标题 */}
      <div className="mb-6">
        <h2 className="font-serif text-xl sm:text-2xl lg:text-[28px] font-semibold text-text mb-1">
          院校库
        </h2>
        <p className="text-sm text-text-tertiary">
          查找全国高校，了解院校详情
        </p>
      </div>

      {/* 筛选区域 */}
      <div className="bg-surface rounded-xl p-4 mb-6">
        <FilterRow
          label="院校省份"
          items={provinceItems}
          value={filters.province}
          onChange={(val) =>
            setFilters({ ...filters, province: val, city: undefined, page: 1 })
          }
        />
        <FilterRow
          label="院校类型"
          items={typeItems}
          value={filters.type}
          onChange={(val) => setFilters({ ...filters, type: val, page: 1 })}
        />
        <FeatureFilterRow filters={filters} setFilters={setFilters} />
        <div className="flex items-start py-3 bg-surface-dim rounded-lg px-4 overflow-x-auto">
          <span className="shrink-0 text-xs font-medium font-sans mr-4 mt-0.5 text-text-muted tracking-wide" style={{ width: 70 }}>
            院校性质
          </span>
          <div className="flex flex-wrap gap-1.5 items-center">
            {natureItems.map((item) => (
              <span
                key={item.key}
                className={`inline-block px-3 py-1 text-sm rounded-full cursor-pointer transition-colors ${
                  filters.nature === item.key
                    ? 'bg-primary-fixed text-primary font-medium'
                    : 'text-text-secondary hover:bg-primary-fixed hover:text-primary'
                }`}
                onClick={() =>
                  setFilters({
                    ...filters,
                    nature: filters.nature === item.key ? undefined : item.key,
                    page: 1,
                  })
                }
              >
                {item.label}
              </span>
            ))}
            <span className="text-text-faint mx-1">|</span>
            {levelItems.map((item) => (
              <span
                key={item.key}
                className={`inline-block px-3 py-1 text-sm rounded-full cursor-pointer transition-colors ${
                  filters.level === item.key
                    ? 'bg-primary-fixed text-primary font-medium'
                    : 'text-text-secondary hover:bg-primary-fixed hover:text-primary'
                }`}
                onClick={() =>
                  setFilters({
                    ...filters,
                    level: filters.level === item.key ? undefined : item.key,
                    page: 1,
                  })
                }
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 主内容区：左侧列表 + 右侧热门 */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧列表 */}
        <div className="flex-1 min-w-0">
          {/* 搜索栏 + 结果数 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="text-sm text-text-tertiary">
              共 <span className="font-semibold text-primary">{total}</span> 所院校
            </div>
            <div className="relative w-full sm:w-auto">
              <Input
                placeholder="搜索院校名称"
                prefix={<SearchOutlined className="text-text-muted" />}
                value={filters.keyword}
                onChange={(e) =>
                  setFilters({ ...filters, keyword: e.target.value, page: 1 })
                }
                allowClear
                className="w-full sm:w-[260px]"
              />
            </div>
          </div>

          {/* 院校列表 */}
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Spin size="large" />
            </div>
          ) : universities.length > 0 ? (
            <div className="space-y-3">
              {universities.map((uni: any) => (
                <UniversityCard key={uni.id} uni={uni} />
              ))}
            </div>
          ) : (
            <div className="bg-surface rounded-xl shadow-card p-12">
              <Empty description="暂无匹配的院校" />
            </div>
          )}

          {/* 分页 */}
          {total > 0 && (
            <div className="flex justify-center mt-8">
              <Pagination
                current={filters.page}
                pageSize={filters.pageSize}
                total={total}
                showSizeChanger
                showQuickJumper
                showTotal={(t) => `共 ${t} 所院校`}
                onChange={(page, pageSize) =>
                  setFilters({ ...filters, page, pageSize })
                }
              />
            </div>
          )}
        </div>

        {/* 右侧热门排名 */}
        <div className="w-64 shrink-0 hidden lg:block">
          <div className="sticky top-20">
            <HotUniversitiesSidebar />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
