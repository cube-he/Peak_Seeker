'use client';

import { useState } from 'react';
import { Empty, Form, InputNumber, Pagination, Select, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import AdmissionRow from '@/components/admission/AdmissionRow';
import LowConfidenceBanner from '@/components/admission/LowConfidenceBanner';
import StatCard from '@/components/ui/StatCard';
import { admissionService } from '@/services/admission';
import { useUserStore } from '@/stores/userStore';
import {
  ADMISSION_BATCHES,
  ADMISSION_SUBJECTS,
  PROVINCES,
  RECRUIT_TYPES,
} from '@volunteer-helper/shared';
import type {
  AggregatedAdmissionItem,
  AggregatedAdmissionQuery,
} from '@volunteer-helper/shared';

const { Option } = Select;

type SearchMode = 'score' | 'rank';
type FeatureFilters = {
  is985?: boolean;
  is211?: boolean;
  isDoubleFirstClass?: boolean;
};

function FilterRow({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-[56px] shrink-0 pt-1 text-xs text-text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={`rounded-full border-0 px-2.5 py-1 text-xs transition-colors ${
            !value ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-primary-fixed hover:text-primary'
          }`}
          onClick={() => onChange(undefined)}
        >
          不限
        </button>
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`rounded-full border-0 px-2.5 py-1 text-xs transition-colors ${
              value === item.value ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-primary-fixed hover:text-primary'
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

function FeatureFilterRow({
  features,
  onChange,
}: {
  features: FeatureFilters;
  onChange: (features: FeatureFilters) => void;
}) {
  const noneActive = !features.is985 && !features.is211 && !features.isDoubleFirstClass;
  const items: Array<{ key: keyof FeatureFilters; label: string }> = [
    { key: 'is985', label: '985' },
    { key: 'is211', label: '211' },
    { key: 'isDoubleFirstClass', label: '双一流' },
  ];

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-[56px] shrink-0 pt-1 text-xs text-text-muted">层次</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={`rounded-full border-0 px-2.5 py-1 text-xs transition-colors ${
            noneActive ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-primary-fixed hover:text-primary'
          }`}
          onClick={() => onChange({})}
        >
          不限
        </button>
        {items.map((item) => {
          const active = !!features[item.key];
          return (
            <button
              key={item.key}
              type="button"
              className={`rounded-full border-0 px-2.5 py-1 text-xs transition-colors ${
                active ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-primary-fixed hover:text-primary'
              }`}
              onClick={() => onChange({ ...features, [item.key]: active ? undefined : true })}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModeCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-all ${
        active
          ? 'border-primary bg-primary-fixed shadow-[0_0_0_3px_rgba(30,58,95,0.06)]'
          : 'border-border bg-surface hover:border-primary hover:text-primary'
      }`}
    >
      <div className={`font-serif text-base font-semibold ${active ? 'text-primary' : 'text-text'}`}>{title}</div>
      <div className="mt-1 text-xs text-text-muted">{description}</div>
    </button>
  );
}

