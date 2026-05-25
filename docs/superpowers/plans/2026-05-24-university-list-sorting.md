# 院校列表页排序改造实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/universities` 列表页排序从 6 个升序 segment 按钮扩到 15+ 个维度（含校友会/QS/USNews/泰晤士/A 类学科/就业率/薪资/满意度/校园面积/建校年份），升降序切换，"更多排序"popover 折叠高级选项，默认排序改为 `softRanking ASC + is985 DESC + is211 DESC`（isFeatured 全空不能用）。

**Architecture:** 后端 DTO 扩展 sortBy 枚举 (6→17) + service 加 mapSortBy 字段映射 + 新加字段索引利用；前端拆 4 个组件（sort-options.ts, SortButton, SortMorePopover, 更新 UniversityListTab）。

**Tech Stack:** Next.js 14, React 18, Nest.js, Prisma 7 (MariaDB adapter), Tailwind CSS, antd, Jest, @testing-library/react.

**前置 spec:** `docs/superpowers/specs/2026-05-24-university-list-sorting-redesign.md`

**前置 ETL（已完成）:** universities 表所有排序字段已有数据填充：校友会 697、QS 61、USNews 186、泰晤士 103、A 类学科 158、校园面积 2006(89.7%)、建校年份 2232(99.8%)。

---

## File Structure

**新增**：
- `apps/web/src/app/(main)/universities/components/sort/sort-options.ts` — 排序选项定义
- `apps/web/src/app/(main)/universities/components/sort/SortButton.tsx`
- `apps/web/src/app/(main)/universities/components/sort/SortMorePopover.tsx`
- `apps/web/src/app/(main)/universities/components/sort/__tests__/SortButton.test.tsx`
- `apps/web/src/app/(main)/universities/components/sort/__tests__/SortMorePopover.test.tsx`

**修改**：
- `apps/server/src/modules/university/dto/query-university.dto.ts` — sortBy 枚举从 6 个扩到 17 个，默认改 `softRank`，sortOrder 默认 `asc`（softRank 自然方向）
- `apps/server/src/modules/university/university.service.ts:78-82` — `orderByField` 改成 `mapSortBy()`；needsMemoryPath 列表扩充
- `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx` — 删除旧 `SORTS` 常量；替换 sort 按钮渲染区为 `SortButton[] + SortMorePopover`

---

## Task 1: 后端 DTO 扩展 + service mapSortBy

**Files:**
- Modify: `apps/server/src/modules/university/dto/query-university.dto.ts` (L72-80)
- Modify: `apps/server/src/modules/university/university.service.ts` (L78-82 + L107-109)
- Test: `apps/server/src/modules/university/university.service.spec.ts` (add a new describe)

**Goal:** sortBy 枚举从 6 扩到 17，service 中加字段映射表替代 if/else，扩展 needsMemoryPath 列表覆盖新加的 nullable 字段。

- [ ] **Step 1.1: Update DTO sortBy enum**

Replace L72-75 of `apps/server/src/modules/university/dto/query-university.dto.ts`:

```typescript
  @ApiPropertyOptional({
    description: '排序字段',
    enum: [
      'name', 'province', 'type',
      'minRank', 'tier', 'softRank',
      'rankingAlumni', 'rankingQS', 'rankingUSNews', 'rankingTimes',
      'aClassDisciplineCount', 'firstClassDisciplineCount',
      'employmentRate', 'avgSalary', 'furtherStudyRate',
      'satisfactionOverall', 'satisfactionLife', 'satisfactionEnviron',
      'campusArea', 'createdYear', 'heatScore', 'isFeatured',
    ],
  })
  @IsOptional()
  @IsIn([
    'name', 'province', 'type',
    'minRank', 'tier', 'softRank',
    'rankingAlumni', 'rankingQS', 'rankingUSNews', 'rankingTimes',
    'aClassDisciplineCount', 'firstClassDisciplineCount',
    'employmentRate', 'avgSalary', 'furtherStudyRate',
    'satisfactionOverall', 'satisfactionLife', 'satisfactionEnviron',
    'campusArea', 'createdYear', 'heatScore', 'isFeatured',
  ])
  sortBy?: string = 'softRank';
```

(Note: default changed from `'name'` to `'softRank'` since isFeatured is 0% filled. softRank is best widely-available proxy for "推荐度".)

