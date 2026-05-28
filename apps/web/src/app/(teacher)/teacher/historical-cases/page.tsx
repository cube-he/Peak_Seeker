'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Input,
  Select,
  InputNumber,
  Table,
  Tag,
  Spin,
  Empty,
  Statistic,
  Row,
  Col,
} from 'antd';
import { historicalCasesApi, type HistoricalCaseListItem } from '@/services/historical-cases-api';

const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
};

export default function HistoricalCasesPage() {
  const [examYear, setExamYear] = useState<number | undefined>(2025);
  const [examType, setExamType] = useState<'PHYSICS' | 'HISTORY' | undefined>(undefined);
  const [scoreFrom, setScoreFrom] = useState<number | undefined>(undefined);
  const [scoreTo, setScoreTo] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: stats } = useQuery({
    queryKey: ['historical-stats', examYear],
    queryFn: () => historicalCasesApi.stats(examYear),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['historical-list', examYear, examType, scoreFrom, scoreTo, keyword, page],
    queryFn: () =>
      historicalCasesApi.list({
        examYear,
        examType,
        scoreFrom,
        scoreTo,
        keyword: keyword.trim() || undefined,
        page,
        pageSize,
      }),
  });

  const columns = [
    {
      title: '学生',
      dataIndex: ['user', 'realName'],
      render: (_: any, row: HistoricalCaseListItem) => (
        <Link href={`/teacher/historical-cases/${row.id}`} className="text-primary">
          {row.user.realName ?? row.user.username}
        </Link>
      ),
      width: 100,
    },
    {
      title: '选科',
      render: (_: any, row: HistoricalCaseListItem) => {
        const type = row.examType ? EXAM_TYPE_LABEL[row.examType] : '--';
        const re = Array.isArray(row.reChoices) ? row.reChoices.join('/') : '--';
        return (
          <span className="text-sm">
            {type} · {row.firstChoice ?? '--'}/{re}
          </span>
        );
      },
      width: 180,
    },
    {
      title: '总分',
      dataIndex: 'totalScore',
      width: 70,
      sorter: (a: HistoricalCaseListItem, b: HistoricalCaseListItem) =>
        (a.totalScore ?? 0) - (b.totalScore ?? 0),
    },
    { title: '位次', dataIndex: 'provincialRank', width: 90 },
    {
      title: '录取大学',
      render: (_: any, row: HistoricalCaseListItem) =>
        row.admissionResult?.admittedUniName ?? <span className="text-text-muted">未录取</span>,
      width: 200,
    },
    {
      title: '批次',
      render: (_: any, row: HistoricalCaseListItem) => (
        <Tag>{row.admissionResult?.batchName ?? '--'}</Tag>
      ),
      width: 110,
    },
    {
      title: '分差',
      render: (_: any, row: HistoricalCaseListItem) => {
        const d = row.admissionResult?.scoreDiff;
        if (d == null) return '--';
        return <span className={d >= 0 ? 'text-safe' : 'text-rush'}>{d > 0 ? `+${d}` : d}</span>;
      },
      width: 70,
    },
    {
      title: '第几志愿',
      render: (_: any, row: HistoricalCaseListItem) => row.admissionResult?.sequenceNo ?? '--',
      width: 80,
    },
    {
      title: '负责老师',
      render: (_: any, row: HistoricalCaseListItem) =>
        row.teacher?.user.realName ?? row.teacher?.user.username ?? '--',
      width: 100,
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="m-0 font-serif text-xl font-semibold">历史案例</h1>
        <span className="text-xs text-text-muted">
          往届学生的志愿填报 + 录取结果归档. 用于参考相似分数学生填了哪、录取在哪.
        </span>
      </div>

      {/* 统计概览 */}
      {stats ? (
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="案例总数" value={stats.total} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic
                title="物理类 / 历史类"
                value={`${stats.byExamType.PHYSICS ?? 0} / ${stats.byExamType.HISTORY ?? 0}`}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic
                title="平均分差"
                value={stats.avgScoreDiff ?? '--'}
                suffix={stats.avgScoreDiff !== null ? '分' : ''}
              />
              <p className="m-0 text-[11px] text-text-muted">
                有效样本 {stats.sampleSize} 条
              </p>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <p className="m-0 text-xs text-text-muted">高频录取院校</p>
              <ul className="m-0 mt-1 list-none p-0 text-sm">
                {stats.topUniversities.slice(0, 3).map((u) => (
                  <li key={u.name} className="truncate">
                    {u.name} × {u.count}
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
        </Row>
      ) : null}

      {/* 过滤栏 */}
      <Card size="small">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="m-0 mb-1 text-xs text-text-muted">高考年份</p>
            <Select
              value={examYear}
              onChange={(v) => {
                setExamYear(v);
                setPage(1);
              }}
              style={{ width: 120 }}
              options={[
                { label: '2025', value: 2025 },
                { label: '2024', value: 2024 },
                { label: '全部', value: undefined },
              ]}
            />
          </div>
          <div>
            <p className="m-0 mb-1 text-xs text-text-muted">科类</p>
            <Select
              value={examType}
              onChange={(v) => {
                setExamType(v);
                setPage(1);
              }}
              allowClear
              style={{ width: 120 }}
              placeholder="不限"
              options={[
                { label: '物理类', value: 'PHYSICS' },
                { label: '历史类', value: 'HISTORY' },
              ]}
            />
          </div>
          <div>
            <p className="m-0 mb-1 text-xs text-text-muted">分数下限</p>
            <InputNumber
              value={scoreFrom}
              onChange={(v) => {
                setScoreFrom(v ?? undefined);
                setPage(1);
              }}
              min={0}
              max={750}
              style={{ width: 100 }}
            />
          </div>
          <div>
            <p className="m-0 mb-1 text-xs text-text-muted">分数上限</p>
            <InputNumber
              value={scoreTo}
              onChange={(v) => {
                setScoreTo(v ?? undefined);
                setPage(1);
              }}
              min={0}
              max={750}
              style={{ width: 100 }}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="m-0 mb-1 text-xs text-text-muted">姓名 / 录取大学</p>
            <Input.Search
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={() => setPage(1)}
              allowClear
              placeholder="搜学生姓名或大学名"
            />
          </div>
        </div>
      </Card>

      {/* 列表 */}
      <Card>
        {isLoading ? (
          <div className="py-12 text-center">
            <Spin />
          </div>
        ) : !data || data.data.length === 0 ? (
          <Empty description="暂无符合条件的历史案例" />
        ) : (
          <Table<HistoricalCaseListItem>
            rowKey="id"
            dataSource={data.data}
            columns={columns as any}
            size="small"
            pagination={{
              current: page,
              pageSize,
              total: data.total,
              onChange: setPage,
              showSizeChanger: false,
            }}
          />
        )}
      </Card>
    </div>
  );
}
