# 院校详情页重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/universities/[id]` 详情页改造为：基本信息按卡片分组全字段展示；招生计划与历年录取改为"一行一专业、按年份横向并排"的透视表，便于趋势对比。

**Architecture:** 前端纯重构，后端 API 不动。新增 1 个透视工具纯函数 + 1 个 trend chip 工具 + 6 个组件（4 张信息卡 + 2 张透视表）。`page.tsx` 仅做 wiring。

**Tech Stack:** Next.js 14 + React 18 + Ant Design 5 + Tailwind + TypeScript + Jest 29 + ts-jest。

**Spec：** `docs/superpowers/specs/2026-05-05-university-detail-redesign-design.md`

---

## File Structure

| 文件 | 责任 |
|---|---|
| `apps/web/src/components/university/lib/pivotByYear.ts` | 把扁平年份数组 GROUP BY 自然主键，转成"行=专业，列=年份"的二维结构。纯函数。 |
| `apps/web/src/components/university/lib/__tests__/pivotByYear.test.ts` | 上述工具的单元测试 |
| `apps/web/src/components/university/lib/trendChip.ts` | 计算两年间数值差，决定 chip 文本与红绿色（区分"分数语义"和"位次语义"） |
| `apps/web/src/components/university/lib/__tests__/trendChip.test.ts` | trendChip 单元测试 |
| `apps/web/src/components/university/PlanPivotTable.tsx` | 招生计划横向透视表（每年仅 plan 数） |
| `apps/web/src/components/university/AdmissionPivotTable.tsx` | 历年录取横向透视表（每年最低分/位次/人数 3 子列） |
| `apps/web/src/components/university/OverviewCard.tsx` | 概况卡片 |
| `apps/web/src/components/university/DisciplineCard.tsx` | 学科建设卡片 |
| `apps/web/src/components/university/CampusCard.tsx` | 校园生活卡片 |
| `apps/web/src/components/university/CharterCard.tsx` | 招生章程卡片 |
| `apps/web/src/app/(main)/universities/[id]/page.tsx` | 主页面：拼装所有卡片与透视表，移除内联 `Descriptions` / `planColumns` / `admissionColumns` |

---

## Task 1: pivotByYear 工具 + 单元测试（TDD）

**Files:**
- Create: `apps/web/src/components/university/lib/pivotByYear.ts`
- Create: `apps/web/src/components/university/lib/__tests__/pivotByYear.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/components/university/lib/__tests__/pivotByYear.test.ts`：