- [ ] **Step 1.2: Update service — add mapSortBy + extend needsMemoryPath**

In `apps/server/src/modules/university/university.service.ts`, replace the L77-82 logic block:

Before (L77-82):
```typescript
// minRank / tier 排序映射到科类冗余字段；softRank 映射到 softRanking 列；其余沿用 university 标量字段
const orderByField =
  sortBy === 'minRank' ? minRankField
  : sortBy === 'tier' ? predRankField
  : sortBy === 'softRank' ? 'softRanking'
  : sortBy;
```

After:
```typescript
// 把外部 sortBy 值映射到 prisma university 模型的实际字段名
// minRank / tier 跟随 examType 选物/史字段；softRank 是固定 softRanking 别名；
// 其他都是 1:1 直接映射（已经是 prisma 字段名）
const orderByField = (() => {
  if (sortBy === 'minRank') return minRankField;
  if (sortBy === 'tier') return predRankField;
  if (sortBy === 'softRank') return 'softRanking';
  return sortBy;  // rankingAlumni / rankingQS / aClassDisciplineCount / ... 都已经是字段名
})();
```

Then replace L107-109 (`needsMemoryPath` definition):

Before:
```typescript
const needsMemoryPath =
  (tierFilter != null && userRank != null) ||
  sortBy === 'minRank' || sortBy === 'tier' || sortBy === 'softRank';
```

After:
```typescript
// 所有可空字段排序都走内存路径,用 sortRows 让 NULL 沉底（MariaDB ASC 默认 NULL 在前）
const NULLABLE_SORT_BYS = new Set([
  'minRank', 'tier', 'softRank',
  'rankingAlumni', 'rankingQS', 'rankingUSNews', 'rankingTimes',
  'aClassDisciplineCount', 'firstClassDisciplineCount',
  'employmentRate', 'avgSalary', 'furtherStudyRate',
  'satisfactionOverall', 'satisfactionLife', 'satisfactionEnviron',
  'campusArea', 'createdYear', 'heatScore',
]);
const needsMemoryPath =
  (tierFilter != null && userRank != null) ||
  NULLABLE_SORT_BYS.has(sortBy);
```

(Note: `name / province / type / isFeatured` 走 DB 排序 — 它们都是 NOT NULL 或者 boolean default false。)

- [ ] **Step 1.3: Write tests for the new sortBy values**

Append to `apps/server/src/modules/university/university.service.spec.ts` (find the existing describe wrapping service tests, add this nested describe):

```typescript
describe('findAll: extended sortBy mapping', () => {
  it.each([
    ['rankingAlumni', 'rankingAlumni'],
    ['rankingQS', 'rankingQS'],
    ['rankingUSNews', 'rankingUSNews'],
    ['rankingTimes', 'rankingTimes'],
    ['aClassDisciplineCount', 'aClassDisciplineCount'],
    ['campusArea', 'campusArea'],
    ['createdYear', 'createdYear'],
    ['heatScore', 'heatScore'],
  ])('sortBy=%s goes through memory path (nullable field)', async (sortBy, _expectedField) => {
    const fakeFindMany = jest.fn().mockResolvedValue([
      { id: 1, name: '北大', is985: true, is211: true, [sortBy]: 1 },
      { id: 2, name: '清华', is985: true, is211: true, [sortBy]: null },
    ]);
    (service as any).prisma.university.findMany = fakeFindMany;
    (service as any).prisma.university.count = jest.fn().mockResolvedValue(2);
    await service.findAll({ sortBy, sortOrder: 'asc' } as any);
    // memory path uses findMany without skip/take
    const call = fakeFindMany.mock.calls[0]?.[0] ?? {};
    expect(call.skip).toBeUndefined();
    expect(call.take).toBeUndefined();
  });

  it('sortBy=name goes through DB path (not in NULLABLE set)', async () => {
    const fakeFindMany = jest.fn().mockResolvedValue([]);
    (service as any).prisma.university.findMany = fakeFindMany;
    (service as any).prisma.university.count = jest.fn().mockResolvedValue(0);
    await service.findAll({ sortBy: 'name', sortOrder: 'asc', page: 1, pageSize: 20 } as any);
    const call = fakeFindMany.mock.calls[0]?.[0] ?? {};
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
    expect(call.orderBy).toEqual({ name: 'asc' });
  });
});
```

- [ ] **Step 1.4: Run tests**

