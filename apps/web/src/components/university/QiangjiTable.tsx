'use client';

import { Table } from 'antd';

interface QiangjiRow {
  id: number;
  major: string;
  subject: string;
  year: number;
  entryScore: number | null;
  admitScore: number | null;
  gaokaoScore: number | null;
  gaokaoRank: number | null;
}

interface QiangjiTableProps {
  data: QiangjiRow[];
}

interface PivotRow {
  key: string;
  major: string;
  subject: string;
  byYear: Record<number, { entryScore: number | null; admitScore: number | null; gaokaoRank: number | null }>;
}

export default function QiangjiTable({ data }: QiangjiTableProps) {
  if (!data || data.length === 0) return null;

  // Build pivot structure
  const majorMap = new Map<string, PivotRow>();
  for (const row of data) {
    const key = `${row.major}__${row.subject}`;
    if (!majorMap.has(key)) {
      majorMap.set(key, { key, major: row.major, subject: row.subject, byYear: {} });
    }
    majorMap.get(key)!.byYear[row.year] = {
      entryScore: row.entryScore,
      admitScore: row.admitScore,
      gaokaoRank: row.gaokaoRank,
    };
  }
  const pivotData = Array.from(majorMap.values());

  // 年份列从数据动态取最近 3 年 (此前硬编码 [2024,2023,2022], 新年份数据会被静默丢弃)
  const YEARS = Array.from(new Set(data.map((r) => r.year)))
    .sort((a, b) => b - a)
    .slice(0, 3);

  const columns = [
    {
      title: '专业',
      dataIndex: 'major',
      key: 'major',
      fixed: 'left' as const,
      width: 160,
    },
    {
      title: '科目要求',
      dataIndex: 'subject',
      key: 'subject',
      width: 100,
      render: (v: string) => v || '-',
    },
    ...YEARS.flatMap((year) => [
      {
        title: `${year} 入围分`,
        key: `${year}_entry`,
        width: 100,
        render: (_: unknown, row: PivotRow) => {
          const val = row.byYear[year]?.entryScore;
          return val != null ? <span className="font-medium">{val}</span> : '-';
        },
      },
      {
        title: `${year} 录取分`,
        key: `${year}_admit`,
        width: 100,
        render: (_: unknown, row: PivotRow) => {
          const val = row.byYear[year]?.admitScore;
          return val != null ? <span className="text-primary font-medium">{val}</span> : '-';
        },
      },
      {
        title: `${year} 位次`,
        key: `${year}_rank`,
        width: 90,
        render: (_: unknown, row: PivotRow) => {
          const val = row.byYear[year]?.gaokaoRank;
          return val != null ? <span className="text-text-secondary">{val.toLocaleString()}</span> : '-';
        },
      },
    ]),
  ];

  return (
    <Table
      columns={columns}
      dataSource={pivotData}
      rowKey="key"
      scroll={{ x: 900 }}
      size="small"
      pagination={false}
    />
  );
}
