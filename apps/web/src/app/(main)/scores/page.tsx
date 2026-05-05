'use client';

import { useState } from 'react';
import {
  Form,
  InputNumber,
  Pagination,
  Select,
  Spin,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import StatCard from '@/components/ui/StatCard';
import AdmissionRow from '@/components/admission/AdmissionRow';
import LowConfidenceBanner from '@/components/admission/LowConfidenceBanner';
import { admissionService } from '@/services/admission';
import { useUserStore } from '@/stores/userStore';
import {
  PROVINCES,
  ADMISSION_BATCHES,
  ADMISSION_SUBJECTS,
  RECRUIT_TYPES,
} from '@volunteer-helper/shared';
import type {
  AggregatedAdmissionItem,
  AggregatedAdmissionQuery,
} from '@volunteer-helper/shared';

const { Option } = Select;

// 筛选行组件（复用院校页模式）
function FilterRow({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string | undefined;
  onChange: (val: string | undefined) => void;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-xs text-text-muted w-[56px] shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
            !value
              ? 'bg-primary-fixed text-primary font-medium'
              : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
          }`}
          onClick={() => onChange(undefined)}
        >
          不限
        </button>
        {items.map((item) => (
          <button
            key={item.value}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
              value === item.value
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
            }`}
            onClick={() => onChange(value === item.value ? undefined : item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 院校特征多选过滤
function FeatureFilterRow({
  features,
  onChange,
}: {
  features: { is985?: boolean; is211?: boolean; isDoubleFirstClass?: boolean };
  onChange: (f: typeof features) => void;
}) {
  const toggleFeature = (key: keyof typeof features) => {
    onChange({ ...features, [key]: features[key] ? undefined : true });
  };
  const noneActive = !features.is985 && !features.is211 && !features.isDoubleFirstClass;
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-xs text-text-muted w-[56px] shrink-0 pt-1">层次</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
            noneActive
              ? 'bg-primary-fixed text-primary font-medium'
              : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
          }`}
          onClick={() => onChange({})}
        >
          不限
        </button>
        {[
          { key: 'is985' as const, label: '985' },
          { key: 'is211' as const, label: '211' },
          { key: 'isDoubleFirstClass' as const, label: '双一流' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
              features[key]
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
            }`}
            onClick={() => toggleFeature(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScoresPage() {
  const [form] = Form.useForm();
  const { examInfo } = useUserStore();
  const [searchMode, setSearchMode] = useState<'score' | 'rank'>('score');

  // 查询参数
  const [queryParams, setQueryParams] = useState<AggregatedAdmissionQuery | null>(null);

  // 过滤器状态
  const [filterBatch, setFilterBatch] = useState<string | undefined>();
  const [filterSubjects, setFilterSubjects] = useState<string | undefined>(
    examInfo.subjects?.length ? examInfo.subjects.join(',') : undefined,
  );
  const [filterRecruitType, setFilterRecruitType] = useState<string | undefined>();
  const [featureFilters, setFeatureFilters] = useState<{
    is985?: boolean;
    is211?: boolean;
    isDoubleFirstClass?: boolean;
  }>({});

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(20);

  // 构建完整查询参数
  const fullQuery: AggregatedAdmissionQuery | null = queryParams
    ? {
        ...queryParams,
        batch: filterBatch,
        subjects: filterSubjects,
        recruitType: filterRecruitType,
        ...featureFilters,
        page: currentPage,
        pageSize: currentPageSize,
      }
    : null;

  const { data: result, isLoading } = useQuery({
    queryKey: ['admission-aggregated', fullQuery],
    queryFn: () => admissionService.getAggregated(fullQuery!),
    enabled: !!fullQuery,
  });

  const { data: statistics } = useQuery({
    queryKey: ['admission-stats', examInfo.province],
    queryFn: () => admissionService.getStatistics(examInfo.province || '四川'),
    enabled: !!examInfo.province,
  });

  const handleSearch = (values: any) => {
    const params: AggregatedAdmissionQuery = {
      province: values.province,
      range: values.range,
    };
    if (searchMode === 'score') {
      params.score = values.score;
      if (!values.range) params.range = 20;
    } else {
      params.rank = values.rank;
      if (!values.range) params.range = 5000;
    }
    setQueryParams(params);
    setCurrentPage(1);
  };

  // 过滤器变更时重置分页
  const handleFilterChange = <T,>(setter: (v: T) => void) => (val: T) => {
    setter(val);
    setCurrentPage(1);
  };


  return (
    <MainLayout>
      {/* 页面标题 */}
      <div className="mb-6">
        <h2 className="font-serif text-[22px] sm:text-[28px] font-semibold text-text mb-1">
          分数线查询
        </h2>
        <p className="text-[15px] text-text-tertiary">
          按分数或位次查询历年录取数据，查看多年趋势
        </p>
      </div>

      {/* 主布局: 侧边栏 + 内容 */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* 左侧侧边栏 */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-24">
          <div className="bg-surface rounded-xl p-6">
            <h3 className="text-sm font-sans font-semibold text-text mb-5">
              查询条件
            </h3>

            {/* 模式切换 */}
            <div className="flex gap-2 mb-6">
              <button
                className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-300 border-0 cursor-pointer ${
                  searchMode === 'score'
                    ? 'bg-gradient-to-br from-primary to-primary-light text-white shadow-glow-primary'
                    : 'bg-surface-dim text-text-secondary hover:bg-border'
                }`}
                onClick={() => setSearchMode('score')}
              >
                按分数查
              </button>
              <button
                className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-300 border-0 cursor-pointer ${
                  searchMode === 'rank'
                    ? 'bg-gradient-to-br from-primary to-primary-light text-white shadow-glow-primary'
                    : 'bg-surface-dim text-text-secondary hover:bg-border'
                }`}
                onClick={() => setSearchMode('rank')}
              >
                按位次查
              </button>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSearch}
              initialValues={{
                province: examInfo.province || '四川',
                score: examInfo.score,
                rank: examInfo.rank,
                range: searchMode === 'score' ? 20 : 5000,
              }}
            >
              <Form.Item
                name="province"
                label={
                  <span className="text-sm text-text-secondary font-medium">
                    省份
                  </span>
                }
                rules={[{ required: true }]}
              >
                <Select>
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>
                      {p.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {searchMode === 'score' ? (
                <Form.Item
                  name="score"
                  label={
                    <span className="text-sm text-text-secondary font-medium">
                      分数
                    </span>
                  }
                  rules={[{ required: true, message: '请输入分数' }]}
                >
                  <InputNumber
                    min={0}
                    max={750}
                    className="w-full"
                    placeholder="输入分数"
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="rank"
                  label={
                    <span className="text-sm text-text-secondary font-medium">
                      位次
                    </span>
                  }
                  rules={[{ required: true, message: '请输入位次' }]}
                >
                  <InputNumber
                    min={1}
                    className="w-full"
                    placeholder="输入位次"
                  />
                </Form.Item>
              )}

              <Form.Item
                name="range"
                label={
                  <span className="text-sm text-text-secondary font-medium">
                    浮动范围
                  </span>
                }
              >
                <InputNumber
                  min={1}
                  className="w-full"
                  placeholder={
                    searchMode === 'score' ? '分数浮动范围' : '位次浮动范围'
                  }
                />
              </Form.Item>

              <Form.Item className="mb-0">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl bg-gradient-to-br from-primary to-primary-light text-white font-semibold text-sm border-0 cursor-pointer flex items-center justify-center gap-2 shadow-glow-primary transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <SearchOutlined />
                  {isLoading ? '查询中...' : '查询'}
                </button>
              </Form.Item>
            </Form>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 min-w-0">
          {/* 统计卡片 */}
          {statistics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
              <StatCard
                label="数据总量"
                value={statistics._count ?? '-'}
                accentColor="primary"
              />
              <StatCard
                label="最高分"
                value={statistics._max?.majorMinScore || '-'}
                accentColor="rush"
              />
              <StatCard
                label="平均分"
                value={
                  statistics._avg?.majorMinScore
                    ? Math.round(statistics._avg.majorMinScore)
                    : '-'
                }
                accentColor="accent"
              />
              <StatCard
                label="最低分"
                value={statistics._min?.majorMinScore || '-'}
                accentColor="safe"
              />
            </div>
          )}

          {/* 筛选条件 */}
          {queryParams && (
            <div className="bg-surface rounded-xl px-5 py-3 mb-4 space-y-0.5">
              <FilterRow
                label="科目"
                items={ADMISSION_SUBJECTS as unknown as { value: string; label: string }[]}
                value={filterSubjects}
                onChange={handleFilterChange(setFilterSubjects)}
              />
              <FilterRow
                label="批次"
                items={ADMISSION_BATCHES as unknown as { value: string; label: string }[]}
                value={filterBatch}
                onChange={handleFilterChange(setFilterBatch)}
              />
              <FilterRow
                label="类型"
                items={RECRUIT_TYPES as unknown as { value: string; label: string }[]}
                value={filterRecruitType}
                onChange={handleFilterChange(setFilterRecruitType)}
              />
              <FeatureFilterRow
                features={featureFilters}
                onChange={handleFilterChange(setFeatureFilters)}
              />
            </div>
          )}

          {/* 查询结果列表 */}
          <div>
            <div className="px-1 mb-3 flex items-center">
              <span className="font-sans font-semibold text-text text-sm">
                查询结果
                {result && (
                  <span className="text-text-muted font-normal ml-2">
                    共 {result.pagination.total} 个院校专业组合
                  </span>
                )}
              </span>
            </div>

            <LowConfidenceBanner
              show={!!result?.data?.some((item: AggregatedAdmissionItem) => item.predictedMinRank?.confidence === 'low')}
            />

            {isLoading ? (
              <div className="flex justify-center py-12"><Spin size="large" /></div>
            ) : result?.data && result.data.length > 0 ? (
              <div>
                {result.data.map((item: AggregatedAdmissionItem) => (
                  <AdmissionRow
                    key={`${item.university.id}:${item.majorCode}:${item.groupCode}:${item.batch}:${item.recruitType}`}
                    data={{
                      university: {
                        id: item.university.id,
                        name: item.university.name,
                        logoUrl: item.university.logoUrl,
                        is985: item.university.is985,
                        is211: item.university.is211,
                        isDoubleFirstClass: item.university.isDoubleFirstClass,
                      },
                      major: item.major ? { id: item.major.id, name: item.major.name } : null,
                      majorName: item.majorName,
                      groupCode: item.groupCode,
                      batch: item.batch,
                      recruitType: item.recruitType,
                      subjects: item.subjects,
                      predictedMinRank: item.predictedMinRank,
                    }}
                    userRank={examInfo.rank}
                  />
                ))}
              </div>
            ) : queryParams ? (
              <div className="text-center py-12 text-text-muted">未找到符合条件的院校</div>
            ) : (
              <div className="text-center py-12 text-text-muted">请输入分数或位次开始查询</div>
            )}

            {result && result.pagination.total > 0 && (
              <div className="flex justify-center mt-6">
                <Pagination
                  current={currentPage}
                  pageSize={currentPageSize}
                  total={result.pagination.total}
                  showSizeChanger
                  showQuickJumper
                  showTotal={(total) => `共 ${total} 条`}
                  onChange={(p, ps) => { setCurrentPage(p); setCurrentPageSize(ps); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

    </MainLayout>
  );
}