```bash
cd apps/server && pnpm jest university.service.spec.ts -t 'extended sortBy mapping' 2>&1 | tail -20
```
Expected: PASS · 9 tests

- [ ] **Step 1.5: Typecheck**

```bash
cd apps/server && pnpm tsc --noEmit 2>&1 | grep -E "university.service|query-university" | head -10
```
Expected: 无 NEW error。

- [ ] **Step 1.6: Commit**

```bash
git add apps/server/src/modules/university/dto/query-university.dto.ts \
        apps/server/src/modules/university/university.service.ts \
        apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(university): expand sortBy enum to 17 dimensions

Adds rankingAlumni/QS/USNews/Times, aClassDisciplineCount /
firstClassDisciplineCount, employmentRate/avgSalary/furtherStudyRate,
satisfactionOverall/Life/Environ, campusArea/createdYear/heatScore,
isFeatured. Default changed from 'name' to 'softRank' (isFeatured is
0% filled). Nullable fields go through memory sort path for NULL-last
ordering.

Tests cover: mapping for nullable fields takes memory path, name
takes DB path with skip/take and orderBy."
```

---

## Task 2: 前端 sort-options.ts

**Files:**
- Create: `apps/web/src/app/(main)/universities/components/sort/sort-options.ts`

**Goal:** 17 个排序选项的元数据 — label, group, lockedAsc, defaultDir, requiresExamType, requiresUserRank。

- [ ] **Step 2.1: Create file**

Create `apps/web/src/app/(main)/universities/components/sort/sort-options.ts`:

```typescript
/**
 * 院校列表排序选项定义。
 * - hot 组（6 个）：常驻在主排序栏；其他组在 "更多排序" popover 内
 * - lockedAsc：排名类（"#1 最佳"），不允许降序
 * - defaultDir：第一次点击的方向
 * - requiresExamType / requiresUserRank：未满足时按钮 disabled
 */

export type SortDirection = 'asc' | 'desc';

export type SortGroup = 'hot' | 'ranking' | 'discipline' | 'employment' | 'satisfaction' | 'other';

export interface SortOption {
  key: string;          // 传给后端的 sortBy
  label: string;
  group: SortGroup;
  lockedAsc?: boolean;
  defaultDir: SortDirection;
  requiresExamType?: boolean;
  requiresUserRank?: boolean;
}

export const SORT_OPTIONS: SortOption[] = [
  // 热门组
  { key: 'softRank',  label: '默认',   group: 'hot', defaultDir: 'asc', lockedAsc: true },
  { key: 'minRank',   label: '位次',   group: 'hot', defaultDir: 'asc', lockedAsc: true, requiresExamType: true },
  { key: 'softRank',  label: '软科',   group: 'hot', defaultDir: 'asc', lockedAsc: true },
  { key: 'tier',      label: '冲稳保', group: 'hot', defaultDir: 'asc', lockedAsc: true, requiresUserRank: true },
  { key: 'province',  label: '省份',   group: 'hot', defaultDir: 'asc' },
  { key: 'type',      label: '类型',   group: 'hot', defaultDir: 'asc' },

  // 院校排名（排名类锁升序）
  { key: 'rankingAlumni',  label: '校友会',  group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingQS',      label: 'QS',      group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingUSNews',  label: 'USNews',  group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingTimes',   label: '泰晤士',  group: 'ranking', defaultDir: 'asc', lockedAsc: true },

  // 学科实力
  { key: 'aClassDisciplineCount',    label: 'A 类学科数', group: 'discipline', defaultDir: 'desc' },
  { key: 'firstClassDisciplineCount', label: '双一流学科数', group: 'discipline', defaultDir: 'desc' },

  // 就业表现
  { key: 'employmentRate',   label: '就业率',  group: 'employment', defaultDir: 'desc' },
  { key: 'avgSalary',        label: '平均薪资', group: 'employment', defaultDir: 'desc' },
  { key: 'furtherStudyRate', label: '考研率',  group: 'employment', defaultDir: 'desc' },

  // 学生评价
  { key: 'satisfactionOverall', label: '综合满意度', group: 'satisfaction', defaultDir: 'desc' },
  { key: 'satisfactionLife',    label: '生活满意度', group: 'satisfaction', defaultDir: 'desc' },
  { key: 'satisfactionEnviron', label: '环境满意度', group: 'satisfaction', defaultDir: 'desc' },

  // 其他
  { key: 'campusArea',  label: '校园面积', group: 'other', defaultDir: 'desc' },
  { key: 'createdYear', label: '建校年份', group: 'other', defaultDir: 'asc' },
  { key: 'heatScore',   label: '热度',    group: 'other', defaultDir: 'desc' },
];

export const GROUP_LABELS: Record<SortGroup, string> = {
  hot: '',  // 热门组不显示标签
  ranking: '院校排名',
  discipline: '学科实力',
  employment: '就业表现',
  satisfaction: '学生评价',
  other: '其他',
};
```

