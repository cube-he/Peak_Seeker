'use client';

import { useState } from 'react';
import {
  Form,
  InputNumber,
  Select,
  Table,
  Tag,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import StatCard from '@/components/ui/StatCard';
import { admissionService } from '@/services/admission';
import { useUserStore } from '@/stores/userStore';
import { PROVINCES } from '@volunteer-helper/shared';

const { Option } = Select;

export default function ScoresPage() {
  const [form] = Form.useForm();
  const { examInfo } = useUserStore();
  const [searchMode, setSearchMode] = useState<'score' | 'rank'>('score');
  const [results, setResults] = useState<any[]>([]);

  const searchByScore = useMutation({
    mutationFn: admissionService.getByScore,
    onSuccess: (data) => setResults(data),
  });

  const searchByRank = useMutation({
    mutationFn: admissionService.getByRank,
    onSuccess: (data) => setResults(data),
  });

  const { data: statistics } = useQuery({
    queryKey: ['admission-stats', examInfo.province],
    queryFn: () => admissionService.getStatistics(examInfo.province || '四川'),
    enabled: !!examInfo.province,
  });

  const handleSearch = (values: any) => {
    if (searchMode === 'score') {
      searchByScore.mutate({
        score: values.score,
        province: values.province,
        year: values.year,
        range: values.range || 20,
      });
    } else {
      searchByRank.mutate({
        rank: values.rank,
        province: values.province,
        year: values.year,
        range: values.range || 5000,
      });
    }
  };

  const columns = [
    {
      title: '院校',
      key: 'university',
      render: (_: any, record: any) => (
        <div>
          <Link href={`/universities/${record.universityId}`} className="font-medium text-primary hover:text-primary-light hover:underline transition-colors">
            {record.university?.name}
          </Link>
          <div className="text-xs text-text-muted">{record.university?.province}</div>
        </div>
      ),
    },
    {
      title: '专业',
      key: 'major',
      render: (_: any, record: any) => (
        <div>
          <Link href={`/majors/${record.majorId}`} className="text-text hover:text-primary transition-colors">
            {record.major?.name}
          </Link>
          <div className="text-xs text-text-muted">{record.major?.category}</div>
        </div>
      ),
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 70 },
    {
      title: '最低分',
      dataIndex: 'majorMinScore',
      key: 'majorMinScore',
      width: 80,
      sorter: (a: any, b: any) => (a.majorMinScore || 0) - (b.majorMinScore || 0),
      render: (val: number) => val ? <span className="font-semibold text-text [font-variant-numeric:tabular-nums]">{val}</span> : '-',
    },
    {
      title: '最低位次',
      dataIndex: 'majorMinRank',
      key: 'majorMinRank',
      width: 100,
      sorter: (a: any, b: any) => (a.majorMinRank || 0) - (b.majorMinRank || 0),
      render: (val: number) => val ? <span className="text-text-secondary [font-variant-numeric:tabular-nums]">{val.toLocaleString()}</span> : '-',
    },
    {
      title: '录取人数',
      dataIndex: 'majorAdmissionCount',
      key: 'majorAdmissionCount',
      width: 80,
      render: (val: number) => val ? <span className="[font-variant-numeric:tabular-nums]">{val}</span> : '-',
    },
    {
      title: '标签',
      key: 'tags',
      width: 150,
      render: (_: any, record: any) => (
        <div className="flex flex-wrap gap-1">
          {record.university?.is985 && (
            <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0">985</Tag>
          )}
          {record.university?.is211 && (
            <Tag className="rounded-full border-0 bg-primary-fixed text-primary m-0">211</Tag>
          )}
          {record.university?.isDoubleFirstClass && (
            <Tag className="rounded-full border-0 bg-safe-fixed text-safe m-0">双一流</Tag>
          )}
        </div>
      ),
    },
  ];

  const isLoading = searchByScore.isPending || searchByRank.isPending;

  return (
    <MainLayout>
      {/* Page Title */}
      <div className="mb-8">
        <h2 className="font-serif text-[22px] sm:text-[28px] font-semibold text-text mb-1">分数线查询</h2>
        <p className="text-[15px] text-text-tertiary">按分数或位次查询历年录取数据</p>
      </div>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Sidebar */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-24">
          <div className="bg-surface rounded-xl p-6">
            <h3 className="text-sm font-sans font-semibold text-text mb-5">查询条件</h3>

            {/* Mode Toggle */}
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
                year: 2024,
                range: searchMode === 'score' ? 20 : 5000,
              }}
            >
              <Form.Item
                name="province"
                label={<span className="text-sm text-text-secondary font-medium">省份</span>}
                rules={[{ required: true }]}
              >
                <Select>
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              {searchMode === 'score' ? (
                <Form.Item
                  name="score"
                  label={<span className="text-sm text-text-secondary font-medium">分数</span>}
                  rules={[{ required: true, message: '请输入分数' }]}
                >
                  <InputNumber min={0} max={750} className="w-full" placeholder="输入分数" />
                </Form.Item>
              ) : (
                <Form.Item
                  name="rank"
                  label={<span className="text-sm text-text-secondary font-medium">位次</span>}
                  rules={[{ required: true, message: '请输入位次' }]}
                >
                  <InputNumber min={1} className="w-full" placeholder="输入位次" />
                </Form.Item>
              )}

              <Form.Item
                name="year"
                label={<span className="text-sm text-text-secondary font-medium">年份</span>}
              >
                <Select>
                  <Option value={2024}>2024</Option>
                  <Option value={2023}>2023</Option>
                  <Option value={2022}>2022</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="range"
                label={<span className="text-sm text-text-secondary font-medium">浮动范围</span>}
              >
                <InputNumber
                  min={1}
                  className="w-full"
                  placeholder={searchMode === 'score' ? '分数浮动范围' : '位次浮动范围'}
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

        {/* Right Content */}
        <div className="flex-1 min-w-0">
          {/* Statistics Cards */}
          {statistics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
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
                value={statistics._avg?.majorMinScore ? Math.round(statistics._avg.majorMinScore) : '-'}
                accentColor="accent"
              />
              <StatCard
                label="最低分"
                value={statistics._min?.majorMinScore || '-'}
                accentColor="safe"
              />
            </div>
          )}

          {/* Results Table */}
          <div className="bg-surface rounded-xl overflow-hidden overflow-x-auto">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-sans font-semibold text-text text-sm">
                查询结果 ({results.length} 条)
              </span>
            </div>
            <Table
              columns={columns}
              dataSource={results}
              rowKey="id"
              loading={isLoading}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              size="small"
              className="zhiyuanjia-table"
              rowClassName={(record: any) =>
                record.isUserPosition ? 'zhiyuanjia-highlight-row' : ''
              }
            />
          </div>
        </div>
      </div>

      {/* Table styling overrides */}
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
        .zhiyuanjia-highlight-row > td {
          background: #ebf4ff !important;
        }
        .zhiyuanjia-highlight-row:hover > td {
          background: #ebf4ff !important;
        }
      `}</style>
    </MainLayout>
  );
}
