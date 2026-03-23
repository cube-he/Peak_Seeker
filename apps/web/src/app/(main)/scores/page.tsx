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
          <Link href={`/universities/${record.universityId}`} className="font-medium text-primary hover:underline">
            {record.university?.name}
          </Link>
          <div className="text-xs text-on-surface-variant">{record.university?.province}</div>
        </div>
      ),
    },
    {
      title: '专业',
      key: 'major',
      render: (_: any, record: any) => (
        <div>
          <Link href={`/majors/${record.majorId}`} className="text-on-surface hover:text-primary transition-colors">
            {record.major?.name}
          </Link>
          <div className="text-xs text-on-surface-variant">{record.major?.category}</div>
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
      render: (val: number) => val ? <span className="font-semibold text-on-surface">{val}</span> : '-',
    },
    {
      title: '最低位次',
      dataIndex: 'majorMinRank',
      key: 'majorMinRank',
      width: 100,
      sorter: (a: any, b: any) => (a.majorMinRank || 0) - (b.majorMinRank || 0),
      render: (val: number) => val ? <span className="text-on-surface-variant">{val.toLocaleString()}</span> : '-',
    },
    {
      title: '录取人数',
      dataIndex: 'majorAdmissionCount',
      key: 'majorAdmissionCount',
      width: 80,
      render: (val: number) => val || '-',
    },
    {
      title: '标签',
      key: 'tags',
      width: 150,
      render: (_: any, record: any) => (
        <div className="flex flex-wrap gap-1">
          {record.university?.is985 && (
            <Tag className="rounded-full border-0 bg-tertiary-fixed text-on-tertiary-fixed-variant m-0">985</Tag>
          )}
          {record.university?.is211 && (
            <Tag className="rounded-full border-0 bg-primary-fixed text-on-primary-fixed-variant m-0">211</Tag>
          )}
          {record.university?.isDoubleFirstClass && (
            <Tag className="rounded-full border-0 bg-secondary-fixed text-on-secondary-fixed-variant m-0">双一流</Tag>
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
        <h2 className="text-xl font-headline font-extrabold text-on-surface mb-1">分数线查询</h2>
        <p className="text-sm text-on-surface-variant">按分数或位次查询历年录取数据</p>
      </div>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex gap-6 items-start">
        {/* Left Sidebar */}
        <div className="w-80 shrink-0 sticky top-24">
          <div className="bg-surface-container-lowest rounded-xl p-6">
            <h3 className="text-sm font-headline font-semibold text-on-surface mb-5">查询条件</h3>

            {/* Mode Toggle */}
            <div className="flex gap-2 mb-6">
              <button
                className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-300 border-0 cursor-pointer ${
                  searchMode === 'score'
                    ? 'bg-primary text-on-primary shadow-glow-primary'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
                onClick={() => setSearchMode('score')}
              >
                按分数查
              </button>
              <button
                className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-300 border-0 cursor-pointer ${
                  searchMode === 'rank'
                    ? 'bg-primary text-on-primary shadow-glow-primary'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
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
                label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">省份</span>}
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
                  label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">分数</span>}
                  rules={[{ required: true, message: '请输入分数' }]}
                >
                  <InputNumber min={0} max={750} className="w-full" placeholder="输入分数" />
                </Form.Item>
              ) : (
                <Form.Item
                  name="rank"
                  label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">位次</span>}
                  rules={[{ required: true, message: '请输入位次' }]}
                >
                  <InputNumber min={1} className="w-full" placeholder="输入位次" />
                </Form.Item>
              )}

              <Form.Item
                name="year"
                label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">年份</span>}
              >
                <Select>
                  <Option value={2024}>2024</Option>
                  <Option value={2023}>2023</Option>
                  <Option value={2022}>2022</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="range"
                label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">浮动范围</span>}
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
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-sm border-0 cursor-pointer flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
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
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard
                label="数据总量"
                value={statistics._count ?? '-'}
                accentColor="primary"
              />
              <StatCard
                label="最高分"
                value={statistics._max?.majorMinScore || '-'}
                accentColor="error"
              />
              <StatCard
                label="平均分"
                value={statistics._avg?.majorMinScore ? Math.round(statistics._avg.majorMinScore) : '-'}
                accentColor="primary"
              />
              <StatCard
                label="最低分"
                value={statistics._min?.majorMinScore || '-'}
                accentColor="secondary"
              />
            </div>
          )}

          {/* Results Table */}
          <div className="bg-surface-container-lowest rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-container-low">
              <span className="font-headline font-semibold text-on-surface text-sm">
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
              className="summit-table"
            />
          </div>
        </div>
      </div>

      {/* Table styling overrides */}
      <style jsx global>{`
        .summit-table .ant-table {
          background: transparent;
        }
        .summit-table .ant-table-thead > tr > th {
          background: #f3f3fe !important;
          border-bottom: 1px solid #ededf8 !important;
          color: #434654 !important;
          font-weight: 600;
          font-size: 13px;
        }
        .summit-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f3f3fe !important;
        }
        .summit-table .ant-table-tbody > tr:hover > td {
          background: #f3f3fe !important;
        }
      `}</style>
    </MainLayout>
  );
}