- [ ] **Step 2.2: Commit (no test, pure data)**

```bash
git add apps/web/src/app/\(main\)/universities/components/sort/sort-options.ts
git commit -m "feat(universities/sort): add sort-options.ts with 21 entries

Defines 6 hot + 4 ranking + 2 discipline + 3 employment + 3 satisfaction
+ 3 other = 21 sort options across 6 groups. Ranking-class locked to asc.
Some require examType / userRank."
```

---

## Task 3: `SortButton` 组件 (TDD)

**Files:**
- Create: `apps/web/src/app/(main)/universities/components/sort/SortButton.tsx`
- Create: `apps/web/src/app/(main)/universities/components/sort/__tests__/SortButton.test.tsx`

**Goal:** 单个排序按钮，支持 3 态循环（未选 → 升 → 降 → 未选），排名类锁升序，disabled 状态。

- [ ] **Step 3.1: Write failing tests**

Create `apps/web/src/app/(main)/universities/components/sort/__tests__/SortButton.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import SortButton from '../SortButton';
import type { SortOption } from '../sort-options';

const hotOption: SortOption = { key: 'minRank', label: '位次', group: 'hot', defaultDir: 'asc', lockedAsc: true, requiresExamType: true };
const flexOption: SortOption = { key: 'avgSalary', label: '平均薪资', group: 'employment', defaultDir: 'desc' };

describe('SortButton', () => {
  it('未选时不显示方向图标', () => {
    render(<SortButton option={flexOption} current={null} disabled={false} onChange={jest.fn()} />);
    const btn = screen.getByRole('button', { name: /平均薪资/ });
    expect(btn.textContent).not.toMatch(/↑|↓/);
  });

  it('选中时显示对应方向图标', () => {
    render(<SortButton option={flexOption} current={{ key: 'avgSalary', direction: 'desc' }} disabled={false} onChange={jest.fn()} />);
    const btn = screen.getByRole('button', { name: /平均薪资/ });
    expect(btn.textContent).toMatch(/↓/);
  });

  it('点击未选按钮 → emit defaultDir', () => {
    const onChange = jest.fn();
    render(<SortButton option={flexOption} current={null} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /平均薪资/ }));
    expect(onChange).toHaveBeenCalledWith('avgSalary', 'desc');
  });

  it('点击 asc → desc (非锁升序)', () => {
    const onChange = jest.fn();
    render(<SortButton option={flexOption} current={{ key: 'avgSalary', direction: 'asc' }} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /平均薪资/ }));
    expect(onChange).toHaveBeenCalledWith('avgSalary', 'desc');
  });

  it('点击 desc → null (取消)', () => {
    const onChange = jest.fn();
    render(<SortButton option={flexOption} current={{ key: 'avgSalary', direction: 'desc' }} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /平均薪资/ }));
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it('锁升序按钮：点击 asc → null（跳过 desc）', () => {
    const onChange = jest.fn();
    render(<SortButton option={hotOption} current={{ key: 'minRank', direction: 'asc' }} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /位次/ }));
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it('锁升序按钮：不显示 ↓ 图标', () => {
    render(<SortButton option={hotOption} current={{ key: 'minRank', direction: 'asc' }} disabled={false} onChange={jest.fn()} />);
    const btn = screen.getByRole('button', { name: /位次/ });
    expect(btn.textContent).not.toMatch(/↓/);
    expect(btn.textContent).toMatch(/↑/);
  });

  it('disabled 状态：点击无效', () => {
    const onChange = jest.fn();
    render(<SortButton option={hotOption} current={null} disabled={true} onChange={onChange} />);
    const btn = screen.getByRole('button', { name: /位次/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run tests to verify fail**

```bash
cd apps/web && pnpm jest SortButton 2>&1 | tail -15
```
Expected: FAIL — component not found

- [ ] **Step 3.3: Implement**

Create `apps/web/src/app/(main)/universities/components/sort/SortButton.tsx`:

```tsx
'use client';
import type { SortDirection, SortOption } from './sort-options';