```typescript
import { pivotByYear } from '../pivotByYear';

type Rec = {
  year: number;
  majorName: string;
  groupCode: string;
  recruitType: string;
  subjects: string;
  majorId: number;
  planCount?: number;
  majorMinRank?: number;
};

const base = (over: Partial<Rec>): Rec => ({
  year: 2024,
  majorName: '计算机',
  groupCode: '01',
  recruitType: '普通类本科',
  subjects: '物理',
  majorId: 1,
  ...over,
});

describe('pivotByYear', () => {
  it('returns empty result for empty input', () => {
    const out = pivotByYear<Rec, 'planCount'>([], { fields: ['planCount'] });
    expect(out.rows).toEqual([]);
    expect(out.years).toEqual([]);
  });

  it('groups same major across years into one row', () => {
    const out = pivotByYear<Rec, 'planCount'>(
      [base({ year: 2024, planCount: 60 }), base({ year: 2023, planCount: 55 })],
      { fields: ['planCount'] },
    );
    expect(out.rows).toHaveLength(1);
    expect(out.years).toEqual([2024, 2023]);
    expect(out.rows[0].byYear[2024]?.planCount).toBe(60);
    expect(out.rows[0].byYear[2023]?.planCount).toBe(55);
  });

  it('does NOT collapse same major name with different groupCode', () => {
    const out = pivotByYear<Rec, 'planCount'>(
      [
        base({ groupCode: '01', planCount: 60 }),
        base({ groupCode: '03', planCount: 30 }),
      ],
      { fields: ['planCount'] },
    );
    expect(out.rows).toHaveLength(2);
  });

  it('does NOT collapse same major across different recruitType / subjects', () => {
    const out = pivotByYear<Rec, 'planCount'>(
      [
        base({ recruitType: '普通类本科', planCount: 60 }),
        base({ recruitType: '中外合作办学', planCount: 20 }),
        base({ subjects: '物理+化学', planCount: 10 }),
      ],
      { fields: ['planCount'] },
    );
    expect(out.rows).toHaveLength(3);
  });

  it('limits years to most recent N (default 3)', () => {
    const records: Rec[] = [2025, 2024, 2023, 2022, 2021].map((y) =>
      base({ year: y, planCount: y }),
    );
    const out = pivotByYear<Rec, 'planCount'>(records, { fields: ['planCount'] });
    expect(out.years).toEqual([2025, 2024, 2023]);
    expect(out.rows[0].byYear[2022]).toBeUndefined();
  });

  it('sorts rows by latest year sortByField asc by default', () => {
    const out = pivotByYear<Rec, 'majorMinRank'>(
      [
        base({ majorName: '冷门', groupCode: 'A', majorMinRank: 80000 }),
        base({ majorName: '热门', groupCode: 'B', majorMinRank: 5000 }),
        base({ majorName: '中等', groupCode: 'C', majorMinRank: 30000 }),
      ],
      { fields: ['majorMinRank'], sortByField: 'majorMinRank' },
    );
    expect(out.rows.map((r) => r.majorName)).toEqual(['热门', '中等', '冷门']);
  });

  it('places rows missing latest-year sort field at the end', () => {
    const out = pivotByYear<Rec, 'majorMinRank'>(
      [
        base({ majorName: '有数据', groupCode: 'A', year: 2024, majorMinRank: 30000 }),
        base({ majorName: '只老数据', groupCode: 'B', year: 2023, majorMinRank: 10000 }),
      ],
      { fields: ['majorMinRank'], sortByField: 'majorMinRank' },
    );
    expect(out.rows[0].majorName).toBe('有数据');
    expect(out.rows[1].majorName).toBe('只老数据');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm --filter web test -- pivotByYear
```

Expected: 全部失败，`Cannot find module '../pivotByYear'`。

- [ ] **Step 3: 写最小实现让测试通过**

创建 `apps/web/src/components/university/lib/pivotByYear.ts`：

```typescript
/**
 * GROUP BY (majorName + groupCode + recruitType + subjects) → 透视为按年份的二维结构。
 * 同名跨组/跨招生类型/跨选科组合不合并（与 7 字段自然主键策略一致）。
 */

export interface RawYearRecord {
  year: number;
  majorName: string;
  groupCode: string;
  recruitType: string;
  subjects: string;
  majorId: number;
  [field: string]: any;
}

export interface PivotOptions<F extends string> {
  /** 每年要从原记录抽取哪些字段 */
  fields: F[];
  /** 取最近多少年（默认 3） */
  yearLimit?: number;
  /** 按"最新有数据年份"的哪个字段排序（默认不排序，保留原序） */
  sortByField?: F;
  /** 'asc'（默认）位次/分数低→高 */
  sortDirection?: 'asc' | 'desc';
}

export interface PivotRow<F extends string> {
  rowKey: string;
  majorName: string;
  groupCode: string;
  recruitType: string;
  subjects: string;
  majorId: number;
  byYear: Partial<Record<number, Partial<Record<F, number>>>>;
}

export interface PivotResult<F extends string> {
  rows: PivotRow<F>[];
  /** 降序，含数据的最近 N 年 */
  years: number[];
}

const buildRowKey = (r: RawYearRecord) =>
  `${r.majorName}||${r.groupCode}||${r.recruitType}||${r.subjects}`;

export function pivotByYear<R extends RawYearRecord, F extends string>(
  records: R[],
  options: PivotOptions<F>,
): PivotResult<F> {
  const { fields, yearLimit = 3, sortByField, sortDirection = 'asc' } = options;

  if (records.length === 0) return { rows: [], years: [] };

  // 取最近 yearLimit 年
  const allYears = Array.from(new Set(records.map((r) => r.year))).sort((a, b) => b - a);
  const years = allYears.slice(0, yearLimit);
  const yearSet = new Set(years);

  // GROUP BY 行键
  const map = new Map<string, PivotRow<F>>();
  for (const r of records) {
    if (!yearSet.has(r.year)) continue;
    const key = buildRowKey(r);
    let row = map.get(key);
    if (!row) {
      row = {
        rowKey: key,
        majorName: r.majorName,
        groupCode: r.groupCode,
        recruitType: r.recruitType,
        subjects: r.subjects,
        majorId: r.majorId,
        byYear: {},
      };
      map.set(key, row);
    }
    const cell: Partial<Record<F, number>> = row.byYear[r.year] || {};
    for (const f of fields) {
      const v = r[f];
      if (typeof v === 'number') cell[f] = v;
    }
    row.byYear[r.year] = cell;
  }

  let rows = Array.from(map.values());

  // 排序：按最新年份的 sortByField；缺则回退到次新年份；都缺排最后
  if (sortByField) {
    const dir = sortDirection === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = pickSortValue(a, years, sortByField);
      const bv = pickSortValue(b, years, sortByField);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }

  return { rows, years };
}

function pickSortValue<F extends string>(
  row: PivotRow<F>,
  years: number[],
  field: F,
): number | undefined {
  for (const y of years) {
    const v = row.byYear[y]?.[field];
    if (v != null) return v;
  }
  return undefined;
}
```

