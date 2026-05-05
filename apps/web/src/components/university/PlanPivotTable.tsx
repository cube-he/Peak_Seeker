'use client';

import { Table } from 'antd';
import Link from 'next/link';
import { useMemo } from 'react';
import { pivotByYear, type RawYearRecord } from './lib/pivotByYear';
import { computeTrend, trendColorClass } from './lib/trendChip';

interface RawPlan extends RawYearRecord {
  planCount?: number | null;
}

interface Props {
  data: any[] | undefined;
}

export default function PlanPivotTable({ data }: Props) {
  const { rows, years } = useMemo(() => {
    if (!data) return { rows: [], years: [] };
    const normalized: RawPlan[] = data.map((p) => ({
      year: p.year,
      majorName: p.major?.name ?? p.majorName ?? '',
      groupCode: p.groupCode ?? '',
      recruitType: p.recruitType ?? '',
      subjects: p.subjects ?? '',
      majorId: p.majorId,
      planCount: p.planCount,
    }));
    return pivotByYear<RawPlan, 'planCount'>(normalized, {
      fields: ['planCount'],
      yearLimit: 3,
      sortByField: 'planCount',
      sortDirection: 'desc',
    });
  }, [data]);

  const yearColumns = years.map((y, idx) => ({
    title: `${y} 计划`,
    key: `year-${y}`,
    width: 120,
    align: 'right' as const,
    render: (_: any, row: any) => {
      const curr = row.byYear[y]?.planCount;
      const prev = years[idx + 1] != null ? row.byYear[years[idx + 1]]?.planCount : undefined;
      const trend = computeTrend(prev, curr, 'score');
      return (
        <span className="inline-flex items-baseline gap-1">
          <span className={curr != null ? 'font-medium text-text' : 'text-text-faint'}>
            {curr ?? '—'}
          </span>
          {trend && (
            <span className={`text-xs ${trendColorClass[trend.color]}`}>{trend.text}</span>
          )}
        </span>
      );
    },
  }));

  const columns: any[] = [
    {
      title: '专业组',
      key: 'group',
      width: 80,
      fixed: 'left',
      render: (_: any, r: any) => (
        <span className="text-text-tertiary text-[13px]">{r.groupCode || '-'}</span>
      ),
    },
    {
      title: '专业名称',
      key: 'majorName',
      width: 200,
      fixed: 'left',
      render: (_: any, r: any) => (
        <Link href={`/majors/${r.majorId}`} className="text-primary font-medium hover:text-primary-light">
          {r.majorName}
        </Link>
      ),
    },
    {
      title: '招生类型',
      key: 'recruitType',
      width: 120,
      render: (_: any, r: any) =>
        r.recruitType && r.recruitType !== '普通类本科' ? (
          <span className="inline-block rounded-full bg-surface-dim text-text-secondary text-xs px-2 py-0.5">
            {r.recruitType}
          </span>
        ) : (
          <span className="text-text-faint text-xs">-</span>
        ),
    },
    {
      title: '选科',
      dataIndex: 'subjects',
      key: 'subjects',
      width: 120,
      ellipsis: { showTitle: true },
    },
    ...yearColumns,
  ];

  return (
    <Table
      columns={columns}
      dataSource={rows}
      rowKey="rowKey"
      scroll={{ x: 'max-content' }}
      size="small"
      pagination={{ pageSize: 30, showTotal: (t) => `共 ${t} 个专业` }}
    />
  );
}