interface Props {
  option: SortOption;
  current: { key: string; direction: SortDirection } | null;
  disabled: boolean;
  onChange: (key: string | null, direction: SortDirection | null) => void;
}

export default function SortButton({ option, current, disabled, onChange }: Props) {
  const isActive = current?.key === option.key;
  const direction = isActive ? current.direction : null;

  const handleClick = () => {
    if (!isActive) {
      onChange(option.key, option.defaultDir);
      return;
    }
    // 已选中,循环切换
    if (option.lockedAsc) {
      // 锁升序：asc → null（跳过 desc）
      onChange(null, null);
    } else if (direction === option.defaultDir) {
      // 第一次循环：defaultDir → 反方向
      onChange(option.key, option.defaultDir === 'asc' ? 'desc' : 'asc');
    } else {
      // 第二次循环：反方向 → null（取消）
      onChange(null, null);
    }
  };

  const icon = !isActive ? '' : direction === 'asc' ? ' ↑' : ' ↓';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
        isActive
          ? 'bg-surface-high text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
          : disabled
            ? 'cursor-not-allowed bg-bg text-text-faint'
            : 'bg-bg text-text-tertiary hover:text-primary'
      }`}
    >
      {option.label}{icon}
    </button>
  );
}
```

- [ ] **Step 3.4: Run tests pass**

```bash
cd apps/web && pnpm jest SortButton 2>&1 | tail -10
```
Expected: PASS · 8 tests

- [ ] **Step 3.5: Commit**

```bash
git add apps/web/src/app/\(main\)/universities/components/sort/SortButton.tsx \
        apps/web/src/app/\(main\)/universities/components/sort/__tests__/SortButton.test.tsx
git commit -m "feat(universities/sort): add SortButton with 3-state cycle"
```

---

## Task 4: `SortMorePopover` 组件 (TDD)

**Files:**
- Create: `apps/web/src/app/(main)/universities/components/sort/SortMorePopover.tsx`
- Create: `apps/web/src/app/(main)/universities/components/sort/__tests__/SortMorePopover.test.tsx`

**Goal:** "更多排序 (N) ↓" 触发按钮 + popover 浮层 (antd Popover)，分组展示 non-hot 选项。点击外面自动关闭。Popover 内的按钮复用 SortButton。

- [ ] **Step 4.1: Write failing tests**

Create `apps/web/src/app/(main)/universities/components/sort/__tests__/SortMorePopover.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import SortMorePopover from '../SortMorePopover';
import { SORT_OPTIONS } from '../sort-options';

const moreOptions = SORT_OPTIONS.filter((o) => o.group !== 'hot');

describe('SortMorePopover', () => {
  it('按钮 label 包含 "更多排序 (N)" 显示 non-hot 选项个数', () => {
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /更多排序/ }).textContent).toMatch(/15/);
  });

  it('默认 popover 内容未展开', () => {
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={jest.fn()} />);
    expect(screen.queryByText('校友会')).toBeNull();
  });

  it('点击触发按钮后展开 popover，看到 5 个 group 标签', () => {
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /更多排序/ }));
    // antd Popover 在 mount 时通常先渲染，触发显示
    expect(screen.getByText('院校排名')).toBeInTheDocument();
    expect(screen.getByText('学科实力')).toBeInTheDocument();
    expect(screen.getByText('就业表现')).toBeInTheDocument();
    expect(screen.getByText('学生评价')).toBeInTheDocument();
    expect(screen.getByText('其他')).toBeInTheDocument();
  });

  it('展开后点击其中一个 SortButton，emit 给父组件', () => {
    const onChange = jest.fn();
    render(<SortMorePopover options={moreOptions} current={null} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /更多排序/ }));
    fireEvent.click(screen.getByRole('button', { name: /校友会/ }));
    expect(onChange).toHaveBeenCalledWith('rankingAlumni', 'asc');
  });
});
```

- [ ] **Step 4.2: Run fail**

```bash
cd apps/web && pnpm jest SortMorePopover 2>&1 | tail -15
```

- [ ] **Step 4.3: Implement**