- [ ] **Step 4: 再跑测试**

```bash
pnpm --filter web test -- pivotByYear
```

Expected: 7 个用例全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/university/lib/pivotByYear.ts \
        apps/web/src/components/university/lib/__tests__/pivotByYear.test.ts
git commit -m "feat(university): add pivotByYear utility for year-pivoted tables"
```

---

## Task 2: trendChip 工具 + 单元测试

**Files:**
- Create: `apps/web/src/components/university/lib/trendChip.ts`
- Create: `apps/web/src/components/university/lib/__tests__/trendChip.test.ts`

**红绿语义**：
- `score` 语义（分数/计划数）：升=红，降=绿（大学难度上升对学生不利→红）
- `rank` 语义（位次）：升（数字变小）=红，降（数字变大）=绿

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/components/university/lib/__tests__/trendChip.test.ts`：

```typescript
import { computeTrend } from '../trendChip';

describe('computeTrend', () => {
  it('returns null when prev or curr is missing', () => {
    expect(computeTrend(undefined, 100, 'score')).toBeNull();
    expect(computeTrend(100, undefined, 'score')).toBeNull();
    expect(computeTrend(undefined, undefined, 'score')).toBeNull();
  });

  it('flat when delta is 0', () => {
    expect(computeTrend(100, 100, 'score')).toEqual({
      delta: 0,
      arrow: '─',
      color: 'flat',
      text: '─',
    });
  });

  it('score semantic: rise (curr > prev) is red', () => {
    expect(computeTrend(580, 600, 'score')).toMatchObject({
      delta: 20,
      arrow: '↑',
      color: 'red',
      text: '↑20',
    });
  });

  it('score semantic: fall (curr < prev) is green', () => {
    expect(computeTrend(600, 580, 'score')).toMatchObject({
      delta: -20,
      arrow: '↓',
      color: 'green',
      text: '↓20',
    });
  });

  it('rank semantic: number decreases (rank rises) → red', () => {
    expect(computeTrend(30000, 10000, 'rank')).toMatchObject({
      delta: -20000,
      arrow: '↑',
      color: 'red',
      text: '↑20000',
    });
  });

  it('rank semantic: number increases (rank falls) → green', () => {
    expect(computeTrend(10000, 30000, 'rank')).toMatchObject({
      delta: 20000,
      arrow: '↓',
      color: 'green',
      text: '↓20000',
    });
  });
});
```

- [ ] **Step 2: 运行，确认失败**

```bash
pnpm --filter web test -- trendChip
```

Expected: `Cannot find module '../trendChip'`。

- [ ] **Step 3: 实现**

创建 `apps/web/src/components/university/lib/trendChip.ts`：

