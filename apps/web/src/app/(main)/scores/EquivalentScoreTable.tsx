'use client';

import { Card, Table, Tag } from 'antd';
import type { LookupResult } from '@/services/score-segment';

interface EquivalentScoreTableProps {
  rows: LookupResult[];
  baseYear: number;
}

export function EquivalentScoreTable({ rows, baseYear }: EquivalentScoreTableProps) {
  return (
    <Card title="等位分跨年表">
      <Table
        size="small"
        rowKey={(row) => String(row.year)}
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: '年份',
            dataIndex: 'year',
            render: (year: number) =>
              year === baseYear ? (
                <span>{year} <Tag color="blue">本次</Tag></span>
              ) : year,
          },
          { title: '等位分', dataIndex: 'score' },
          { title: '位次', dataIndex: 'rank' },
          {
            title: '百分位',
            dataIndex: 'percentile',
            render: (value: number) => `前 ${(value * 100).toFixed(2)}%`,
          },
        ]}
      />
    </Card>
  );
}