Create `apps/web/src/app/(main)/universities/components/sort/SortMorePopover.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import SortButton from './SortButton';
import { GROUP_LABELS, type SortDirection, type SortOption } from './sort-options';

interface Props {
  options: SortOption[];
  current: { key: string; direction: SortDirection } | null;
  disabled: boolean;
  onChange: (key: string | null, direction: SortDirection | null) => void;
}

export default function SortMorePopover({ options, current, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);

  // 按 group 分桶，保留 sort-options.ts 中定义的顺序
  const grouped = useMemo(() => {
    const groups = new Map<string, SortOption[]>();
    for (const o of options) {
      const arr = groups.get(o.group) ?? [];
      arr.push(o);
      groups.set(o.group, arr);
    }
    return Array.from(groups.entries());
  }, [options]);

  const handleSortChange = (key: string | null, direction: SortDirection | null) => {
    onChange(key, direction);
    // 选完一个就关闭浮层
    setOpen(false);
  };

  const content = (
    <div className="space-y-3 min-w-[420px] max-w-[560px]">
      {grouped.map(([group, opts]) => (
        <div key={group}>
          <div className="text-[10px] uppercase tracking-[1.4px] text-text-muted mb-1.5">
            {GROUP_LABELS[group as keyof typeof GROUP_LABELS]}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {opts.map((o) => (
              <SortButton
                key={o.key}
                option={o}
                current={current}
                disabled={false}
                onChange={handleSortChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomLeft">
      <button
        type="button"
        disabled={disabled}
        className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
          disabled ? 'cursor-not-allowed bg-bg text-text-faint' : 'bg-bg text-text-tertiary hover:text-primary'
        }`}
      >
        更多排序 ({options.length}) <DownOutlined className="ml-1 text-[10px]" />
      </button>
    </Popover>
  );
}
```

- [ ] **Step 4.4: Run tests pass**

```bash
cd apps/web && pnpm jest SortMorePopover 2>&1 | tail -10
```
Expected: PASS · 4 tests

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/app/\(main\)/universities/components/sort/SortMorePopover.tsx \
        apps/web/src/app/\(main\)/universities/components/sort/__tests__/SortMorePopover.test.tsx
git commit -m "feat(universities/sort): add SortMorePopover for non-hot options"
```

---

## Task 5: `UniversityListTab` 集成

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx` (L23-34 + L542-566)

**Goal:** 删除老 `SORTS` 常量；替换 sort 按钮渲染逻辑为 `SortButton[] (hot) + SortMorePopover (others)`；activeSort state；onChange 同步到 filters。

- [ ] **Step 5.1: Remove old SORTS constant + add imports**

In `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`:

Remove L23-34 (the `SORTS: Array<...>` constant block).

Add to imports section (top of file):

```typescript
import { SORT_OPTIONS, type SortDirection } from './sort/sort-options';
import SortButton from './sort/SortButton';
import SortMorePopover from './sort/SortMorePopover';
```

- [ ] **Step 5.2: Replace sort button rendering**

In the same file around L542-566, replace the `<div className="flex flex-wrap gap-2"> {SORTS.map(...)} </div>` block with:

```tsx
<div className="flex flex-wrap gap-2 items-center">
  {SORT_OPTIONS.filter((o) => o.group === 'hot').map((o) => {
    const disabled =
      (o.requiresExamType && !examType) ||
      (o.requiresUserRank && studentRank == null);
    return (
      <SortButton
        key={o.key + ':' + o.group}
        option={o}
        current={{ key: filters.sortBy ?? 'softRank', direction: (filters.sortOrder ?? 'asc') as SortDirection }}
        disabled={disabled}
        onChange={(key, dir) => {
          setFilters({
            ...filters,
            sortBy: key ?? 'softRank',           // null 时回默认
            sortOrder: dir ?? 'asc',
            page: 1,
          });
        }}
      />
    );
  })}
  <SortMorePopover
    options={SORT_OPTIONS.filter((o) => o.group !== 'hot')}
    current={{ key: filters.sortBy ?? 'softRank', direction: (filters.sortOrder ?? 'asc') as SortDirection }}
    disabled={false}
    onChange={(key, dir) => {
      setFilters({
        ...filters,
        sortBy: key ?? 'softRank',
        sortOrder: dir ?? 'asc',
        page: 1,
      });
    }}
  />
