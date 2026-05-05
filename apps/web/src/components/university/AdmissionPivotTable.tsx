'use client';

import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useMemo } from 'react';
import { pivotByYear, type PivotRow, type RawYearRecord } from './lib/pivotByYear';
import { computeTrend, trendColorClass } from './lib/trendChip';

type AdmissionField = 'majorMinScore' | 'majorMinRank' | 'majorAdmissionCount';

interface RawAdm extends RawYearRecord {
  majorMinScore?: number | null;
  majorMinRank?: number | null;
  majorAdmissionCount?: number | null;
}

interface Props {
  data: any[] | undefined;
}

export default function AdmissionPivotTable({ data }: Props) {
  const { rows, years } = useMemo(() => {
    if (!data) return { rows: [], years: [] };
    const normalized: RawAdm[] = data.map((a) => ({
      year: a.year,
      majorName: a.major?.name ?? a.majorName ?? '',
      groupCode: a.groupCode ?? '',
      recruitType: a.recruitType ?? '',
      subjects: a.subjects ?? '',
      majorId: a.majorId,
      majorMinScore: a.majorMinScore,
      majorMinRank: a.majorMinRank,
      majorAdmissionCount: a.majorAdmissionCount,
    }));
    return pivotByYear<RawAdm, AdmissionField>(normalized, {
      fields: ['majorMinScore', 'majorMinRank', 'majorAdmissionCount'],
      yearLimit: 3,
      sortByField: 'majorMinRank',
      sortDirection: 'asc',
    });
  }, [data]);

  const renderCell = (
    curr: number | undefined,
    prev: number | undefined,
    semantic: 'score' | 'rank',
    formatter: (v: number) => string,
    boldClass: string,
  ) => {
    const trend = computeTrend(prev, curr, semantic);
    return (
      <span className="inline-flex items-baseline gap-1">
        <span className={curr != null ? boldClass : 'text-text-faint'}>
          {curr != null ? formatter(curr) : '—'}
        </span>
        {trend && (
          <span className={`text-xs ${trendColorClass[trend.color]}`}>{trend.text}</span>
        )}
      </span>
    );
  };

  const yearGroups: ColumnsType<PivotRow<AdmissionField>> = years.map((y, idx) => {
    const prevYear = years[idx + 1];
    return {
      title: `${y} 年`,
      key: `year-${y}`,
      children: [
        {
          title: '最低分',
          key: `score-${y}`,
          width: 110,
          align: 'right' as const,
          render: (_, r) =>
            renderCell(
              r.byYear[y]?.majorMinScore,
              prevYear != null ? r.byYear[prevYear]?.majorMinScore : undefined,
              'score',
              (v) => String(v),
              'font-semibold text-text',
            ),
        },
        {
          title: '位次',
          key: `rank-${y}`,
          width: 130,
          align: 'right' as const,
          render: (_, r) =>
            renderCell(
              r.byYear[y]?.majorMinRank,
              prevYear != null ? r.byYear[prevYear]?.majorMinRank : undefined,
              'rank',
              (v) => v.toLocaleString(),
              'text-text-secondary',
            ),
        },
        {
          title: '人数',
          key: `count-${y}`,
          width: 90,
          align: 'right' as const,
          render: (_, r) => {
            const curr = r.byYear[y]?.majorAdmissionCount;
            return (
              <span className={curr != null ? 'text-text-secondary' : 'text-text-faint'}>
                {curr ?? '—'}
              </span>
            );
          },
        },
      ],
    };
  });

  const columns: ColumnsType<PivotRow<AdmissionField>> = [
    {
      title: '专业组',
      key: 'group',
      width: 80,
      fixed: 'left' as const,
      render: (_, r) => (
        <span className="text-text-tertiary text-[13px]">{r.groupCode || '-'}</span>
      ),
    },
    {
      title: '专业名称',
      key: 'majorName',
      width: 200,
      fixed: 'left' as const,
      render: (_, r) => (
        <Link href={`/majors/${r.majorId}`} className="text-primary hover:text-primary-light">
          {r.majorName}
        </Link>
      ),
    },
    {
      title: '选科',
      dataIndex: 'subjects',
      key: 'subjects',
      width: 110,
      fixed: 'left' as const,
      ellipsis: { showTitle: true },
    },
    ...yearGroups,
  ];

  return (
    <Table
      columns={columns}
      dataSource={rows}
      rowKey="rowKey"
      scroll={{ x: 'max-content' }}
      size="small"
      bordered
      pagination={{ pageSize: 30, showTotal: (t) => `共 ${t} 个专业` }}
    />
  );
}
