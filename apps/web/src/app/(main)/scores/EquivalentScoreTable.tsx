'use client';

import { useEffect, useState } from 'react';
import { Card, Table } from 'antd';
import { scoreSegmentApi, type ExamType, type LookupResult } from '@/services/score-segment';

interface EquivalentScoreTableProps {
  rank: number;
  subjects: string;
}

const BASE_YEAR = 2025;

export function EquivalentScoreTable({ rank, subjects }: EquivalentScoreTableProps) {
  const [rows, setRows] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    scoreSegmentApi
      .equivalent({ baseYear: BASE_YEAR, examType: subjects as ExamType, rank })
      .then((result) => {
        if (!cancelled) {
          setRows(result.equivalents);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rank, subjects]);

  return (
    <Card title="等位分跨年表">
      <Table
        size="small"
        loading={loading}
        rowKey={(row) => String(row.year)}
        pagination={false}
        dataSource={rows}
        columns={[
          { title: '年份', dataIndex: 'year' },
          { title: '等位分', dataIndex: 'score' },
          { title: '位次', dataIndex: 'rank' },
          {
            title: '百分位',
            dataIndex: 'percentile',
            render: (value: number) => `前 ${value}%`,
          },
        ]}
      />
    </Card>
  );
}
