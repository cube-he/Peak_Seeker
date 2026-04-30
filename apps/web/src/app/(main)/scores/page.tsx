'use client';

import { useState } from 'react';
import {
  Form,
  InputNumber,
  Select,
  Table,
  Tag,
} from 'antd';
import {
  SearchOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import StatCard from '@/components/ui/StatCard';
import ExpandedAdmissionRow from './ExpandedAdmissionRow';
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
  YearlyAdmissionData,
} from '@volunteer-helper/shared';

const { Option } = Select;

// 取最佳可用分数：majorMinScore 优先，groupMinScore 兜底
function getBestScore(yd: YearlyAdmissionData): number | null {
  return yd.majorMinScore ?? yd.groupMinScore ?? null;
}

function getBestRank(yd: YearlyAdmissionData): number | null {
  return yd.majorMinRank ?? yd.groupMinRank ?? null;
}

// 渲染近3年趋势（数字 + 涨跌箭头）
function TrendCell({
  yearlyData,
  getValue,
  reverse = false,
}: {
  yearlyData: YearlyAdmissionData[];
  getValue: (yd: YearlyAdmissionData) => number | null;
  reverse?: boolean; // true = 数值变小是好事（位次）
}) {
  const sorted = [...yearlyData].sort((a, b) => b.year - a.year);
  const recent = sorted.slice(0, 3);

  if (recent.length === 0) return <span className="text-text-faint">-</span>;

  const values = recent.map((yd) => getValue(yd));
  const latestVal = values.find((v) => v != null);
  const prevVal = values.length >= 2 ? values.slice(1).find((v) => v != null) : null;

  if (latestVal == null) return <span className="text-text-faint">-</span>;

  let trendIcon = null;
  if (prevVal != null) {
    const diff = latestVal - prevVal;
    if (diff > 0) {
      const isGood = reverse;
      trendIcon = (
        <ArrowUpOutlined
          className={`text-xs ml-1 ${isGood ? 'text-safe' : 'text-rush'}`}
        />
      );
    } else if (diff < 0) {
      const isGood = !reverse;
      trendIcon = (
        <ArrowDownOutlined
          className={`text-xs ml-1 ${isGood ? 'text-safe' : 'text-rush'}`}
        />
      );
    } else {
      trendIcon = <MinusOutlined className="text-xs ml-1 text-text-faint" />;
    }
  }

  return (
    <div className="flex items-center justify-end">
      <span className="[font-variant-numeric:tabular-nums] text-text-secondary text-xs">
        {recent
          .map((yd) => {
            const v = getValue(yd);
            return v != null ? (v > 999 ? v.toLocaleString() : String(v)) : '-';
          })
          .join(' → ')}
      </span>
      {trendIcon}
    </div>
  );
}

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
    examInfo.subjects || undefined,
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

  const columns = [
    {
      title: '院校',
      key: 'university',
      width: 200,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <div>
          <Link
            href={`/universities/${record.university.id}`}
            className="font-medium text-primary hover:text-primary-light hover:underline transition-colors"
          >
            {record.university.name}
          </Link>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-text-muted">
              {record.university.province}
            </span>
            {record.university.runningNature && record.university.runningNature !== '公办' && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0 text-[10px] leading-4 px-1.5">
                {record.university.runningNature}
              </Tag>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {record.university.is985 && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0 text-[10px] leading-4 px-1.5">
                985
              </Tag>
            )}
            {record.university.is211 && (
              <Tag className="rounded-full border-0 bg-primary-fixed text-primary m-0 text-[10px] leading-4 px-1.5">
                211
              </Tag>
            )}
            {record.university.isDoubleFirstClass && (
              <Tag className="rounded-full border-0 bg-safe-fixed text-safe m-0 text-[10px] leading-4 px-1.5">
                双一流
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '专业',
      key: 'major',
      width: 180,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <div>
          <Link
            href={`/majors/${record.major.id}`}
            className="text-text hover:text-primary transition-colors"
          >
            {record.majorName}
          </Link>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-text-muted">{record.major.category}</span>
            {record.major.softRating && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0 text-[10px] leading-4 px-1.5">
                {record.major.softRating}
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '批次',
      dataIndex: 'batch',
      key: 'batch',
      width: 100,
      render: (val: string) => (
        <span className="text-xs text-text-secondary">{val}</span>
      ),
    },
    {
      title: '近3年最低分',
      key: 'scoreTrend',
      width: 150,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <TrendCell yearlyData={record.yearlyData} getValue={getBestScore} />
      ),
    },
    {
      title: '近3年最低位次',
      key: 'rankTrend',
      width: 160,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <TrendCell yearlyData={record.yearlyData} getValue={getBestRank} reverse />
      ),
    },
    {
      title: '计划',
      key: 'planCount',
      width: 60,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <span className="[font-variant-numeric:tabular-nums]">
          {record.currentPlan?.planCount ?? '-'}
        </span>
      ),
    },
    {
      title: '学费',
      key: 'tuition',
      width: 70,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <span className="text-xs text-text-secondary [font-variant-numeric:tabular-nums]">
          {record.currentPlan?.tuition
            ? `${(record.currentPlan.tuition / 1000).toFixed(0)}k`
            : '-'}
        </span>
      ),
    },
  ];

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

          {/* 结果表格 */}
          <div className="bg-surface rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-sans font-semibold text-text text-sm">
                查询结果
                {result && (
                  <span className="text-text-muted font-normal ml-2">
                    共 {result.pagination.total} 个院校专业组合
                  </span>
                )}
              </span>
            </div>
            <Table
              columns={columns}
              dataSource={result?.data ?? []}
              rowKey={(record: AggregatedAdmissionItem) =>
                `${record.university.id}:${record.majorCode}:${record.groupCode}:${record.batch}`
              }
              loading={isLoading}
              expandable={{
                expandedRowRender: (record: AggregatedAdmissionItem) => (
                  <ExpandedAdmissionRow
                    yearlyData={record.yearlyData}
                    currentPlan={record.currentPlan}
                  />
                ),
              }}
              pagination={{
                current: currentPage,
                pageSize: currentPageSize,
                total: result?.pagination.total ?? 0,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                onChange: (p, ps) => {
                  setCurrentPage(p);
                  setCurrentPageSize(ps);
                },
              }}
              size="small"
              className="zhiyuanjia-table"
              scroll={{ x: 920 }}
            />
          </div>
        </div>
      </div>

      {/* 表格样式覆盖 */}
      <style jsx global>{`
        .zhiyuanjia-table .ant-table {
          background: transparent;
        }
        .zhiyuanjia-table .ant-table-thead > tr > th {
          background: var(--color-surface-dim) !important;
          border-bottom: 1px solid var(--color-border-subtle) !important;
          color: var(--color-text-secondary) !important;
          font-weight: 600;
          font-size: 13px;
        }
        .zhiyuanjia-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid var(--color-border-subtle) !important;
        }
        .zhiyuanjia-table .ant-table-tbody > tr:hover > td {
          background: var(--color-surface-dim) !important;
        }
        .zhiyuanjia-table .ant-table-expanded-row > td {
          background: var(--color-surface-dim) !important;
        }
      `}</style>
    </MainLayout>
  );
}