```typescript
/**
 * 计算两年间的趋势信息。
 *  - 'score' 语义：值升为红（对学生不利），值降为绿
 *  - 'rank'  语义：位次本身越小越好；位次"上升"（数值变小）= 红，反之 = 绿
 */
export type TrendSemantic = 'score' | 'rank';
export type TrendColor = 'red' | 'green' | 'flat';

export interface TrendInfo {
  delta: number;
  arrow: '↑' | '↓' | '─';
  color: TrendColor;
  /** 用于直接渲染的文本，如 "↑20" / "↓5" / "─" */
  text: string;
}

export function computeTrend(
  prev: number | undefined,
  curr: number | undefined,
  semantic: TrendSemantic,
): TrendInfo | null {
  if (prev == null || curr == null) return null;
  const delta = curr - prev;
  if (delta === 0) {
    return { delta: 0, arrow: '─', color: 'flat', text: '─' };
  }

  const isRise = delta > 0;
  // score: rise=红； rank: rise(数值变大→位次更差)=绿，fall(数值变小→位次更好)=红
  const color: TrendColor =
    semantic === 'score'
      ? isRise
        ? 'red'
        : 'green'
      : isRise
        ? 'green'
        : 'red';

  // 箭头同样按"对学生友好/不友好"来定向：rank 语义下数值变小其实是位次"升"
  const arrow: '↑' | '↓' =
    semantic === 'score' ? (isRise ? '↑' : '↓') : isRise ? '↓' : '↑';

  return {
    delta,
    arrow,
    color,
    text: `${arrow}${Math.abs(delta)}`,
  };
}

/** Tailwind 类映射，组件层用 */
export const trendColorClass: Record<TrendColor, string> = {
  red: 'text-red-500',
  green: 'text-emerald-600',
  flat: 'text-text-faint',
};
```

- [ ] **Step 4: 再跑测试**

```bash
pnpm --filter web test -- trendChip
```

Expected: 6 用例全 PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/university/lib/trendChip.ts \
        apps/web/src/components/university/lib/__tests__/trendChip.test.ts
git commit -m "feat(university): add trendChip helper with score/rank semantics"
```

---

## Task 3: PlanPivotTable 组件

**Files:**
- Create: `apps/web/src/components/university/PlanPivotTable.tsx`

行 = 专业（按 majorName+groupCode+recruitType+subjects 聚合）；列 = 最近 3 年的 `planCount`。

- [ ] **Step 1: 实现组件**

创建 `apps/web/src/components/university/PlanPivotTable.tsx`：

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/university/PlanPivotTable.tsx
git commit -m "feat(university): add PlanPivotTable for horizontal year layout"
```

---

## Task 4: AdmissionPivotTable 组件

**Files:**
- Create: `apps/web/src/components/university/AdmissionPivotTable.tsx`

每年下 3 子列（最低分 / 位次 / 人数），用 antd Table 多级表头 `children` 实现。

- [ ] **Step 1: 实现组件**

创建 `apps/web/src/components/university/AdmissionPivotTable.tsx`：

```tsx
'use client';

import { Table } from 'antd';
import Link from 'next/link';
import { useMemo } from 'react';
import { pivotByYear, type RawYearRecord } from './lib/pivotByYear';
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

  const yearGroups = years.map((y, idx) => {
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
          render: (_: any, r: any) =>
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
          render: (_: any, r: any) =>
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
          render: (_: any, r: any) => {
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/university/AdmissionPivotTable.tsx
git commit -m "feat(university): add AdmissionPivotTable with multi-level year headers"
```

---

## Task 5: 主页接入两个透视表（替换原始 Table）

**Files:**
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`

只动 plans / admissions 两个 Tab。基本信息保持原状（下个 Task 重做）。

- [ ] **Step 1: 修改主页面**

打开 `apps/web/src/app/(main)/universities/[id]/page.tsx`：

**1) 在文件顶部 import 区追加：**

```tsx
import PlanPivotTable from '@/components/university/PlanPivotTable';
import AdmissionPivotTable from '@/components/university/AdmissionPivotTable';
```

**2) 删除以下两块内联定义**（行号参考当前文件）：

- `const planColumns = [ ... ];`（约 70-124 行）
- `const admissionColumns = [ ... ];`（约 126-157 行）

**3) 替换 `tabItems` 中的 `plans` 和 `admissions` 项**：

```tsx
{
  key: 'plans',
  label: <span><BookOutlined className="mr-1" />招生计划 ({majors?.length || 0})</span>,
  children: <PlanPivotTable data={majors} />,
},
{
  key: 'admissions',
  label: <span><HistoryOutlined className="mr-1" />历年录取 ({admissions?.length || 0})</span>,
  children: <AdmissionPivotTable data={admissions} />,
},
```

**4) 移除已不再使用的 import**：从顶部 antd import 中删去 `Table`（如果其他地方还用了 `Table` 就保留）。验证：

```bash
grep -n "Table" apps/web/src/app/\(main\)/universities/\[id\]/page.tsx
```

只能匹配到 `PlanPivotTable` / `AdmissionPivotTable`，不应再有裸 `<Table>`。

- [ ] **Step 2: 浏览器验证**

启动开发服务器后访问 `http://132.232.245.53:3004/universities/9958`：

