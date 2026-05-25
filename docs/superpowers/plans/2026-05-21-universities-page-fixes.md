# universities 院校库页面功能改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `/universities` 页面的功能性问题，并补齐科类切换与考生位次联动。

**Architecture:** 分 4 个单元递进交付——(1) 列表杂项修复、(2) 筛选器接入后端 `/filters`、(3) 后端 `findAll` 科类化并加位次冗余字段、(4) 前端科类切换与冲稳保联动。后端在 `University` 表加 6 个位次冗余字段（方案 A），由独立回填脚本填充。单元 3 是单元 4 的前置。

**Tech Stack:** Next.js 14 / React 18 / antd 5 / TanStack Query / Zustand（前端）；NestJS 10 / Prisma 7 / MariaDB（后端）；Jest（前后端测试）。

**对应设计文档:** `docs/superpowers/specs/2026-05-21-universities-page-fixes-design.md`

**测试命令约定:**
- 后端：在 `apps/server` 目录运行 `pnpm test -- <pattern>`（Jest，testRegex `.*\.spec\.ts$`）
- 前端：在 `apps/web` 目录运行 `pnpm test -- <pattern>`（Jest + @testing-library/react）

---

## 文件结构

**新建：**
- `apps/web/src/hooks/useDebouncedValue.ts` + `__tests__/useDebouncedValue.test.ts` — 通用防抖 hook（单元 1）
- `apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx` — 列表页组件测试（单元 1 起，逐单元扩充）
- `apps/server/src/modules/university/ranking-fields.ts` + `ranking-fields.spec.ts` — 院校位次聚合纯函数（单元 3）
- `apps/server/src/modules/university/rank-tier.ts` + `rank-tier.spec.ts` — 后端冲稳保分档（单元 3）
- `apps/server/scripts/backfill-university-ranks.ts` — 位次冗余字段回填脚本（单元 3）

**修改：**
- `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx` — 单元 1、2、4
- `apps/web/src/services/university.ts` — 筛选器/列表项类型、`examType` 等查询参数（单元 2、4）
- `apps/web/src/utils/classify-rank.ts` — 加与后端 `rank-tier` 同步的注记（单元 3 Task 10）
- `apps/server/src/modules/university/university.service.ts` — `getFilters`、`findAll`（单元 2、3）
- `apps/server/src/modules/university/university.service.spec.ts` — 测试扩充（单元 2、3）
- `apps/server/src/modules/university/dto/query-university.dto.ts` — `examType`/`sortBy`/`tierFilter`/`userRank`（单元 3）
- `apps/server/prisma/schema.prisma` — `University` 加 6 个位次冗余字段（单元 3）
- `apps/server/package.json` — 新增 `backfill:ranks` 脚本（单元 3）

**说明:** 单元 4 的冲稳保标签全部复用既有 `apps/web/src/utils/classify-rank.ts`、`admission-thresholds.ts` 与 `apps/web/src/components/admission/RankTierBadge.tsx`、`RankDistance.tsx`，不新建分类逻辑。

---

## 单元 1 · 列表页杂项修复

全部改动集中在 `UniversityListTab.tsx`，外加一个新的防抖 hook。各 Task 独立、可分别 commit。

### Task 1: 移除对比功能

对比功能本次不做（设计决策：完整对比另立项），先移除当前的死按钮与星标多选。

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`

- [ ] **Step 1: 删除 UniversityCard 的对比相关代码**

`UniversityCard` 函数（当前 L209-294）：删除 `selected`、`onToggleSelect` 两个 prop，删除末尾的星标按钮 `<div>`（当前 L280-291），并把 grid 列定义去掉最后的 `48px` 列。

改动后的 `UniversityCard` 签名与 grid 容器：

```tsx
function UniversityCard({ uni }: { uni: any }) {
  const tags: string[] = [];
  if (uni.is985) tags.push('985');
  if (uni.is211) tags.push('211');
  if (uni.isDoubleFirstClass) tags.push('双一流');

  const admission = uni.latestAdmission;
  const infoItems = [uni.type, uni.province, uni.city, uni.runningNature].filter(Boolean);

  return (
    <div className="grid gap-4 rounded-xl bg-surface px-4 py-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover sm:px-5 lg:grid-cols-[64px_minmax(0,1fr)_140px] lg:items-center">
```

> 本 Task 仅删对比相关代码，`UniversityCard` 的 `uni` 保持现状的 `any`。`UniversityListItem` 类型在 Task 14 定义，Task 16 再把签名收紧为 `UniversityListItem`。

删除整段星标按钮（当前 L280-291 的 `<div className="flex items-center justify-center">...</div>`）。

- [ ] **Step 2: 删除 UniversityListTab 的对比状态与按钮**

在 `UniversityListTab` 函数体内：
- 删除 `selectedIds` state（当前 L347）：`const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());`
- 删除 `toggleSelect` 函数（当前 L383-393）
- 删除页头「对比已选」按钮（当前 L409-415 的整个 `<button>`）
- `UniversityCard` 调用处（当前 L488-494）改为不传对比 props：

```tsx
{universities.map((uni: any) => (
  <UniversityCard key={uni.id} uni={uni} />
))}
```

删除后 `import` 行里的 `StarOutlined` 不再使用，一并从 `@ant-design/icons` 的 import 中移除。

- [ ] **Step 3: 验证编译与既有测试**

Run（在 `apps/web`）: `pnpm test -- universities`
Expected: 既有 `RankRow`、`BoardSection` 测试 PASS，无新失败。

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功，无 TypeScript / lint 报错（特别是无「`StarOutlined` 未使用」「`selectedIds` 未使用」类报错）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx
git commit -m "refactor(web): remove non-functional university compare UI"
```

### Task 2: 标题与数量改用真实数据

页头硬编码的 `2,237 所院校`、`2022-2025`、985/211/双一流计数全部与真实数据脱钩，改为用接口返回值或删除。

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`
- Test: `apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx`（新建）

- [ ] **Step 1: 写失败测试**

新建 `apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx`：

```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UniversityListTab } from '../UniversityListTab';
import { universityService } from '@/services/university';

jest.mock('@/services/university');
jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

const mockedService = universityService as jest.Mocked<typeof universityService>;

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UniversityListTab />
    </QueryClientProvider>,
  );
}