export default function ScoresPage() {
  const [form] = Form.useForm();
  const { examInfo } = useUserStore();
  const [searchMode, setSearchMode] = useState<SearchMode>('score');
  const [queryParams, setQueryParams] = useState<AggregatedAdmissionQuery | null>(null);
  const [filterBatch, setFilterBatch] = useState<string | undefined>();
  const [filterSubjects, setFilterSubjects] = useState<string | undefined>(
    examInfo.subjects?.length ? examInfo.subjects.join(',') : undefined,
  );
  const [filterRecruitType, setFilterRecruitType] = useState<string | undefined>();
  const [featureFilters, setFeatureFilters] = useState<FeatureFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(20);

  const province = examInfo.province || '四川';
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
    queryKey: ['admission-stats', province],
    queryFn: () => admissionService.getStatistics(province),
  });

  const switchMode = (mode: SearchMode) => {
    setSearchMode(mode);
    form.setFieldValue('range', mode === 'score' ? 20 : 5000);
  };

  const handleSearch = (values: any) => {
    const params: AggregatedAdmissionQuery = {
      province: values.province,
      range: values.range || (searchMode === 'score' ? 20 : 5000),
    };
    if (searchMode === 'score') {
      params.score = values.score;
    } else {
      params.rank = values.rank;
    }
    setQueryParams(params);
    setCurrentPage(1);
  };

  const handleFilterChange = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setCurrentPage(1);
  };

  const previewPrimary = queryParams?.score ?? queryParams?.rank ?? examInfo.score ?? examInfo.rank ?? '--';
  const previewMode = queryParams?.rank ? '位次' : '分数';
  const previewRange = queryParams?.range ?? (searchMode === 'score' ? 20 : 5000);

  return (
    <MainLayout>
      <div className="pb-12">
        <div className="mx-auto mb-7 max-w-[720px] text-center">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            Score To Admission · 查分系统
          </div>
          <h1 className="m-0 font-serif text-[34px] font-semibold leading-tight text-text sm:text-[40px]">
            从分数到院校专业组
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text-tertiary">
            输入你的分数或位次，查询历史录取数据，并按批次、科目、招生类型继续缩小范围。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
          <section className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[1.4px] text-accent">Step 01</div>
            <h2 className="m-0 font-serif text-[22px] font-semibold text-text">选择查询方式</h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ModeCard
                active={searchMode === 'score'}
                title="按分数查"
                description="适合先估算区间，再看可触达院校"
                onClick={() => switchMode('score')}
              />
              <ModeCard
                active={searchMode === 'rank'}
                title="按位次查"
                description="更适合正式成绩发布后的志愿排序"
                onClick={() => switchMode('rank')}
              />
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSearch}
              className="mt-6"
              initialValues={{
                province,
                score: examInfo.score,
                rank: examInfo.rank,
                range: 20,
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Form.Item
                  name="province"
                  label={<span className="text-sm font-medium text-text-secondary">省份</span>}
                  rules={[{ required: true }]}
                >
                  <Select size="large">
                    {PROVINCES.map((item) => (
                      <Option key={item.code} value={item.name}>
                        {item.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="range"
                  label={<span className="text-sm font-medium text-text-secondary">浮动范围</span>}
                >
                <InputNumber
                  min={1}
                  className="w-full"
                  size="large"
                  style={{ width: '100%' }}
                  placeholder={searchMode === 'score' ? '如 20 分' : '如 5000 位'}
                />
                </Form.Item>
              </div>

              <Form.Item
                name={searchMode === 'score' ? 'score' : 'rank'}
                label={
                  <span className="flex items-center justify-between text-sm font-medium text-text-secondary">
                    {searchMode === 'score' ? '总分' : '位次'}
                  </span>
                }
                rules={[{ required: true, message: searchMode === 'score' ? '请输入分数' : '请输入位次' }]}
              >
                <InputNumber
                  min={searchMode === 'score' ? 0 : 1}
                  max={searchMode === 'score' ? 750 : undefined}
                  className="w-full [&_.ant-input-number-input]:!h-[72px] [&_.ant-input-number-input]:!text-center [&_.ant-input-number-input]:!font-serif [&_.ant-input-number-input]:!text-[42px] [&_.ant-input-number-input]:!font-semibold [&_.ant-input-number-input]:!text-primary"
                  style={{ width: '100%' }}
                  placeholder={searchMode === 'score' ? '628' : '1654'}
                />
              </Form.Item>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-br from-primary to-primary-light text-sm font-semibold text-white shadow-glow-primary transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SearchOutlined />
                {isLoading ? '查询中...' : '查询院校专业组'}
              </button>
            </Form>
          </section>

          <aside className="rounded-2xl bg-surface p-6 shadow-card lg:sticky lg:top-20">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[1.4px] text-accent">Step 02</div>
            <h2 className="m-0 font-serif text-[20px] font-semibold text-text">实时查询预览</h2>

            <div className="border-b border-border-subtle py-6 text-center">
              <div className="font-serif text-[64px] font-bold leading-none text-primary tabular-nums">
                {previewPrimary}
              </div>
              <div className="mt-2 text-xs text-text-muted">
                {previewMode} · {queryParams?.province || province}
              </div>
            </div>

            <div className="space-y-3 border-b border-border-subtle py-5 text-sm">
              <div className="flex justify-between text-text-tertiary">
                <span>查询范围</span>
                <span className="font-serif font-semibold text-text tabular-nums">
                  ±{previewRange}{queryParams?.rank ? ' 位' : ' 分'}
                </span>
              </div>
              <div className="flex justify-between text-text-tertiary">
                <span>结果数量</span>
                <span className="font-serif font-semibold text-accent tabular-nums">
                  {result?.pagination?.total ?? '--'}
                </span>
              </div>
              <div className="flex justify-between text-text-tertiary">
                <span>低置信提醒</span>
                <span className="font-serif font-semibold text-text">
                  {result?.data?.some((item: AggregatedAdmissionItem) => item.predictedMinRank?.confidence === 'low') ? '有' : '暂无'}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-rush-fixed px-2 py-3 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[1.3px] text-rush">冲</div>
                <div className="mt-1 font-serif text-lg font-semibold text-rush">+20</div>
              </div>
              <div className="rounded-lg bg-accent-fixed px-2 py-3 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[1.3px] text-accent">稳</div>
                <div className="mt-1 font-serif text-lg font-semibold text-accent">±10</div>
              </div>
              <div className="rounded-lg bg-safe-fixed px-2 py-3 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[1.3px] text-safe">保</div>
                <div className="mt-1 font-serif text-lg font-semibold text-safe">-20</div>
              </div>
            </div>
          </aside>
        </div>

        {statistics && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <StatCard label="数据总量" value={statistics._count ?? '-'} accentColor="primary" />
            <StatCard label="最高分" value={statistics._max?.majorMinScore || '-'} accentColor="rush" />
            <StatCard
              label="平均分"
              value={statistics._avg?.majorMinScore ? Math.round(statistics._avg.majorMinScore) : '-'}
              accentColor="accent"
            />
            <StatCard label="最低分" value={statistics._min?.majorMinScore || '-'} accentColor="safe" />
          </div>
        )}

        <section className="mt-6 rounded-2xl bg-surface p-5 shadow-card sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-[1.4px] text-accent">Step 03</div>
              <h2 className="m-0 font-serif text-[22px] font-semibold text-text">查询结果</h2>
            </div>
            {result && (
              <span className="text-sm text-text-tertiary">
                共 <strong className="font-serif text-text tabular-nums">{result.pagination.total}</strong> 个院校专业组合
              </span>
            )}
          </div>

          {queryParams && (
            <div className="mb-4 rounded-xl bg-bg px-4 py-2">
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
              <FeatureFilterRow features={featureFilters} onChange={handleFilterChange(setFeatureFilters)} />
            </div>
          )}

          <LowConfidenceBanner
            show={!!result?.data?.some((item: AggregatedAdmissionItem) => item.predictedMinRank?.confidence === 'low')}
          />

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spin size="large" />
            </div>
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
            <div className="py-12">
              <Empty description="未找到符合条件的院校" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-bg py-12 text-center text-text-muted">
              输入分数或位次后，这里会展示可参考的院校专业组。
            </div>
          )}

          {result && result.pagination.total > 0 && (
            <div className="mt-6 flex justify-center">
              <Pagination
                current={currentPage}
                pageSize={currentPageSize}
                total={result.pagination.total}
                showSizeChanger
                showQuickJumper
                showTotal={(total) => `共 ${total} 条`}
                onChange={(page, pageSize) => {
                  setCurrentPage(page);
                  setCurrentPageSize(pageSize);
                }}
              />
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-surface p-5 shadow-card sm:p-6">
          <h2 className="m-0 font-serif text-[20px] font-semibold text-text">同位次跨年对比</h2>
          <p className="m-0 mt-2 text-sm leading-relaxed text-text-tertiary">
            设计稿中的跨年等位分表需要按位次查询一分一段历史数据。当前页面保留后端已有的录取聚合查询，等位分趋势表先作为后续接口接入项。
          </p>
        </section>
      </div>
    </MainLayout>
  );
}