</div>
```

- [ ] **Step 5.3: Update default filters initial value (if hardcoded 'name' somewhere)**

Search for `sortBy: 'name'` in `UniversityListTab.tsx` and replace with `sortBy: 'softRank'` if found (likely around the initial `filters` state).

- [ ] **Step 5.4: Typecheck**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "UniversityListTab" | head -10
```
Expected: 无 error

- [ ] **Step 5.5: Run all university list tests**

```bash
cd apps/web && pnpm jest universities/components 2>&1 | tail -15
```
Expected: 所有 test pass，包含 SortButton/SortMorePopover 新增的

- [ ] **Step 5.6: Commit**

```bash
git add apps/web/src/app/\(main\)/universities/components/UniversityListTab.tsx
git commit -m "feat(universities): integrate new sort components into list page

Replaces 6-option SORTS constant with hot SortButton[] (6 entries) plus
SortMorePopover (15 advanced options). Default sortBy changed from
'name' to 'softRank' (matching backend default)."
```

---

## Task 6: 手动验证 + 部署 (USER GATE)

**Files:** none (operational)

**Goal:** merge worktree → master，部署，清缓存，肉眼验证。

⚠️ 涉及生产，部署前 USER GATE。

- [ ] **Step 6.1: User confirm**

跟用户确认所有代码 commit 完毕、tests pass，准备部署。

- [ ] **Step 6.2: Merge worktree → master**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
git checkout master
git merge worktree-sorting-redesign --no-ff -m "Merge: university list sorting redesign"
```

- [ ] **Step 6.3: Deploy**

```bash
python deploy_auto.py
```

- [ ] **Step 6.4: Clear Redis cache**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 'for p in "university:*" "cache:university:*" "hot-universities:*" "universities:list:*"; do redis-cli KEYS "$p" | xargs -r redis-cli DEL > /dev/null; done'
```

- [ ] **Step 6.5: 用户线上 spot-check**

- 进 `http://132.232.245.53:3004/universities` — 看到 6 个 hot 按钮 + `更多排序 (15) ↓`
- 点击 "校园面积 ↓" — 列表按校园面积降序排（北京化工大学/北航/...）
- 点击 "平均薪资 ↓" — 列表按薪资降序排（可能数据稀疏，看到的院校少）
- 点击 "软科 ↑"（默认）— 列表回到默认状态
- 点击任意按钮 3 次 — 选中 → 切方向 → 取消
- 排名类按钮（QS / 校友会）点 2 次 → 直接取消（不切到 desc）
- 浏览器 console 无 error

---

## Self-Review

### Spec coverage

| Spec 章节 | 对应 Task |
|---|---|
| §3.1 UI 热门按钮 + 浮层 | Task 3 + 4 + 5 |
| §3.2 升降序 3 态循环 + 排名类锁 | Task 3 (SortButton tests cover) |
| §3.3 默认 isFeatured DESC + softRank ASC | Task 1 (默认改 softRank) + Task 5 |
| §3.4 examInfo 交互 | Task 5 (disabled 判断) |
| §4.1 DTO 扩展 17 维 | Task 1.1 |
| §4.2 service mapSortBy | Task 1.2 |
| §4.3 索引 | 已在 ETL Task 1 加，本 plan 不再加 |
| §5 文件结构 | 上面 File Structure 章节 |

**spec §3.3 注意**：spec 说默认 `isFeatured DESC + softRanking ASC NULLS LAST` 复合排序。我把它简化为 `softRank ASC`，因为 isFeatured 0% 填充。spec §3.3 实际写的是 fallback 推荐 — 我的实现更激进（直接干掉 isFeatured 部分）。如果用户希望严格按 spec，需要在 service 加一段 isFeatured-orderBy；当前选简化版。

### Placeholder scan

- ✅ 无 TBD / TODO
- ✅ 每个 step 含完整 code

### Type consistency

- `SortOption / SortDirection` 定义在 sort-options.ts (Task 2)，被 Tasks 3/4/5 一致使用
- service `sortBy` 类型 `string`，DTO 限制为 17 值的 enum union
- 默认 `softRank` 在 DTO / UniversityListTab / SortMorePopover fallback 一致

---

## Execution

按 subagent-driven-development skill 执行。Task 1-5 可派 sonnet implementer。Task 6 controller 自己跑（含 USER GATE）。

Total: 6 tasks, 估时 4-6 小时。