- "招生计划" Tab：每个专业一行，最近 3 年的计划数横向并排
- "历年录取" Tab：每年下显示 3 子列（最低分/位次/人数）
- 横向滚动时左侧"专业组/专业名称"始终可见
- 趋势 chip 颜色：分数升=红、位次降（数字变大）=绿

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(main\)/universities/\[id\]/page.tsx
git commit -m "feat(university): wire pivot tables into plans & admissions tabs"
```

---

## Task 6: OverviewCard 组件

**Files:**
- Create: `apps/web/src/components/university/OverviewCard.tsx`

- [ ] **Step 1: 实现**

创建 `apps/web/src/components/university/OverviewCard.tsx`：

```tsx
'use client';

import { Card, Descriptions, Tag } from 'antd';
import { BankOutlined } from '@ant-design/icons';

interface Props {
  code: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  level: string | null;
  runningLevel: string | null;
  runningNature: string | null;
  department: string | null;
  createdYear: string | null;
  campusArea: number | string | null;
  maleRatio: number | null;
  femaleRatio: number | null;
  tags: any;
}

const has = (v: any) => v != null && v !== '';

export default function OverviewCard(p: Props) {
  const items: { label: string; value: any }[] = [];
  if (has(p.code)) items.push({ label: '院校代码', value: p.code });
  if (has(p.province) || has(p.city))
    items.push({ label: '省份/城市', value: [p.province, p.city].filter(Boolean).join(' · ') });
  if (has(p.type)) items.push({ label: '类型', value: p.type });
  if (has(p.level)) items.push({ label: '层次', value: p.level });
  if (has(p.runningLevel)) items.push({ label: '办学层次', value: p.runningLevel });
  if (has(p.runningNature)) items.push({ label: '办学性质', value: p.runningNature });
  if (has(p.department)) items.push({ label: '主管部门', value: p.department });
  if (has(p.createdYear)) items.push({ label: '建校时间', value: p.createdYear });
  if (has(p.campusArea)) items.push({ label: '校园面积', value: `${p.campusArea} 亩` });
  if (has(p.maleRatio) && has(p.femaleRatio))
    items.push({ label: '男女比', value: `${p.maleRatio} : ${p.femaleRatio}` });

  const tagList: string[] = Array.isArray(p.tags)
    ? p.tags.filter((t) => typeof t === 'string')
    : [];

  if (items.length === 0 && tagList.length === 0) return null;

  return (
    <Card title={<><BankOutlined className="mr-1" />概况</>} size="small">
      {items.length > 0 && (
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          {items.map((it) => (
            <Descriptions.Item key={it.label} label={it.label}>
              {it.value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
      {tagList.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {tagList.map((t) => (
            <Tag key={t} color="default">
              {t}
            </Tag>
          ))}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/university/OverviewCard.tsx
git commit -m "feat(university): add OverviewCard for basic info grouping"
```

---

## Task 7: DisciplineCard 组件

**Files:**
- Create: `apps/web/src/components/university/DisciplineCard.tsx`

- [ ] **Step 1: 实现**

创建 `apps/web/src/components/university/DisciplineCard.tsx`：

```tsx
'use client';

import { Card, Descriptions, Collapse } from 'antd';
import { BookOutlined } from '@ant-design/icons';

interface Props {
  disciplineEvaluationLevel: string | null;
  aClassDisciplineCount: number | null;
  hasMasterProgram: boolean;
  masterProgramCount: number | null;
  masterPrograms: any;
  hasDoctoralProgram: boolean;
  doctoralProgramCount: number | null;
  doctoralPrograms: any;
  postgradRate: string | null;
  transferDifficulty: string | null;
}

const has = (v: any) => v != null && v !== '';
const toList = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];

export default function DisciplineCard(p: Props) {
  const masterList = toList(p.masterPrograms);
  const doctoralList = toList(p.doctoralPrograms);

  const items: { label: string; value: any }[] = [];
  if (has(p.disciplineEvaluationLevel))
    items.push({ label: '学科评估', value: p.disciplineEvaluationLevel });
  if (has(p.aClassDisciplineCount))
    items.push({ label: 'A类学科数', value: `${p.aClassDisciplineCount} 个` });
  if (p.hasMasterProgram)
    items.push({ label: '硕士点', value: has(p.masterProgramCount) ? `${p.masterProgramCount} 个` : '有' });
  if (p.hasDoctoralProgram)
    items.push({ label: '博士点', value: has(p.doctoralProgramCount) ? `${p.doctoralProgramCount} 个` : '有' });
  if (has(p.postgradRate)) items.push({ label: '考研率', value: p.postgradRate });
  if (has(p.transferDifficulty)) items.push({ label: '转专业难度', value: p.transferDifficulty });

  const collapseItems: any[] = [];
  if (masterList.length > 0)
    collapseItems.push({
      key: 'master',
      label: `硕士点列表（${masterList.length}）`,
      children: <div className="text-sm leading-7">{masterList.join('、')}</div>,
    });
  if (doctoralList.length > 0)
    collapseItems.push({
      key: 'doctoral',
      label: `博士点列表（${doctoralList.length}）`,
      children: <div className="text-sm leading-7">{doctoralList.join('、')}</div>,
    });

  if (items.length === 0 && collapseItems.length === 0) return null;

  return (
    <Card title={<><BookOutlined className="mr-1" />学科建设</>} size="small">
      {items.length > 0 && (
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          {items.map((it) => (
            <Descriptions.Item key={it.label} label={it.label}>
              {it.value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
      {collapseItems.length > 0 && (
        <div className="mt-3">
          <Collapse ghost size="small" items={collapseItems} />
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/university/DisciplineCard.tsx
git commit -m "feat(university): add DisciplineCard with collapsible program lists"
```

---

## Task 8: CampusCard 组件

**Files:**
- Create: `apps/web/src/components/university/CampusCard.tsx`

仅在有校园生活相关字段时渲染。当前数据集只有 `militaryTrainingDuration`，但保留扩展位。

- [ ] **Step 1: 实现**

创建 `apps/web/src/components/university/CampusCard.tsx`：

```tsx
'use client';

import { Card, Descriptions } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';

interface Props {
  militaryTrainingDuration: string | null;
}

const has = (v: any) => v != null && v !== '';

export default function CampusCard(p: Props) {
  const items: { label: string; value: any }[] = [];
  if (has(p.militaryTrainingDuration))
    items.push({ label: '军训时长', value: p.militaryTrainingDuration });

  if (items.length === 0) return null;

  return (
    <Card title={<><EnvironmentOutlined className="mr-1" />校园生活</>} size="small">
      <Descriptions column={{ xs: 1, sm: 2 }} size="small">
        {items.map((it) => (
          <Descriptions.Item key={it.label} label={it.label}>
            {it.value}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/university/CampusCard.tsx
git commit -m "feat(university): add CampusCard for campus life info"
```

---

## Task 9: CharterCard 组件

**Files:**
- Create: `apps/web/src/components/university/CharterCard.tsx`

承载 `renameHistory` + `admissionGuide` + `charterInfo` JSON。长文本可折叠。

- [ ] **Step 1: 实现**

创建 `apps/web/src/components/university/CharterCard.tsx`：

```tsx
'use client';

import { Card, Collapse } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

interface Props {
  renameHistory: string | null;
  admissionGuide: string | null;
  charterInfo: any;
}

const has = (v: any) => v != null && v !== '';

export default function CharterCard(p: Props) {
  const items: any[] = [];

  if (has(p.renameHistory)) {
    items.push({
      key: 'rename',
      label: '更名历史',
      children: <div className="whitespace-pre-wrap text-[13px] leading-6">{p.renameHistory}</div>,
    });
  }

  if (has(p.admissionGuide)) {
    items.push({
      key: 'guide',
      label: '招生章程',
      children: (
        <div className="max-h-[400px] overflow-auto whitespace-pre-wrap text-[13px] leading-6">
          {p.admissionGuide}
        </div>
      ),
    });
  }

  // charterInfo 是 JSON：当对象时按 key 展平为段落；当字符串时直接显示
  let charterRendered: React.ReactNode = null;
  if (p.charterInfo && typeof p.charterInfo === 'object' && !Array.isArray(p.charterInfo)) {
    const entries = Object.entries(p.charterInfo).filter(([, v]) => v != null && v !== '');
    if (entries.length > 0) {
      charterRendered = (
        <div className="space-y-3 text-[13px]">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="text-text-tertiary mb-1">{k}</div>
              <div className="leading-6 whitespace-pre-wrap">{String(v)}</div>
            </div>
          ))}
        </div>
      );
    }
  } else if (typeof p.charterInfo === 'string' && p.charterInfo) {
    charterRendered = (
      <div className="whitespace-pre-wrap text-[13px] leading-6">{p.charterInfo}</div>
    );
  }
  if (charterRendered) {
    items.push({ key: 'charter', label: '章程详情', children: charterRendered });
  }

  if (items.length === 0) return null;

  return (
    <Card title={<><FileTextOutlined className="mr-1" />招生章程</>} size="small">
      <Collapse ghost size="small" items={items} />
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/university/CharterCard.tsx
git commit -m "feat(university): add CharterCard for admission guide & rename history"
```

---

## Task 10: 主页接入卡片网格 + 移除内联 Descriptions

**Files:**
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`

- [ ] **Step 1: 顶部 import 追加**

```tsx
import OverviewCard from '@/components/university/OverviewCard';
import DisciplineCard from '@/components/university/DisciplineCard';
import CampusCard from '@/components/university/CampusCard';
import CharterCard from '@/components/university/CharterCard';
```

- [ ] **Step 2: 删除原 import 中不再需要的 `Descriptions`**

修改原 antd 顶部 import：

```tsx
import { Card, Tabs, Space, Spin } from 'antd';
```

（删除 `Table` 和 `Descriptions`）

- [ ] **Step 3: 替换 tabItems 中 `info` 项的 children**

把原来：

```tsx
{
  key: 'info',
  label: <span><BankOutlined className="mr-1" />基本信息</span>,
  children: (
    <>
      <Descriptions ...>...</Descriptions>
      <RankingCard ... />
      <SatisfactionCard ... />
      <EmploymentCard ... />
    </>
  ),
},
```

替换为：

```tsx
{
  key: 'info',
  label: <span><BankOutlined className="mr-1" />基本信息</span>,
  children: (
    <div className="px-6 py-4 space-y-4">
      <CharterCard
        renameHistory={u.renameHistory ?? null}
        admissionGuide={u.admissionGuide ?? null}
        charterInfo={u.charterInfo ?? null}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OverviewCard
          code={u.code ?? null}
          province={u.province ?? null}
          city={u.city ?? null}
          type={u.type ?? null}
          level={u.level ?? null}
          runningLevel={u.runningLevel ?? null}
          runningNature={u.runningNature ?? null}
          department={u.department ?? null}
          createdYear={u.createdYear ?? null}
          campusArea={u.campusArea ?? null}
          maleRatio={u.maleRatio ?? null}
          femaleRatio={u.femaleRatio ?? null}
          tags={u.tags ?? null}
        />
        <DisciplineCard
          disciplineEvaluationLevel={u.disciplineEvaluationLevel ?? null}
          aClassDisciplineCount={u.aClassDisciplineCount ?? null}
          hasMasterProgram={!!u.hasMasterProgram}
          masterProgramCount={u.masterProgramCount ?? null}
          masterPrograms={u.masterPrograms ?? null}
          hasDoctoralProgram={!!u.hasDoctoralProgram}
          doctoralProgramCount={u.doctoralProgramCount ?? null}
          doctoralPrograms={u.doctoralPrograms ?? null}
          postgradRate={u.postgradRate ?? null}
          transferDifficulty={u.transferDifficulty ?? null}
        />
        <CampusCard
          militaryTrainingDuration={u.militaryTrainingDuration ?? null}
        />
        <RankingCard
          rankingSoft={u.rankingSoft ?? null}
          rankingAlumni={u.rankingAlumni ?? null}
          rankingQS={u.rankingQS ?? null}
          rankingUSNews={u.rankingUSNews ?? null}
          aClassDisciplineCount={u.aClassDisciplineCount ?? null}
        />
        <SatisfactionCard
          overall={u.satisfactionOverall ?? null}
          life={u.satisfactionLife ?? null}
          environ={u.satisfactionEnviron ?? null}
          count={u.satisfactionCount ?? null}
        />
        <EmploymentCard
          employmentRate={u.employmentRate ?? null}
          furtherStudyRate={u.furtherStudyRate ?? null}
          avgSalary={u.avgSalary ?? null}
          topEmployers={u.topEmployers ?? null}
        />
      </div>
    </div>
  ),
},
```

注意：现有 `RankingCard / SatisfactionCard / EmploymentCard` 的 props 保持不变；只是被装进网格里。

- [ ] **Step 4: 浏览器验证**

访问 `http://132.232.245.53:3004/universities/9958`：

- "基本信息" Tab：顶部一张大卡片（招生章程，若有），下方网格 5-6 张卡片
- 缺数据的卡片整张不渲染
- "招生计划"和"历年录取"Tab 仍正常工作（与 Task 5 验收点一致）

- [ ] **Step 5: 文件行数复核**

```bash
wc -l apps/web/src/app/\(main\)/universities/\[id\]/page.tsx
```

Expected: 行数从 ~302 降到约 100-150 之间（裸 Descriptions 与列定义都已外移）。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(main\)/universities/\[id\]/page.tsx
git commit -m "refactor(university): replace inline Descriptions with card grid"
```

---

## Task 11: 全量测试与 lint

- [ ] **Step 1: 跑全部前端测试**

```bash
pnpm --filter web test
```

Expected: 包括 pivotByYear (7 用例) 和 trendChip (6 用例) 在内的所有测试 PASS。

- [ ] **Step 2: 编译检查**

```bash
pnpm --filter web build
```

Expected: 无 TypeScript 错误。如有，根据报错修正。

- [ ] **Step 3: lint**

```bash
pnpm --filter web lint
```

Expected: 无错误。

- [ ] **Step 4: 浏览器最终验收**

访问 `http://132.232.245.53:3004/universities/9958`，按 spec 第 6 节验收标准逐条核对：

1. ✅ "基本信息" Tab 看到 ≥5 张并列卡片
2. ✅ "招生计划" Tab 一行一专业，最近 3 年计划数横向并排
3. ✅ "历年录取" Tab 一行一专业，最近 3 年最低分/位次/人数横向并排（每年 3 子列）
4. ✅ 横向滚动只滚年份列，专业名/选科/专业组始终可见
5. ✅ 趋势 chip 颜色方向：分数升=红、位次降（数值变大）=绿

如有任何不符，回到对应 Task 修复后重新跑测试。

---

## Self-Review 备注

**Spec 覆盖检查**：

| Spec 章节 | 对应 Task |
|---|---|
| 2.1 基本信息卡片化 | Task 6/7/8/9/10 |
| 2.2.1-2.2.5 透视行键/年份/排序/空值 | Task 1（pivotByYear） |
| 2.3.1 招生计划列设计 | Task 3 |
| 2.3.2 历年录取列设计 | Task 4 |
| 2.3.3 趋势 chip 红绿语义 | Task 2 + Task 3/4 渲染 |
| 2.3.4 响应式（首列固定/横向滚动） | Task 3/4（`fixed: 'left'` + `scroll: { x: 'max-content' }`） |
| 3 文件结构 | 全 Task 已对齐 |
| 4 实施顺序 | Task 编号即实施顺序 |
| 5.1 不动的部分 | 全 Task 仅触动 `apps/web/src/components/university/` 与主 page.tsx |
| 5.2 风险（trend chip 方向） | Task 2 单测覆盖 + Task 5/11 浏览器验收 |
| 6 用户视角验收 | Task 11 步骤 4 |

**类型一致性检查**：
- `PivotRow.byYear` 在 Task 1 定义 → Task 3/4 使用 `r.byYear[y]?.<field>` ✅
- `computeTrend` 返回 `{ delta, arrow, color, text }` Task 2 定义 → Task 3/4 解构 `trend.color`、`trend.text` ✅
- `trendColorClass` 映射在 Task 2 定义 → Task 3/4 用 `trendColorClass[trend.color]` ✅
- 卡片组件 props 在 Task 6-9 定义 → Task 10 调用站点字段名一一对应 ✅

**Placeholder 扫描**：无 TBD/TODO/"以此类推"/"省略"。
