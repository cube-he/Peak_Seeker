'use client';

import { useState, useMemo } from 'react';
import { Input, Tag, Spin, Pagination, Empty, Button } from 'antd';
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
    <div className="flex items-start py-2.5 border-b" style={{ borderColor: '#F1F5F9' }}>
      <span
        className="shrink-0 text-sm font-medium mr-4 mt-0.5"
        style={{ color: '#64748B', width: 70 }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <span
          className="inline-block px-3 py-1 text-sm rounded cursor-pointer transition-colors"
          style={{
            background: !value ? '#2563EB' : 'transparent',
            color: !value ? '#fff' : '#64748B',
            fontWeight: !value ? 500 : 400,
          }}
          onClick={() => onChange(undefined)}
        >
          不限
        </span>
        {items.map((item) => (
          <span
            key={item.key}
            className="inline-block px-3 py-1 text-sm rounded cursor-pointer transition-colors hover:bg-blue-50"
            style={{
              background: value === item.key ? '#2563EB' : 'transparent',
              color: value === item.key ? '#fff' : '#334155',
              fontWeight: value === item.key ? 500 : 400,
            }}
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
  return (
    <div className="flex items-start py-2.5 border-b" style={{ borderColor: '#F1F5F9' }}>
      <span
        className="shrink-0 text-sm font-medium mr-4 mt-0.5"
        style={{ color: '#64748B', width: 70 }}
      >
        院校特色
      </span>
      <div className="flex flex-wrap gap-1.5">
        <span
          className="inline-block px-3 py-1 text-sm rounded cursor-pointer transition-colors"
          style={{
            background:
              !filters.is985 && !filters.is211 && !filters.isDoubleFirstClass
                ? '#2563EB'
                : 'transparent',
            color:
              !filters.is985 && !filters.is211 && !filters.isDoubleFirstClass
                ? '#fff'
                : '#64748B',
            fontWeight:
              !filters.is985 && !filters.is211 && !filters.isDoubleFirstClass ? 500 : 400,
          }}
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
              className="inline-block px-3 py-1 text-sm rounded cursor-pointer transition-colors hover:bg-blue-50"
              style={{
                background: active ? '#2563EB' : 'transparent',
                color: active ? '#fff' : '#334155',
                fontWeight: active ? 500 : 400,
              }}
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
  const tags: { label: string; color: string }[] = [];
  if (uni.is985) tags.push({ label: '985', color: '#DC2626' });
  if (uni.is211) tags.push({ label: '211', color: '#EA580C' });
  if (uni.isDoubleFirstClass) tags.push({ label: '双一流', color: '#2563EB' });

  const admission = uni.latestAdmission;
  const infoItems = [uni.province, uni.city, uni.type, uni.runningNature].filter(Boolean);

  return (
    <div
      className="bg-white rounded-xl p-5 border transition-all hover:shadow-md cursor-pointer"
      style={{ borderColor: '#E2E8F0' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href={`/universities/${uni.id}`}
              className="text-base font-semibold hover:underline truncate"
              style={{ color: '#0F172A' }}
            >
              {uni.name}
            </Link>
            {tags.map((t) => (
              <Tag
                key={t.label}
                color={t.color}
                className="text-xs"
                style={{ margin: 0, borderRadius: 4, lineHeight: '20px', padding: '0 6px' }}
              >
                {t.label}
              </Tag>
            ))}
          </div>

          <div className="flex items-center gap-1 text-xs mb-3" style={{ color: '#94A3B8' }}>
            <EnvironmentOutlined />
            <span>{infoItems.join(' / ') || '-'}</span>
          </div>

          {/* 标签展示 */}
          {uni.tags && Array.isArray(uni.tags) && uni.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {(uni.tags as string[]).slice(0, 6).map((tag: string) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: '#F1F5F9', color: '#64748B' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 右侧数据 */}
        <div className="flex items-center gap-6 shrink-0 ml-4">
          {uni.ranking && (
            <div className="text-center">
              <div className="text-xs mb-1" style={{ color: '#94A3B8' }}>
                <RiseOutlined className="mr-1" />排名
              </div>
              <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                {uni.ranking}
              </div>
            </div>
          )}
          {admission && (
            <div className="text-center">
              <div className="text-xs mb-1" style={{ color: '#94A3B8' }}>最低分/位次</div>
              <div className="text-sm">
                <span className="font-semibold" style={{ color: '#2563EB' }}>
                  {admission.minScore || '-'}
                </span>
                <span style={{ color: '#CBD5E1' }}> / </span>
                <span style={{ color: '#64748B' }}>{admission.minRank || '-'}</span>
              </div>
            </div>
          )}
          <Button
            type="text"
            size="small"
            icon={<StarOutlined />}
            style={{ color: '#CBD5E1' }}
          />
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
    <div
      className="bg-white rounded-xl border p-4"
      style={{ borderColor: '#E2E8F0' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <FireOutlined style={{ color: '#F97316', fontSize: 16 }} />
        <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>
          热门院校排名
        </span>
      </div>
      <div className="space-y-3">
        {(Array.isArray(list) ? list : []).slice(0, 10).map((uni: any, idx: number) => (
          <Link
            key={uni.id}
            href={`/universities/${uni.id}`}
            className="flex items-center gap-3 group no-underline"
          >
            <span
              className="w-5 h-5 rounded text-xs flex items-center justify-center font-semibold shrink-0"
              style={{
                background: idx < 3 ? '#F97316' : '#F1F5F9',
                color: idx < 3 ? '#fff' : '#94A3B8',
              }}
            >
              {idx + 1}
            </span>
            <span
              className="text-sm truncate group-hover:underline"
              style={{ color: '#334155' }}
            >
              {uni.name}
            </span>
          </Link>
        ))}
        {(!Array.isArray(list) || list.length === 0) && (
          <div className="text-xs text-center py-4" style={{ color: '#CBD5E1' }}>
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
      <div className="mb-5">
        <h2 className="text-xl font-bold mb-1" style={{ color: '#0F172A' }}>
          院校库
        </h2>
        <p className="text-sm" style={{ color: '#64748B' }}>
          查找全国高校，了解院校详情
        </p>
      </div>

      {/* 筛选区域 */}
      <div
        className="bg-white rounded-xl border p-5 mb-5"
        style={{ borderColor: '#E2E8F0' }}
      >
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
        <div className="flex items-start py-2.5" style={{ borderColor: '#F1F5F9' }}>
          <span
            className="shrink-0 text-sm font-medium mr-4 mt-0.5"
            style={{ color: '#64748B', width: 70 }}
          >
            院校性质
          </span>
          <div className="flex flex-wrap gap-1.5 items-center">
            {natureItems.map((item) => (
              <span
                key={item.key}
                className="inline-block px-3 py-1 text-sm rounded cursor-pointer transition-colors hover:bg-blue-50"
                style={{
                  background: filters.nature === item.key ? '#2563EB' : 'transparent',
                  color: filters.nature === item.key ? '#fff' : '#334155',
                  fontWeight: filters.nature === item.key ? 500 : 400,
                }}
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
            <span style={{ color: '#E2E8F0', margin: '0 4px' }}>|</span>
            {levelItems.map((item) => (
              <span
                key={item.key}
                className="inline-block px-3 py-1 text-sm rounded cursor-pointer transition-colors hover:bg-blue-50"
                style={{
                  background: filters.level === item.key ? '#2563EB' : 'transparent',
                  color: filters.level === item.key ? '#fff' : '#334155',
                  fontWeight: filters.level === item.key ? 500 : 400,
                }}
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
      <div className="flex gap-5">
        {/* 左侧列表 */}
        <div className="flex-1 min-w-0">
          {/* 搜索栏 + 结果数 */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm" style={{ color: '#64748B' }}>
              共 <span className="font-semibold" style={{ color: '#2563EB' }}>{total}</span> 条
            </div>
            <Input
              placeholder="搜索院校名称"
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              value={filters.keyword}
              onChange={(e) =>
                setFilters({ ...filters, keyword: e.target.value, page: 1 })
              }
              allowClear
              style={{ width: 240 }}
            />
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
            <div className="bg-white rounded-xl border p-12" style={{ borderColor: '#E2E8F0' }}>
              <Empty description="暂无匹配的院校" />
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