describe('UniversityListTab header', () => {
  beforeEach(() => {
    mockedService.getList.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 12, total: 1893, totalPages: 158 },
    });
    mockedService.getHot.mockResolvedValue([]);
    mockedService.getFilters.mockResolvedValue({
      provinces: [], types: [], cities: [], levels: [], grades: [],
    });
  });

  it('shows the real total from the API, not a hardcoded number', async () => {
    renderTab();
    expect(await screen.findByText(/1,?893/)).toBeInTheDocument();
    expect(screen.queryByText(/2,237/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: FAIL —— 页面渲染的是硬编码 `2,237`，找不到 `1,893`。

- [ ] **Step 3: 实现 —— 标题用真实 total**

`UniversityListTab` 页头区块（当前 L397-416）改为：

```tsx
<div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
  <div>
    <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
      University Directory · 院校库
    </div>
    <h1 className="m-0 font-serif text-[32px] font-semibold leading-tight text-text sm:text-[36px]">
      {total.toLocaleString()} 所院校 · 在川招生
    </h1>
    <p className="mt-2 text-sm text-text-tertiary">
      按省份、类型、层次筛选，结合录取位次找到更值得关注的学校。
    </p>
  </div>
</div>
```

> 同时删除了页头的对比按钮残留（Task 1 已删）。`覆盖 2022-2025 录取数据` 这句写死年份直接去掉。

- [ ] **Step 4: 实现 —— 删除 FeatureFilters 的硬编码计数**

`FeatureFilters`（当前 L86-124）中 `featureItems` 的 `count` 字段是全国数字、与库内口径不符，删除整列展示。`featureItems` 改为：

```tsx
const featureItems: Array<{ key: 'is985' | 'is211' | 'isDoubleFirstClass'; label: string }> = [
  { key: 'is985', label: '985 工程' },
  { key: 'is211', label: '211 工程' },
  { key: 'isDoubleFirstClass', label: '双一流' },
];
```

按钮内右侧显示 `count` 的 `<span>`（当前 L117）删除，只保留 `<span>{item.label}</span>`。

- [ ] **Step 5: 跑测试确认通过**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx
git commit -m "fix(web): replace hardcoded university counts with API data"
```

### Task 3: 搜索框防抖

`Input onChange` 当前每输入一个字符就 `setFilters` 触发请求。抽一个通用防抖 hook，对 keyword 加 300ms 防抖。

**Files:**
- Create: `apps/web/src/hooks/useDebouncedValue.ts`
- Test: `apps/web/src/hooks/__tests__/useDebouncedValue.test.ts`
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`

- [ ] **Step 1: 写失败测试**

新建 `apps/web/src/hooks/__tests__/useDebouncedValue.test.ts`：

```ts
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '../useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('delays updates by the given delay', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    );
    rerender({ v: 'ab' });
    expect(result.current).toBe('a'); // not yet
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('ab');
  });

  it('collapses rapid changes into the last value', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    );
    rerender({ v: 'ab' });
    act(() => { jest.advanceTimersByTime(100); });
    rerender({ v: 'abc' });
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('abc');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/web`）: `pnpm test -- useDebouncedValue`
Expected: FAIL —— `useDebouncedValue` 模块不存在。

- [ ] **Step 3: 实现 hook**

新建 `apps/web/src/hooks/useDebouncedValue.ts`：

```ts
import { useEffect, useState } from 'react';

/** 返回 value 的防抖副本：value 停止变化 delayMs 毫秒后才更新。 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run（在 `apps/web`）: `pnpm test -- useDebouncedValue`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 在 UniversityListTab 接入防抖**

`UniversityListTab` 函数体内：keyword 输入框用独立本地 state，防抖后写入 `filters.keyword`。

在 `filters` state 声明后新增：

```tsx
const [keywordInput, setKeywordInput] = useState('');
const debouncedKeyword = useDebouncedValue(keywordInput, 300);

useEffect(() => {
  setFilters((prev) => ({ ...prev, keyword: debouncedKeyword || undefined, page: 1 }));
}, [debouncedKeyword]);
```

> 注意：`setFilters` 当前是 `useState` 的 setter，直接支持函数式更新；本计划统一用函数式更新避免闭包陈旧。

搜索框（当前 L420-428）改为受控于 `keywordInput`：

```tsx
<Input
  placeholder="搜索学校名 / 城市 / 关键词，例如“上海”“医科”"
  prefix={<SearchOutlined className="text-text-muted" />}
  value={keywordInput}
  onChange={(e) => setKeywordInput(e.target.value)}
  allowClear
  className="min-w-0 flex-1"
  size="large"
/>
```

文件顶部 import 增加：`import { useDebouncedValue } from '@/hooks/useDebouncedValue';`，并确保 `useEffect` 在 `react` 的 import 中。

- [ ] **Step 6: 验证**

Run（在 `apps/web`）: `pnpm test -- universities`
Expected: PASS。

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/useDebouncedValue.ts apps/web/src/hooks/__tests__/useDebouncedValue.test.ts apps/web/src/app/(main)/universities/components/UniversityListTab.tsx
git commit -m "perf(web): debounce university search input by 300ms"
```

### Task 4: 翻页回顶 + pageSize 选项一致

翻页后停在页面底部；`pageSize` 初始 12 不在 antd 默认尺寸选项内。两处纯 UI 行为微调，合并一个 commit。

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`

- [ ] **Step 1: 修改 Pagination**

`Pagination` 组件（当前 L505-513）改为：

```tsx
<Pagination
  current={filters.page}
  pageSize={filters.pageSize}
  total={total}
  showSizeChanger
  showQuickJumper
  pageSizeOptions={['12', '24', '48']}
  showTotal={(count) => `共 ${count} 所院校`}
  onChange={(page, pageSize) => {
    setFilters((prev) => ({ ...prev, page, pageSize }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }}
/>
```

- [ ] **Step 2: 验证**

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。

手动验证（dev 环境）：翻到第 2 页，页面滚回顶部；pageSize 下拉项为 12 / 24 / 48。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx
git commit -m "fix(web): scroll to top on pagination and align pageSize options"
```

---

## 单元 2 · 筛选器接入 /filters 接口

当前 `FilterPanel` 用硬编码的 `PROVINCES`/`TYPES` 常量并 `.slice()` 截断（四川等省份不可选）。改为接入后端已就绪的 `/universities/filters` 接口，并新增城市筛选。

### Task 5: 后端 getFilters —— cities 带省份归属、新增 natures

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts`
- Test: `apps/server/src/modules/university/university.service.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `university.service.spec.ts` 末尾追加：

```ts
describe('UniversityService.getFilters', () => {
  const buildService = () => {
    const prisma = {
      university: {
        groupBy: jest.fn()
          .mockResolvedValueOnce([{ province: '四川', _count: 100 }])            // provinces
          .mockResolvedValueOnce([{ type: '综合', _count: 50 }])                 // types
          .mockResolvedValueOnce([{ level: '本科', _count: 200 }])               // levels
          .mockResolvedValueOnce([{ province: '四川', city: '成都', _count: 80 }]) // cities
          .mockResolvedValueOnce([{ grade: '一线城市', _count: 10 }])             // grades
          .mockResolvedValueOnce([{ runningNature: '公办', _count: 150 }]),       // natures
      },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn().mockResolvedValue(undefined) };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc };
  };

  it('tags each city with its province', async () => {
    const { svc } = buildService();
    const filters: any = await svc.getFilters();
    expect(filters.cities[0]).toEqual({ value: '成都', count: 80, province: '四川' });
  });

  it('exposes natures from runningNature groupBy', async () => {
    const { svc } = buildService();
    const filters: any = await svc.getFilters();
    expect(filters.natures[0]).toEqual({ value: '公办', count: 150 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/server`）: `pnpm test -- university.service`
Expected: FAIL —— `cities[0]` 无 `province` 字段、`filters.natures` 为 `undefined`。

- [ ] **Step 3: 实现**

`getFilters()`（当前 L317-361）整体替换为：

```ts
async getFilters() {
  const cacheKey = 'university-filters';
  const cached = await this.redis.getCache(cacheKey);
  if (cached) return cached;

  const [provinces, types, levels, cities, grades, natures] = await Promise.all([
    this.prisma.university.groupBy({
      by: ['province'], _count: true, where: { province: { not: null } },
    }),
    this.prisma.university.groupBy({
      by: ['type'], _count: true, where: { type: { not: null } },
    }),
    this.prisma.university.groupBy({
      by: ['level'], _count: true, where: { level: { not: null } },
    }),
    this.prisma.university.groupBy({
      by: ['province', 'city'], _count: true, where: { city: { not: null } },
    }),
    this.prisma.university.groupBy({
      by: ['grade'], _count: true, where: { grade: { not: null } },
    }),
    this.prisma.university.groupBy({
      by: ['runningNature'], _count: true, where: { runningNature: { not: null } },
    }),
  ]);

  const filters = {
    provinces: provinces.map((p) => ({ value: p.province, count: p._count })),
    types: types.map((t) => ({ value: t.type, count: t._count })),
    levels: levels.map((l) => ({ value: l.level, count: l._count })),
    cities: cities.map((c) => ({ value: c.city, count: c._count, province: c.province })),
    grades: grades.map((g) => ({ value: g.grade, count: g._count })),
    natures: natures.map((n) => ({ value: n.runningNature, count: n._count })),
  };

  await this.redis.setCache(cacheKey, filters, 86400);
  return filters;
}
```

> `_count: true` 在多字段 `groupBy(['province','city'])` 下返回该分组的行数（`number`）。

- [ ] **Step 4: 跑测试确认通过**

Run（在 `apps/server`）: `pnpm test -- university.service`
Expected: PASS（含既有 findById / findAll / getCampusPois / getPickerOptions 用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/university/university.service.ts apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(server): getFilters returns province-tagged cities and natures"
```

### Task 6: 前端筛选器接入 getFilters

**Files:**
- Modify: `apps/web/src/services/university.ts`
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`

- [ ] **Step 1: 在 service 定义筛选器类型**

`apps/web/src/services/university.ts`：在 `UniversityQueryParams` 之后新增类型，并收紧 `getFilters` 返回类型。

```ts
export interface FilterOption {
  value: string;
  count: number;
}

export interface CityFilterOption extends FilterOption {
  province: string;
}

export interface UniversityFilters {
  provinces: FilterOption[];
  types: FilterOption[];
  levels: FilterOption[];
  cities: CityFilterOption[];
  grades: FilterOption[];
  natures: FilterOption[];
}
```

`universityService.getFilters` 改为：

```ts
getFilters: (): Promise<UniversityFilters> => api.get('/universities/filters'),
```

- [ ] **Step 2: 重写 FilterGroup 接收带 count 的选项**

`UniversityListTab.tsx`：删除文件顶部的 `PROVINCES`、`TYPES`、`NATURES`、`LEVELS` 四个常量（当前 L18-27）。`FilterGroup`（当前 L41-84）改为：

```tsx
function FilterGroup({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: Array<{ value: string; count: number }>;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="border-b border-border-subtle py-4 last:border-b-0">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
        {title}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`flex w-full items-center justify-between rounded-md border-0 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
            !value ? 'bg-primary-fixed font-medium text-primary' : 'text-text-secondary hover:bg-surface-dim hover:text-text'
          }`}
        >
          <span>不限</span>
          <span className="text-[11px] text-text-faint">ALL</span>
        </button>
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(value === item.value ? undefined : item.value)}
            className={`flex w-full items-center justify-between rounded-md border-0 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              value === item.value ? 'bg-primary-fixed font-medium text-primary' : 'text-text-secondary hover:bg-surface-dim hover:text-text'
            }`}
          >
            <span>{item.value}</span>
            <span className="text-[11px] text-text-faint">{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: FilterPanel 内部拉取 getFilters 并渲染**

`FilterPanel`（当前 L126-175）改为内部 `useQuery` 拉取筛选项，渲染全部省份/类型/层次/办学性质（不再 `.slice()` 截断）。保持 `setFilters` 对象式签名不变：

```tsx
function FilterPanel({
  filters,
  setFilters,
  onClear,
}: {
  filters: UniversityQueryParams;
  setFilters: (filters: UniversityQueryParams) => void;
  onClear: () => void;
}) {
  const { data: options } = useQuery({
    queryKey: ['university-filters'],
    queryFn: () => universityService.getFilters(),
  });

  return (
    <aside className="rounded-xl bg-surface p-4 shadow-card lg:sticky lg:top-20">
      <div className="flex items-center justify-between">
        <h3 className="m-0 font-serif text-base font-semibold text-text">筛选</h3>
        <button
          type="button"
          onClick={onClear}
          className="border-0 bg-transparent text-[11px] uppercase tracking-[1.4px] text-text-faint transition-colors hover:text-primary"
        >
          清除
        </button>
      </div>

      <FeatureFilters filters={filters} setFilters={setFilters} />
      <FilterGroup
        title="所在地"
        items={options?.provinces ?? []}
        value={filters.province}
        onChange={(province) => setFilters({ ...filters, province, city: undefined, page: 1 })}
      />
      <FilterGroup
        title="学校类型"
        items={options?.types ?? []}
        value={filters.type}
        onChange={(type) => setFilters({ ...filters, type, page: 1 })}
      />
      <FilterGroup
        title="办学性质"
        items={options?.natures ?? []}
        value={filters.nature}
        onChange={(nature) => setFilters({ ...filters, nature, page: 1 })}
      />
      <FilterGroup
        title="办学层次"
        items={options?.levels ?? []}
        value={filters.level}
        onChange={(level) => setFilters({ ...filters, level, page: 1 })}
      />
    </aside>
  );
}
```

> `useQuery`、`universityService` 在文件内已 import（`HotUniversitiesSidebar` 已用），无需新增 import。`UniversityFilters` 等类型由 service 模块导出，按需在 import 中补上。

- [ ] **Step 4: 验证**

Run（在 `apps/web`）: `pnpm test -- universities`
Expected: PASS（Task 2 的 `UniversityListTab` 测试已在 `beforeEach` mock 了 `getFilters`）。

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功，无未使用变量报错（`PROVINCES` / `TYPES` / `NATURES` / `LEVELS` 已删除）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/university.ts apps/web/src/app/(main)/universities/components/UniversityListTab.tsx
git commit -m "feat(web): wire university filters to /filters API, drop hardcoded lists"
```

### Task 7: 新增城市筛选

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`

- [ ] **Step 1: FilterPanel 增加城市筛选组**

在 `FilterPanel` 的「所在地」`FilterGroup` 与「学校类型」`FilterGroup` 之间插入城市组。城市按已选省份过滤；未选省份时不渲染：

```tsx
{filters.province && (
  <FilterGroup
    title="城市"
    items={(options?.cities ?? []).filter((c) => c.province === filters.province)}
    value={filters.city}
    onChange={(city) => setFilters({ ...filters, city, page: 1 })}
  />
)}
```

> `CityFilterOption` 含 `value`/`count`/`province`，`FilterGroup` 只消费 `value`/`count`，类型结构兼容。

- [ ] **Step 2: 验证**

Run（在 `apps/web`）: `pnpm test -- universities`
Expected: PASS。

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。

手动验证（dev）：选「四川」后出现「城市」组并列出四川各市；切换省份城市跟随刷新；清除省份后城市组消失。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx
git commit -m "feat(web): add city filter linked to selected province"
```

---

## 单元 3 · 后端 findAll 科类化 + 位次冗余字段

采用方案 A（数据库冗余字段）。`University` 表加 6 个位次冗余字段（最低分/最低位次/预测位次 × 物理/历史），由独立回填脚本填充，`findAll` 据此纯单表完成科类化取数、排序与冲稳保筛选。

> 设计文档记为「4 个字段」；本计划额外冗余 `minScore` 两列，使 `findAll` 的 `latestAdmission` 也直接读冗余字段、彻底纯单表查询（无需 join `admissionRecords`），共 6 列。

**设计补充（classify 逻辑前后端分置）:** 冲稳保筛选需在后端对全量院校分档，而前端的 `classify-rank.ts` 被 7 处文件引用（含 `scores` 页、`admission` 组件），移入 `shared` 包会牵动这些无关文件。故后端在 university 模块内自建 `rank-tier.ts`，逻辑与阈值是前端 `classify-rank.ts` + `admission-thresholds.ts` 的独立副本。两份文件头部互相注明：修改分档逻辑或阈值时必须同步。

### Task 8: schema 新增 6 个位次冗余字段

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- 生成: `apps/server/prisma/migrations/<timestamp>_add_university_rank_fields/`

- [ ] **Step 1: 在 University model 增加字段**

`schema.prisma` 的 `model University`：在 `geoUpdatedAt DateTime? @map("geo_updated_at")`（当前 L290）之后、`campuses UniversityCampus[]`（当前 L292）之前，插入：

```prisma
  // 院校位次冗余字段（科类拆分，由 apps/server/scripts/backfill-university-ranks.ts 回填）
  minScorePhysics Int? @map("min_score_physics")
  minRankPhysics  Int? @map("min_rank_physics")
  minScoreHistory Int? @map("min_score_history")
  minRankHistory  Int? @map("min_rank_history")
  predRankPhysics Int? @map("pred_rank_physics")
  predRankHistory Int? @map("pred_rank_history")
```

并在该 model 末尾的 `@@index` 区块（当前 L301-306）追加 4 个排序用索引：

```prisma
  @@index([minRankPhysics])
  @@index([minRankHistory])
  @@index([predRankPhysics])
  @@index([predRankHistory])
```

- [ ] **Step 2: 生成并应用迁移**

Run（在 `apps/server`，需配置好 `DATABASE_URL`）:
`pnpm prisma migrate dev --name add_university_rank_fields`
Expected: 在 `prisma/migrations/` 下生成新迁移目录，6 个 `... Int? NULL` 列加入 `universities` 表，无数据丢失警告。

- [ ] **Step 3: 重新生成 Prisma Client**

Run（在 `apps/server`）: `pnpm prisma generate`
Expected: 成功。`PrismaClient` 的 `University` 类型带上 6 个新字段。

- [ ] **Step 4: 验证编译**

Run（在 `apps/server`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations
git commit -m "feat(server): add university rank redundancy columns (physics/history)"
```

### Task 9: 院校位次聚合纯函数 ranking-fields.ts

把「从录取记录算院校最低分/位次」「从预测记录取院校预测位次」抽成纯函数，供回填脚本使用并独立单测。

**Files:**
- Create: `apps/server/src/modules/university/ranking-fields.ts`
- Test: `apps/server/src/modules/university/ranking-fields.spec.ts`

- [ ] **Step 1: 写失败测试**

新建 `apps/server/src/modules/university/ranking-fields.spec.ts`：

```ts
import { aggregateMinScoreRank, pickUniversityPredRank } from './ranking-fields';

describe('aggregateMinScoreRank', () => {
  it('picks the lowest-score row across the year records', () => {
    const result = aggregateMinScoreRank([
      { majorMinScore: 520, majorMinRank: 30000, groupMinScore: null, groupMinRank: null },
      { majorMinScore: 480, majorMinRank: 55000, groupMinScore: null, groupMinRank: null },
      { majorMinScore: 510, majorMinRank: 38000, groupMinScore: null, groupMinRank: null },
    ]);
    expect(result).toEqual({ minScore: 480, minRank: 55000 });
  });

  it('falls back to groupMin when majorMin is null', () => {
    const result = aggregateMinScoreRank([
      { majorMinScore: null, majorMinRank: null, groupMinScore: 500, groupMinRank: 42000 },
    ]);
    expect(result).toEqual({ minScore: 500, minRank: 42000 });
  });

  it('returns null when no row has a usable score', () => {
    expect(aggregateMinScoreRank([
      { majorMinScore: null, majorMinRank: null, groupMinScore: null, groupMinRank: null },
    ])).toBeNull();
    expect(aggregateMinScoreRank([])).toBeNull();
  });
});

describe('pickUniversityPredRank', () => {
  it('takes the smallest pointRank (hardest group)', () => {
    expect(pickUniversityPredRank([
      { pointRank: 9000 }, { pointRank: 3000 }, { pointRank: 15000 },
    ])).toBe(3000);
  });

  it('ignores null pointRank and returns null when all null', () => {
    expect(pickUniversityPredRank([{ pointRank: null }, { pointRank: 7000 }])).toBe(7000);
    expect(pickUniversityPredRank([{ pointRank: null }])).toBeNull();
    expect(pickUniversityPredRank([])).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/server`）: `pnpm test -- ranking-fields`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

新建 `apps/server/src/modules/university/ranking-fields.ts`：

```ts
export interface AdmissionRow {
  majorMinScore: number | null;
  majorMinRank: number | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
}

/**
 * 院校某科类某年度的「最低分及对应位次」：分数最低的一条专业记录。
 * majorMinScore 优先、groupMinScore 兜底（与 UniversityService.aggregateLatestAdmission 同口径）。
 */
export function aggregateMinScoreRank(
  records: AdmissionRow[],
): { minScore: number; minRank: number | null } | null {
  let best: { score: number; rank: number | null } | null = null;
  for (const r of records) {
    const score = r.majorMinScore ?? r.groupMinScore;
    if (score == null) continue;
    const rank = r.majorMinScore != null ? r.majorMinRank : r.groupMinRank;
    if (best == null || score < best.score) best = { score, rank };
  }
  return best == null ? null : { minScore: best.score, minRank: best.rank };
}

/**
 * 院校某科类的「预测位次」：所有专业组预测里 pointRank 最小值（最难专业组作 benchmark，
 * 与 UniversityService.findById 的 bestPrediction 同口径）。recruitType 过滤在查询层完成。
 */
export function pickUniversityPredRank(
  predictions: Array<{ pointRank: number | null }>,
): number | null {
  let min: number | null = null;
  for (const p of predictions) {
    if (p.pointRank == null) continue;
    if (min == null || p.pointRank < min) min = p.pointRank;
  }
  return min;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run（在 `apps/server`）: `pnpm test -- ranking-fields`
Expected: PASS（6 个用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/university/ranking-fields.ts apps/server/src/modules/university/ranking-fields.spec.ts
git commit -m "feat(server): add university rank aggregation helpers"
```

### Task 10: 后端冲稳保分档 rank-tier.ts

后端冲稳保筛选所需的分档逻辑。是前端 `apps/web/src/utils/classify-rank.ts` + `admission-thresholds.ts` 的独立副本。

**Files:**
- Create: `apps/server/src/modules/university/rank-tier.ts`
- Test: `apps/server/src/modules/university/rank-tier.spec.ts`

- [ ] **Step 1: 写失败测试**

新建 `apps/server/src/modules/university/rank-tier.spec.ts`：

```ts
import { getTier, isHistorical, classifyRank } from './rank-tier';

describe('getTier', () => {
  it('orders 985 > 211 > 专科 > 普通本科', () => {
    expect(getTier({ is985: true, is211: true, batch: '本科一批' })).toBe('985');
    expect(getTier({ is985: false, is211: true, batch: '本科一批' })).toBe('211');
    expect(getTier({ is985: false, is211: false, batch: '专科批' })).toBe('专科');
    expect(getTier({ is985: false, is211: false, batch: '本科二批' })).toBe('普通本科');
  });
});

describe('classifyRank', () => {
  it('returns unknown when predictedRank is null', () => {
    expect(classifyRank(10000, null, '985', false)).toBe('unknown');
  });

  it('classifies a far-easier school as safe/elite and a far-harder one as rush', () => {
    // 985: stable=1500. userRank 10000.
    expect(classifyRank(10000, 5000, '985', false)).toBe('rush');   // diff -5000 < -1500
    expect(classifyRank(10000, 10000, '985', false)).toBe('stable'); // diff 0
  });
});

describe('isHistorical', () => {
  it('detects history/arts subject strings', () => {
    expect(isHistorical('历史')).toBe(true);
    expect(isHistorical('物理')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/server`）: `pnpm test -- rank-tier`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

新建 `apps/server/src/modules/university/rank-tier.ts`：

```ts
/**
 * 院校录取概率分档（冲/稳/保/垫）。
 * 本文件是前端 apps/web/src/utils/classify-rank.ts + admission-thresholds.ts 的独立副本——
 * 修改分档逻辑或阈值时，必须同步前端那两个文件。
 */

export type Tier = '985' | '211' | '普通本科' | '专科';
export type RankTier = 'rush' | 'stable' | 'safe' | 'elite' | 'unknown';

interface TierThresholds {
  stable: number;
  safe: number;
  elite: number;
}

const TIER_THRESHOLDS: Record<Tier, TierThresholds> = {
  '985': { stable: 1500, safe: 5000, elite: 15000 },
  '211': { stable: 4000, safe: 12000, elite: 30000 },
  '普通本科': { stable: 10000, safe: 30000, elite: 80000 },
  '专科': { stable: 20000, safe: 60000, elite: 150000 },
};

const HISTORY_SCIENCE_MULTIPLIER = 1.5;

const RATIO_THRESHOLDS = { rushMax: -0.10, stableMax: 0.15, safeMax: 0.50 };

const RISK_ORDER: RankTier[] = ['rush', 'stable', 'safe', 'elite'];

export function getTier(input: {
  is985: boolean;
  is211: boolean;
  batch: string;
}): Tier {
  if (input.is985) return '985';
  if (input.is211) return '211';
  if (input.batch.includes('专科') || input.batch.includes('高职')) return '专科';
  return '普通本科';
}

export function isHistorical(subjects: string): boolean {
  return /历史|文科/.test(subjects);
}

export function classifyRank(
  userRank: number,
  predictedRank: number | null,
  tier: Tier,
  historical: boolean,
): RankTier {
  if (predictedRank == null) return 'unknown';

  const diff = predictedRank - userRank;
  const ratio = diff / Math.max(1, userRank);

  const t = TIER_THRESHOLDS[tier];
  const m = historical ? HISTORY_SCIENCE_MULTIPLIER : 1;
  const absStable = t.stable * m;
  const absSafe = t.safe * m;

  let absTier: RankTier;
  if (diff < -absStable) absTier = 'rush';
  else if (diff < absStable) absTier = 'stable';
  else if (diff < absSafe) absTier = 'safe';
  else absTier = 'elite';

  let ratioTier: RankTier;
  if (ratio < RATIO_THRESHOLDS.rushMax) ratioTier = 'rush';
  else if (ratio < RATIO_THRESHOLDS.stableMax) ratioTier = 'stable';
  else if (ratio < RATIO_THRESHOLDS.safeMax) ratioTier = 'safe';
  else ratioTier = 'elite';

  const absIdx = RISK_ORDER.indexOf(absTier);
  const ratioIdx = RISK_ORDER.indexOf(ratioTier);
  return RISK_ORDER[Math.min(absIdx, ratioIdx)];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run（在 `apps/server`）: `pnpm test -- rank-tier`
Expected: PASS。

- [ ] **Step 5: 在前端 classify-rank.ts 头部加同步注记**

`apps/web/src/utils/classify-rank.ts` 文件顶部加一行注释：

```ts
// 注意：后端 apps/server/src/modules/university/rank-tier.ts 是本文件的独立副本，
// 修改分档逻辑或 admission-thresholds.ts 阈值时必须同步两处。
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/university/rank-tier.ts apps/server/src/modules/university/rank-tier.spec.ts apps/web/src/utils/classify-rank.ts
git commit -m "feat(server): add server-side rank tier classification"
```

### Task 11: 位次冗余字段回填脚本

遍历所有院校，按科类聚合录取记录与预测记录，写入 Task 8 新增的 6 个冗余字段。脚本放在 `apps/server/scripts/` 下以便干净 import Task 9 的 `ranking-fields`（`scripts/import-data/` 是独立 mini 项目，跨目录 import 不可靠——此处对设计文档的脚本路径做修正）。

**Files:**
- Create: `apps/server/scripts/backfill-university-ranks.ts`
- Modify: `apps/server/package.json`（新增 npm script）

- [ ] **Step 1: 新增 npm script**

`apps/server/package.json` 的 `scripts` 块加一行：

```json
"backfill:ranks": "ts-node -r tsconfig-paths/register scripts/backfill-university-ranks.ts",
```

- [ ] **Step 2: 编写回填脚本**

新建 `apps/server/scripts/backfill-university-ranks.ts`：

```ts
/**
 * 回填 University 表的 6 个位次冗余字段（minScore/minRank/predRank × 物理/历史）。
 * 运行时机：AdmissionRecord 导入、RankPrediction 生成之后。
 * 用法（在 apps/server 目录，需配置 DATABASE_URL）：pnpm backfill:ranks
 */
import { PrismaClient } from '@prisma/client';
import {
  aggregateMinScoreRank,
  pickUniversityPredRank,
} from '../src/modules/university/ranking-fields';

const prisma = new PrismaClient();

const PRED_RECRUIT_TYPES = ['普通类本科', '普通类高职(专科)'];

function pushToGroup<T>(map: Map<string, T[]>, key: string, item: T): void {
  const arr = map.get(key);
  if (arr) arr.push(item);
  else map.set(key, [item]);
}

async function main(): Promise<void> {
  const latestYearRow = await prisma.admissionRecord.findFirst({
    orderBy: { year: 'desc' },
    select: { year: true },
  });
  const latestYear = latestYearRow?.year;
  if (latestYear == null) {
    console.error('无录取数据，终止');
    process.exit(1);
  }

  const targetYearRow = await prisma.rankPrediction.findFirst({
    orderBy: { targetYear: 'desc' },
    select: { targetYear: true },
  });
  const targetYear = targetYearRow?.targetYear ?? null;

  const admissions = await prisma.admissionRecord.findMany({
    where: { year: latestYear },
    select: {
      universityId: true, subjects: true,
      majorMinScore: true, majorMinRank: true,
      groupMinScore: true, groupMinRank: true,
    },
  });

  const predictions = targetYear == null ? [] : await prisma.rankPrediction.findMany({
    where: { targetYear, recruitType: { in: PRED_RECRUIT_TYPES } },
    select: { universityId: true, subjects: true, pointRank: true },
  });

  const admMap = new Map<string, typeof admissions>();
  for (const a of admissions) pushToGroup(admMap, `${a.universityId}:${a.subjects}`, a);

  const predMap = new Map<string, typeof predictions>();
  for (const p of predictions) pushToGroup(predMap, `${p.universityId}:${p.subjects}`, p);

  const universities = await prisma.university.findMany({ select: { id: true } });
  let done = 0;
  for (const u of universities) {
    const phys = aggregateMinScoreRank(admMap.get(`${u.id}:物理`) ?? []);
    const hist = aggregateMinScoreRank(admMap.get(`${u.id}:历史`) ?? []);
    const predPhys = pickUniversityPredRank(predMap.get(`${u.id}:物理`) ?? []);
    const predHist = pickUniversityPredRank(predMap.get(`${u.id}:历史`) ?? []);
    await prisma.university.update({
      where: { id: u.id },
      data: {
        minScorePhysics: phys?.minScore ?? null,
        minRankPhysics: phys?.minRank ?? null,
        minScoreHistory: hist?.minScore ?? null,
        minRankHistory: hist?.minRank ?? null,
        predRankPhysics: predPhys,
        predRankHistory: predHist,
      },
    });
    done += 1;
    if (done % 200 === 0) console.log(`  ${done}/${universities.length}`);
  }
  console.log(`回填完成：${done} 所院校（录取年份 ${latestYear}，预测年份 ${targetYear ?? '无'}）`);
}

main()
  .catch((e) => {
    console.error('回填失败：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: 验证（需 DATABASE_URL 已配置的开发库）**

Run（在 `apps/server`）: `pnpm backfill:ranks`
Expected: 打印进度并以「回填完成：N 所院校」结束，无异常。

抽查验证：用 `pnpm prisma studio` 或一条 SQL 检查若干 985 院校的 `min_rank_physics` 为合理小位次、`pred_rank_physics` 非空。

> 该脚本通常作为部署流程的一步执行（见单元收尾的「部署注意」）。本地无 `DATABASE_URL` 时此步骤跳过，留待部署阶段执行。

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/backfill-university-ranks.ts apps/server/package.json
git commit -m "feat(server): add backfill script for university rank columns"
```

### Task 12: QueryUniversityDto 扩展科类与排序参数

**Files:**
- Modify: `apps/server/src/modules/university/dto/query-university.dto.ts`

- [ ] **Step 1: 扩展 DTO**

`query-university.dto.ts`：把 `sortBy` 的 `@IsIn` 扩展，并新增 `examType`、`tierFilter`、`userRank` 三个字段。

`sortBy` 字段改为：

```ts
  @ApiPropertyOptional({ description: '排序字段', enum: ['name', 'province', 'type', 'minRank', 'tier'] })
  @IsOptional()
  @IsIn(['name', 'province', 'type', 'minRank', 'tier'])
  sortBy?: string = 'name';
```

在 `sortOrder` 字段之后新增：

```ts
  @ApiPropertyOptional({ description: '科类', enum: ['物理', '历史'] })
  @IsOptional()
  @IsIn(['物理', '历史'])
  examType?: string;

  @ApiPropertyOptional({ description: '冲稳保筛选', enum: ['rush', 'stable', 'safe'] })
  @IsOptional()
  @IsIn(['rush', 'stable', 'safe'])
  tierFilter?: string;

  @ApiPropertyOptional({ description: '考生位次（冲稳保标签/筛选用）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  userRank?: number;
```

- [ ] **Step 2: 验证**

Run（在 `apps/server`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/university/dto/query-university.dto.ts
git commit -m "feat(server): add examType, tierFilter, userRank to university query DTO"
```

### Task 13: findAll 改造 —— 科类取数、冗余字段排序、冲稳保筛选

`findAll` 改为纯单表查询：`latestAdmission` 与 `predictedMinRank` 从冗余字段按科类取；排序支持 `minRank`/`tier`；`tierFilter` 走内存分档筛选路径。私有方法 `aggregateLatestAdmission` 不再需要，删除。

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts`
- Modify: `apps/server/src/modules/university/university.service.spec.ts`

- [ ] **Step 1: 重写 findAll 的测试**

`university.service.spec.ts`：把现有的 `describe('UniversityService.findAll latestAdmission', ...)` 整个块（当前 L236-284）替换为：

```ts
describe('UniversityService.findAll', () => {
  const setup = (universities: any[]) => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue(universities),
        count: jest.fn().mockResolvedValue(universities.length),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc, prisma };
  };

  const uni = (over: any = {}) => ({
    id: 1, name: 'X', is985: false, is211: false, level: '本科',
    minScorePhysics: 600, minRankPhysics: 12000,
    minScoreHistory: 560, minRankHistory: 8000,
    predRankPhysics: 11000, predRankHistory: 7500,
    ...over,
  });

  it('builds latestAdmission and predictedMinRank from physics columns by default', async () => {
    const { svc } = setup([uni()]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].latestAdmission).toEqual({ minScore: 600, minRank: 12000 });
    expect(result.data[0].predictedMinRank).toBe(11000);
  });

  it('uses history columns when examType is 历史', async () => {
    const { svc } = setup([uni()]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20, examType: '历史' } as any);
    expect(result.data[0].latestAdmission).toEqual({ minScore: 560, minRank: 8000 });
    expect(result.data[0].predictedMinRank).toBe(7500);
  });

  it('latestAdmission is null when the exam-type score column is null', async () => {
    const { svc } = setup([uni({ minScorePhysics: null, minRankPhysics: null })]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].latestAdmission).toBeNull();
  });

  it('sortBy=minRank orders by the exam-type rank column', async () => {
    const { svc, prisma } = setup([uni()]);
    await svc.findAll({ page: 1, pageSize: 20, sortBy: 'minRank', sortOrder: 'asc' } as any);
    expect(prisma.university.findMany.mock.calls[0][0].orderBy).toEqual({ minRankPhysics: 'asc' });
  });

  it('does not leak raw redundancy columns into the response', async () => {
    const { svc } = setup([uni()]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].minRankPhysics).toBeUndefined();
    expect(result.data[0].predRankPhysics).toBeUndefined();
  });

  it('tierFilter classifies in memory and returns only the matched tier', async () => {
    // 985 校 stable 阈值 1500；userRank 12000：
    //   id1 predRank 11000 → diff -1000 → stable
    //   id2 predRank 3000  → diff -9000 → rush
    const { svc, prisma } = setup([
      uni({ id: 1, is985: true, predRankPhysics: 11000 }),
      uni({ id: 2, is985: true, predRankPhysics: 3000 }),
    ]);
    const result: any = await svc.findAll({
      page: 1, pageSize: 20, tierFilter: 'stable', userRank: 12000,
    } as any);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(1);
    expect(result.pagination.total).toBe(1);
    expect(prisma.university.findMany.mock.calls[0][0].skip).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/server`）: `pnpm test -- university.service`
Expected: FAIL —— 现 `findAll` 仍走 `admissionRecord.findFirst` + `include`，无冗余字段逻辑。

- [ ] **Step 3: 改写 findAll、删除 aggregateLatestAdmission、补 import**

`university.service.ts` 顶部 import 区追加：

```ts
import { getTier, classifyRank } from './rank-tier';
```

把 `findAll` 方法（当前 L15-88）整体替换为：

```ts
async findAll(query: QueryUniversityDto) {
  const {
    page = 1,
    pageSize = 20,
    keyword,
    province,
    city,
    type,
    level,
    grade,
    nature,
    isDoubleFirstClass,
    is985,
    is211,
    sortBy = 'name',
    sortOrder = 'asc',
    examType = '物理',
    tierFilter,
    userRank,
  } = query;

  const where: any = {};
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
    ];
  }
  if (province) where.province = province;
  if (city) where.city = city;
  if (type) where.type = type;
  if (level) where.level = level;
  if (nature) where.runningNature = nature;
  if (grade) where.grade = grade;
  if (isDoubleFirstClass !== undefined) where.isDoubleFirstClass = isDoubleFirstClass;
  if (is985 !== undefined) where.is985 = is985;
  if (is211 !== undefined) where.is211 = is211;

  const isHistory = examType === '历史';
  const minScoreField = isHistory ? 'minScoreHistory' : 'minScorePhysics';
  const minRankField = isHistory ? 'minRankHistory' : 'minRankPhysics';
  const predRankField = isHistory ? 'predRankHistory' : 'predRankPhysics';

  // minRank / tier 排序映射到科类冗余字段；其余沿用 university 标量字段
  const orderByField =
    sortBy === 'minRank' ? minRankField : sortBy === 'tier' ? predRankField : sortBy;

  // 单条 university 行 -> 列表响应项：注入科类相关 latestAdmission / predictedMinRank，
  // 并剥掉 6 个原始冗余列，避免泄漏到响应。
  const shape = (u: any) => {
    const {
      minScorePhysics,
      minRankPhysics,
      minScoreHistory,
      minRankHistory,
      predRankPhysics,
      predRankHistory,
      ...rest
    } = u;
    const minScore = u[minScoreField];
    const minRank = u[minRankField];
    return {
      ...rest,
      latestAdmission: minScore != null ? { minScore, minRank } : null,
      predictedMinRank: u[predRankField] ?? null,
    };
  };

  // 冲稳保筛选：分档依赖每校不同的 tier 阈值 + 请求传入的 userRank，无法纯 DB 完成，
  // 走内存路径——取全部匹配院校（单表、轻量），JS 分档筛选后再分页。
  if (tierFilter && userRank != null) {
    const all = await this.prisma.university.findMany({
      where,
      orderBy: { [orderByField]: sortOrder },
    });
    const matched = all.filter((u: any) => {
      const tier = getTier({ is985: u.is985, is211: u.is211, batch: u.level ?? '' });
      const verdict = classifyRank(userRank, u[predRankField], tier, isHistory);
      return verdict === tierFilter;
    });
    const total = matched.length;
    const pageRows = matched.slice((page - 1) * pageSize, page * pageSize);
    return {
      data: pageRows.map(shape),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // 常规路径：DB 排序 + 分页
  const [data, total] = await Promise.all([
    this.prisma.university.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [orderByField]: sortOrder },
    }),
    this.prisma.university.count({ where }),
  ]);

  return {
    data: data.map(shape),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
```

同时删除私有方法 `aggregateLatestAdmission`（当前 L90-111，含其上方注释块）——`findAll` 已不再使用，`findById` 也未使用。

- [ ] **Step 4: 跑测试确认通过**

Run（在 `apps/server`）: `pnpm test -- university.service`
Expected: PASS（findAll 新用例 + 既有 findById / getFilters / getCampusPois / getPickerOptions 用例全绿）。

- [ ] **Step 5: 验证编译**

Run（在 `apps/server`）: `pnpm build`
Expected: 构建成功（确认无「`aggregateLatestAdmission` 未使用」「`latestYear` 未使用」类残留）。

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/university/university.service.ts apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(server): exam-type-aware findAll with rank sorting and tier filter"
```

---

## 单元 4 · 列表页科类切换 + 位次联动

「全部院校」Tab 接入科类切换；院校卡片标注冲/稳/保；排序启用位次/冲稳保；筛选新增「录取概率」。冲稳保全程复用 `apps/web/src/utils/classify-rank.ts` 与 `RankTierBadge` / `RankDistance`。

### Task 14: 前端 service 补充类型与查询参数

**Files:**
- Modify: `apps/web/src/services/university.ts`

- [ ] **Step 1: 扩展 UniversityQueryParams**

`UniversityQueryParams` interface 末尾新增三个字段：

```ts
  examType?: '物理' | '历史';
  tierFilter?: 'rush' | 'stable' | 'safe';
  userRank?: number;
```

- [ ] **Step 2: 新增 UniversityListItem 类型**

在 `UniversityQueryParams` 之后新增院校列表项类型（对应后端 `findAll` 的响应项）：

```ts
export interface UniversityListItem {
  id: number;
  name: string;
  code: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  level: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  ranking: string | null;
  logoUrl: string | null;
  latestAdmission: { minScore: number; minRank: number | null } | null;
  predictedMinRank: number | null;
}
```

- [ ] **Step 3: 新增 UniversityListResponse 并收紧 getList 返回类型**

在 `UniversityListItem` 之后新增列表响应类型：

```ts
export interface UniversityListResponse {
  data: UniversityListItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
```

`universityService.getList` 由 `Promise<any>` 收紧（`api` 响应拦截器已 unwrap 出响应体，无需 `as any`）：

```ts
getList: (params: UniversityQueryParams): Promise<UniversityListResponse> =>
  api.get('/universities', { params }),
```

- [ ] **Step 4: 验证**

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。`UniversityListTab` 中 `data?.data` 推断为 `UniversityListItem[] | undefined`、`data?.pagination?.total` 类型兼容。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/university.ts
git commit -m "feat(web): add university list item/response types and query params"
```

### Task 15: 「全部院校」Tab 科类切换

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`
- Test: `apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `UniversityListTab.test.tsx` 的 `describe` 内新增用例：

```ts
it('renders 物理/历史 exam-type toggle', async () => {
  renderTab();
  expect(await screen.findByRole('button', { name: '物理类' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '历史类' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: FAIL —— 暂无科类切换按钮。

- [ ] **Step 3: 接入 studentRankStore 与科类切换**

`UniversityListTab.tsx` 顶部 import 增加：

```tsx
import { useStudentRank } from '@/stores/studentRankStore';
```

`UniversityListTab` 函数体内，`filters` state 声明后增加：

```tsx
const examType = useStudentRank((s) => s.examType);
const setExamType = useStudentRank((s) => s.setExamType);
const studentRank = useStudentRank((s) => s.rank);
```

`useQuery` 改为把 `examType` / `studentRank` 纳入 key 与请求参数：

```tsx
const { data, isLoading, isError, error } = useQuery({
  queryKey: ['universities', filters, examType, studentRank],
  queryFn: () => universityService.getList({
    ...filters,
    examType,
    userRank: studentRank ?? undefined,
  }),
});
```

搜索框所在卡片（当前 L418 的 `<div className="mb-5 rounded-xl bg-surface p-4 shadow-card">`）内，在 `<div className="flex flex-col gap-3 xl:flex-row ...">` 之前插入科类切换行：

```tsx
<div className="mb-3 flex items-center gap-2">
  <span className="text-sm text-text-muted">科类</span>
  {(['物理', '历史'] as const).map((t) => (
    <button
      key={t}
      type="button"
      onClick={() => setExamType(t)}
      className={`rounded-full border px-3.5 py-1 text-[13px] transition-colors ${
        examType === t
          ? 'border-primary bg-primary-fixed font-medium text-primary'
          : 'border-border bg-surface text-text-tertiary hover:text-primary'
      }`}
    >
      {t}类
    </button>
  ))}
</div>
```

- [ ] **Step 4: 跑测试确认通过**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx
git commit -m "feat(web): add exam-type toggle to university list tab"
```

### Task 16: 院校卡片冲稳保标签

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`
- Test: `apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `UniversityListTab.test.tsx` 顶部 import 区加入 store，并新增用例（放在 `describe` 内）：

```ts
import { useStudentRank } from '@/stores/studentRankStore';

// ...（describe 内）
it('shows a rank-tier badge on the card when the student rank is set', async () => {
  // 985 校 stable 阈值 1500；userRank 12000、predictedMinRank 11000 → diff -1000 → 稳
  useStudentRank.setState({ rank: 12000, examType: '物理' });
  mockedService.getList.mockResolvedValue({
    data: [{
      id: 7, name: '测试大学', code: null, province: '四川', city: '成都',
      type: '综合', level: '本科', runningNature: '公办',
      is985: true, is211: true, isDoubleFirstClass: true, ranking: null, logoUrl: null,
      latestAdmission: { minScore: 640, minRank: 11800 },
      predictedMinRank: 11000,
    }],
    pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
  });
  renderTab();
  expect(await screen.findByText('稳')).toBeInTheDocument();
});
```

> `renderTab` 等 setup 来自 Task 2 已建的测试文件。

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: FAIL —— 卡片暂未渲染冲稳保标签。

- [ ] **Step 3: 改写 UniversityCard**

`UniversityListTab.tsx` 顶部 import 增加：

```tsx
import { classifyRank, getTier } from '@/utils/classify-rank';
import RankTierBadge from '@/components/admission/RankTierBadge';
import RankDistance from '@/components/admission/RankDistance';
import type { UniversityListItem } from '@/services/university';
```

`UniversityCard`（Task 1 已删对比相关代码后的版本）整体替换为：

```tsx
function UniversityCard({
  uni,
  userRank,
  examType,
}: {
  uni: UniversityListItem;
  userRank: number | null;
  examType: '物理' | '历史';
}) {
  const tags: string[] = [];
  if (uni.is985) tags.push('985');
  if (uni.is211) tags.push('211');
  if (uni.isDoubleFirstClass) tags.push('双一流');

  const admission = uni.latestAdmission;
  const infoItems = [uni.type, uni.province, uni.city, uni.runningNature].filter(Boolean);

  const tier = getTier({ is985: uni.is985, is211: uni.is211, batch: uni.level ?? '' });
  const verdict =
    userRank != null
      ? classifyRank(userRank, uni.predictedMinRank, tier, examType === '历史')
      : null;
  const rankDiff =
    userRank != null && uni.predictedMinRank != null
      ? uni.predictedMinRank - userRank
      : null;

  return (
    <div className="grid gap-4 rounded-xl bg-surface px-4 py-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover sm:px-5 lg:grid-cols-[64px_minmax(0,1fr)_140px] lg:items-center">
      <Link href={`/universities/${uni.id}`} className="hidden no-underline lg:block">
        <UniversityLogo name={uni.name} logoUrl={uni.logoUrl} size={64} />
      </Link>

      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <Link href={`/universities/${uni.id}`} className="mt-0.5 shrink-0 no-underline lg:hidden">
            <UniversityLogo name={uni.name} logoUrl={uni.logoUrl} size={52} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/universities/${uni.id}`}
                className="truncate font-serif text-[19px] font-semibold text-text no-underline transition-colors hover:text-primary"
              >
                {uni.name}
              </Link>
              {tags.map((tag) => (
                <span key={tag} className="rounded bg-accent-fixed px-2 py-0.5 text-[11px] font-medium text-accent">
                  {tag}
                </span>
              ))}
              {verdict && <RankTierBadge tier={verdict} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {infoItems.map((item) => (
                <span key={item} className="rounded bg-bg px-2 py-0.5 text-[11px] text-text-tertiary">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1">
                <EnvironmentOutlined />
                {uni.province || '-'} {uni.city || ''}
              </span>
              {uni.ranking && <span>综合排名 {uni.ranking}</span>}
              {uni.code && <span>院校代码 {uni.code}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-bg px-3 py-3 text-left lg:text-right">
        <span className="block font-serif text-[24px] font-semibold leading-none text-text tabular-nums">
          {admission?.minScore ?? '-'}
        </span>
        <span className="mt-1 block text-[11px] text-text-muted">
          {examType}类 · 最近一年最低分
        </span>
        <span className="mt-1 block text-[11px] text-text-tertiary tabular-nums">
          位次 {admission?.minRank ?? '-'}
        </span>
        {rankDiff != null && verdict && (
          <span className="mt-1 block text-[11px] text-text-muted">
            距你 <RankDistance diff={rankDiff} tier={verdict} />
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 卡片调用处传入 userRank / examType**

`universities.map(...)` 渲染处（Task 1 改过的版本）改为：

```tsx
{universities.map((uni: UniversityListItem) => (
  <UniversityCard key={uni.id} uni={uni} userRank={studentRank} examType={examType} />
))}
```

> Task 14 收紧 `getList` 返回类型后，`const universities = data?.data || []` 自动推断为 `UniversityListItem[]`，无需显式标注。

- [ ] **Step 5: 跑测试确认通过**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: PASS。

- [ ] **Step 6: 验证编译**

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx
git commit -m "feat(web): show rush/stable/safe tier badge on university cards"
```

### Task 17: 排序启用位次/冲稳保 + 录取概率筛选

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`
- Test: `apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `UniversityListTab.test.tsx` 的 `describe` 内新增用例：

```ts
it('enables rank/tier sorting and shows the tier filter when a rank is set', async () => {
  useStudentRank.setState({ rank: 12000, examType: '物理' });
  renderTab();
  expect(await screen.findByRole('button', { name: '位次排序' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '冲稳保排序' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '冲' })).toBeInTheDocument();
});
```

并在测试文件的 `describe` 顶部加入 store 重置，避免用例间 rank 泄漏：

```ts
afterEach(() => {
  useStudentRank.setState({ rank: null, examType: '物理' });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: FAIL —— 暂无「位次排序」「冲稳保排序」「冲」等控件。

- [ ] **Step 3: 替换 SORTS 常量**

`UniversityListTab.tsx` 顶部 `SORTS` 常量（当前 L29-34）替换为：

```tsx
const SORTS: Array<{
  label: string;
  value: Pick<UniversityQueryParams, 'sortBy' | 'sortOrder'>;
  needsRank?: boolean;
}> = [
  { label: '默认排序', value: { sortBy: 'name', sortOrder: 'asc' } },
  { label: '位次排序', value: { sortBy: 'minRank', sortOrder: 'asc' } },
  { label: '冲稳保排序', value: { sortBy: 'tier', sortOrder: 'asc' }, needsRank: true },
  { label: '按省份', value: { sortBy: 'province', sortOrder: 'asc' } },
  { label: '按类型', value: { sortBy: 'type', sortOrder: 'asc' } },
];
```

- [ ] **Step 4: 替换排序按钮渲染**

排序按钮组（当前 L430-451 的 `<div className="flex flex-wrap gap-2">{SORTS.map(...)}</div>`）替换为：

```tsx
<div className="flex flex-wrap gap-2">
  {SORTS.map((sort) => {
    const active =
      filters.sortBy === sort.value.sortBy && filters.sortOrder === sort.value.sortOrder;
    const disabled = sort.needsRank === true && studentRank == null;
    return (
      <button
        key={sort.label}
        type="button"
        disabled={disabled}
        title={disabled ? '先在成绩页录入位次' : undefined}
        onClick={() => setFilters({ ...filters, ...sort.value, page: 1 })}
        className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
          active
            ? 'bg-surface-high text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            : disabled
              ? 'cursor-not-allowed bg-bg text-text-faint'
              : 'bg-bg text-text-tertiary hover:text-primary'
        }`}
      >
        {sort.label}
      </button>
    );
  })}
</div>
```

- [ ] **Step 5: 新增 TierFilterGroup 组件**

在 `FilterPanel` 函数之前新增组件：

```tsx
function TierFilterGroup({
  value,
  rankAvailable,
  onChange,
}: {
  value?: 'rush' | 'stable' | 'safe';
  rankAvailable: boolean;
  onChange: (v: 'rush' | 'stable' | 'safe' | undefined) => void;
}) {
  const items: Array<{ key: 'rush' | 'stable' | 'safe'; label: string }> = [
    { key: 'rush', label: '冲' },
    { key: 'stable', label: '稳' },
    { key: 'safe', label: '保' },
  ];
  return (
    <div className="border-b border-border-subtle py-4 last:border-b-0">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
        录取概率
      </div>
      {rankAvailable ? (
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(value === item.key ? undefined : item.key)}
              className={`flex w-full items-center rounded-md border-0 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                value === item.key
                  ? 'bg-primary-fixed font-medium text-primary'
                  : 'text-text-secondary hover:bg-surface-dim hover:text-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-text-faint">先在成绩页录入位次后可用</div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: FilterPanel 接入 TierFilterGroup**

`FilterPanel` 函数内，`useQuery` 之后加：

```tsx
const studentRank = useStudentRank((s) => s.rank);
```

在「办学层次」`FilterGroup` 之后（`</aside>` 之前）插入：

```tsx
<TierFilterGroup
  value={filters.tierFilter}
  rankAvailable={studentRank != null}
  onChange={(tierFilter) => setFilters({ ...filters, tierFilter, page: 1 })}
/>
```

- [ ] **Step 7: activeFilters 纳入 tierFilter**

`activeFilters` 的 `useMemo`（当前 L357-367）内，在 `return items` 之前加入：

```tsx
if (filters.tierFilter) {
  const label = { rush: '冲', stable: '稳', safe: '保' }[filters.tierFilter];
  items.push({ key: 'tierFilter', label: `录取概率：${label}` });
}
```

> `clearFilters` 已只保留 `page/pageSize/keyword/sortBy/sortOrder`，`tierFilter` 会被自动清除；`removeFilter` 通过 `key` 泛化处理，无需改动。

- [ ] **Step 8: 跑测试确认通过**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: PASS。

- [ ] **Step 9: 验证编译**

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx
git commit -m "feat(web): enable rank/tier sorting and admission-probability filter"
```

---

## 单元收尾 · 部署注意

单元 3 改了数据库结构与 `University` 字段，按既有部署流程需要额外步骤（对应既有运维约定）：

1. `apps/server`：`pnpm prisma migrate deploy` 应用迁移（生产环境）
2. `apps/server`：`pnpm backfill:ranks` 回填 6 个位次冗余字段（需 `AdmissionRecord`、`RankPrediction` 数据已就位）
3. 清 Redis 缓存：`cache:university:*` 与 `university-filters`（`getFilters` 输出结构已变；`findById` 有缓存）
4. 按既有 `deploy_auto.py` 流程部署前后端

> `pnpm backfill:ranks` 必须在 `migrate deploy` 之后、面向用户放量之前执行——否则列表页位次列与冲稳保标签全空。后续每次 `AdmissionRecord` / `RankPrediction` 数据更新，都需要重跑回填脚本。

---

## 实施顺序

单元 1、2 纯前端（单元 2 含一处小后端改动），可独立先行交付。单元 3 是单元 4 的前置（单元 4 依赖冗余字段与 `findAll` 改造）。建议顺序：Task 1 → 17 顺序执行。单元 3 的 Task 8（migration）需要数据库环境；若本地 worktree 无 `DATABASE_URL`，单元 3 的 DB 相关步骤在具备环境处执行。

