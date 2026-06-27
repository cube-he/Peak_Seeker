# 方案详情页志愿表多级排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/teacher/plans/:id` 志愿表加"多级自动排序（预览 + 一键应用）"，教师堆叠排序键在冲/稳/保段内重排，确认后写回志愿顺位。

**Architecture:** 后端 `toPlanItem` 透出排序所需原始字段（拆开分数线 + 批量查 University merge 出省份/办学性质/排名/标签，零迁移）。前端新增纯函数 `sortPlanItems` / `buildAppliedOrder`（段内多级稳定排序 + 段内栈应用），一个 `PlanSortPanel` 规则栈编辑器组件，页面接预览渲染 + 复用现有 `reorderItems` 落库。

**Tech Stack:** NestJS + Prisma（后端）、Next.js + React + antd + jest（前端）。

参考设计 spec：`docs/superpowers/specs/2026-06-27-plan-multisort-design.md`

---

## File Structure

**后端：**
- Create `apps/server/src/modules/plan/plan-item-sort-fields.ts` — 纯函数 `toSortFields(item, university)`，从快照 + University merge 出排序字段。
- Create `apps/server/src/modules/plan/plan-item-sort-fields.spec.ts` — 单测。
- Modify `apps/server/src/modules/plan/plan.service.ts` — `findById` 批量查 University 建 map；`toPlanItem(item, uniMap)` 透出新字段。

**前端：**
- Create `apps/web/src/app/(teacher)/teacher/plans/[id]/plan-sort.ts` — 类型、`SORT_KEY_OPTIONS`、`SORT_PRESETS`、`sortPlanItems`、`buildAppliedOrder`。
- Create `apps/web/src/app/(teacher)/teacher/plans/[id]/__tests__/plan-sort.test.ts` — 核心排序单测。
- Create `apps/web/src/app/(teacher)/teacher/plans/[id]/PlanSortPanel.tsx` — 规则栈编辑器 UI。
- Modify `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` — 排序状态、预览渲染、工具栏入口、应用/恢复接线。

**约束（来自 spec 第 5 节）：**
- 写回顺序只能走现有 `reorderItems`（两阶段提交避让 `@@unique([planId, sequence])`），禁止逐条 update。
- "应用"仅 `DRAFT`；其它状态可预览不可写回。
- 段内排序：梯度是固定分组层，永远冲→稳→保 写回。
- 任何键 null 值沉底。

---

## Task 1: 后端排序字段纯函数 `toSortFields`

**Files:**
- Create: `apps/server/src/modules/plan/plan-item-sort-fields.ts`
- Test: `apps/server/src/modules/plan/plan-item-sort-fields.spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/server/src/modules/plan/plan-item-sort-fields.spec.ts`:

```ts
import { toSortFields } from './plan-item-sort-fields';

describe('toSortFields', () => {
  const item = {
    universityId: 10,
    score25Group: 620, rank25Group: 8000,
    score25Major: 615, rank25Major: 9000,
    score24Major: 610, lastYearMinScore: 600, lastYearMinRank: 12000,
    planCount: 50, tuition: 4900,
    schoolNature: '民办', schoolTags: '211',
  };
  const uni = {
    province: '四川', runningNature: '公办', softRanking: 33,
    is985: true, is211: true, isDoubleFirstClass: true,
  };

  it('University 优先 + 派生 inSichuan', () => {
    const f = toSortFields(item, uni);
    expect(f.schoolNature).toBe('公办');      // University 优先于快照
    expect(f.province).toBe('四川');
    expect(f.inSichuan).toBe(true);
    expect(f.softRanking).toBe(33);
    expect(f.is985).toBe(true);
    expect(f.score25Group).toBe(620);
    expect(f.rank25Group).toBe(8000);
  });

  it('无 University 时回退快照, 字段安全置空/false', () => {
    const f = toSortFields(item, undefined);
    expect(f.schoolNature).toBe('民办');       // 回退快照
    expect(f.province).toBeNull();
    expect(f.inSichuan).toBe(false);
    expect(f.softRanking).toBeNull();
    expect(f.is985).toBe(false);
    expect(f.is211).toBe(false);
  });

  it('省份非四川 → inSichuan=false', () => {
    expect(toSortFields(item, { ...uni, province: '北京' }).inSichuan).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter server test -- plan-item-sort-fields`
Expected: FAIL（`Cannot find module './plan-item-sort-fields'`）

- [ ] **Step 3: 写最小实现**

Create `apps/server/src/modules/plan/plan-item-sort-fields.ts`:

```ts
// 方案行排序字段: 从 PlanItem 快照 + University(单独查) merge 出多级排序所需的原始字段。
// University 字段优先于快照(快照可能稀疏/过期); 派生 inSichuan 供"川内川外"排序。
export interface UniversitySortSource {
  province: string | null;
  runningNature: string | null;
  softRanking: number | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
}

export function toSortFields(item: any, university?: UniversitySortSource | null) {
  const province = university?.province ?? null;
  return {
    // 历史分/位次原始字段(拆开, 不再压成一个 historicalMin*)
    score25Group: item.score25Group ?? null,
    rank25Group: item.rank25Group ?? null,
    score25Major: item.score25Major ?? null,
    rank25Major: item.rank25Major ?? null,
    score24Major: item.score24Major ?? null,
    lastYearMinScore: item.lastYearMinScore ?? null,
    lastYearMinRank: item.lastYearMinRank ?? null,
    // 院校属性(University 优先, 缺失回退快照)
    schoolNature: university?.runningNature ?? item.schoolNature ?? null,
    province,
    inSichuan: province === '四川',
    softRanking: university?.softRanking ?? null,
    is985: university?.is985 ?? false,
    is211: university?.is211 ?? false,
    isDoubleFirstClass: university?.isDoubleFirstClass ?? false,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter server test -- plan-item-sort-fields`
Expected: PASS（3 个用例）

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan/plan-item-sort-fields.ts apps/server/src/modules/plan/plan-item-sort-fields.spec.ts
git commit -m "feat(plan): toSortFields 纯函数 — 方案行排序字段(快照+University merge)"
```

---

## Task 2: 后端 `findById` / `toPlanItem` 透出排序字段

**Files:**
- Modify: `apps/server/src/modules/plan/plan.service.ts:153-182`（`toPlanItem`）、`:197-241`（`findById`）

> 先确认 `toPlanItem` 仅被 `findById` 调用：`grep -rn "toPlanItem" apps/server/src`。若有其它调用方，新增的第二参数为可选，不传则 University 字段安全置空，不破坏既有调用。

- [ ] **Step 1: 改 `toPlanItem` 签名与返回**

`apps/server/src/modules/plan/plan.service.ts`，在文件顶部 import 区加：

```ts
import { toSortFields, type UniversitySortSource } from './plan-item-sort-fields';
```

把 `private toPlanItem(item: any) {` 改为接收 university map，并在 return 对象里 spread 排序字段。改后（L153-182 区段）：

```ts
  private toPlanItem(item: any, uniMap?: Map<number, UniversitySortSource>) {
    return {
      id: item.id,
      order: item.sequence,
      sequence: item.sequence,
      universityName: item.universityName,
      universityCode: item.universityCode,
      groupCode: item.groupCode,
      groupName: item.groupName,
      majorName: item.majorName,
      majorCode: item.majorCode,
      gradient: item.gradient,
      historicalMinScore: item.score25Group ?? item.score25Major,
      historicalMinRank: item.rank25Group ?? item.rank25Major,
      planCount: item.planCount,
      tuition: item.tuition,
      recommendedOrder: item.recommendedOrder,
      fullMajorRanking: item.fullMajorRanking,
      selectedMajors: item.fullMajorRanking?.selectedMajors ?? null,
      acceptAdjust: item.acceptAdjust,
      selectionReason: item.selectionReason,
      riskWarning: item.riskWarning,
      adjustmentAdvice: item.adjustmentAdvice,
      explanation: item.selectionReason,
      scoreBreakdown: item.scoreBreakdown,
      overrideSoftFail: item.overrideSoftFail,
      softFailReasons: item.softFailReasons,
      overrideReason: item.overrideReason,
      // —— 多级排序所需字段(拆开分数线 + University 属性) ——
      ...toSortFields(item, uniMap?.get(item.universityId)),
    };
  }
```

- [ ] **Step 2: 改 `findById` 批量查 University + 传 map**

在 `findById` 里，访问权校验通过之后、`return { ...plan, ... }` 之前（约 L233 前），插入：

```ts
    // 排序需要 University 的省份/办学性质/排名/标签; PlanItem 无 relation, 单独批量查后 merge。
    const uniIds = [...new Set((plan.planItems ?? []).map((it: any) => it.universityId))];
    const universities = uniIds.length
      ? await this.prisma.university.findMany({
          where: { id: { in: uniIds } },
          select: {
            id: true, province: true, runningNature: true, softRanking: true,
            is985: true, is211: true, isDoubleFirstClass: true,
          },
        })
      : [];
    const uniMap = new Map(universities.map((u) => [u.id, u]));
```

把 return 里的 items 映射（L240）从：

```ts
      items: (plan.planItems ?? []).map((item) => this.toPlanItem(item)),
```

改为：

```ts
      items: (plan.planItems ?? []).map((item) => this.toPlanItem(item, uniMap)),
```

- [ ] **Step 3: 编译 + 既有测试不回归**

Run: `pnpm --filter server build`
Expected: 编译通过（无类型错误）

Run: `pnpm --filter server test -- plan.service`
Expected: 既有 plan.service 相关测试通过（若该 suite 本就红，对照 baseline 不新增失败 —— 见 memory `test_suite_baseline_failures`）

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/modules/plan/plan.service.ts
git commit -m "feat(plan): findById 透出排序字段(拆开分数线+merge University 省份/性质/排名/标签)"
```

---

## Task 3: 前端核心排序纯函数 `sortPlanItems`

**Files:**
- Create: `apps/web/src/app/(teacher)/teacher/plans/[id]/plan-sort.ts`
- Test: `apps/web/src/app/(teacher)/teacher/plans/[id]/__tests__/plan-sort.test.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/web/src/app/(teacher)/teacher/plans/[id]/__tests__/plan-sort.test.ts`:

```ts
import { sortPlanItems, type SortableItem, type SortRule } from '../plan-sort';

const mk = (over: Partial<SortableItem> & { id: number }): SortableItem => ({
  id: over.id,
  gradient: 'WEN',
  schoolNature: null, province: null, inSichuan: false,
  score25Group: null, rank25Group: null, planCount: null, tuition: null,
  softRanking: null, is985: false, is211: false, isDoubleFirstClass: false,
  rank25Major: null, lastYearMinRank: null,
  ...over,
});

const ctx = { studentRank: 10000 };

describe('sortPlanItems', () => {
  it('单键: 办学性质 公办优先(asc)', () => {
    const items = [mk({ id: 1, schoolNature: '民办' }), mk({ id: 2, schoolNature: '公办' })];
    const rules: SortRule[] = [{ key: 'SCHOOL_NATURE', dir: 'asc' }];
    expect(sortPlanItems(items, rules, ctx).map((i) => i.id)).toEqual([2, 1]);
  });

  it('多级: 川内优先 → 分数线高到低', () => {
    const items = [
      mk({ id: 1, inSichuan: true, province: '四川', score25Group: 600 }),
      mk({ id: 2, inSichuan: true, province: '四川', score25Group: 650 }),
      mk({ id: 3, inSichuan: false, province: '北京', score25Group: 700 }),
    ];
    const rules: SortRule[] = [
      { key: 'PROVINCE_INOUT', dir: 'asc' },
      { key: 'GROUP_MIN_SCORE', dir: 'desc' },
    ];
    expect(sortPlanItems(items, rules, ctx).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it('null 值一律沉底(无论方向)', () => {
    const items = [mk({ id: 1, score25Group: null }), mk({ id: 2, score25Group: 600 })];
    expect(sortPlanItems(items, [{ key: 'GROUP_MIN_SCORE', dir: 'desc' }], ctx).map((i) => i.id)).toEqual([2, 1]);
    expect(sortPlanItems(items, [{ key: 'GROUP_MIN_SCORE', dir: 'asc' }], ctx).map((i) => i.id)).toEqual([2, 1]);
  });

  it('稳定排序: 全键相等保持原相对顺序', () => {
    const items = [mk({ id: 5, schoolNature: '公办' }), mk({ id: 3, schoolNature: '公办' }), mk({ id: 9, schoolNature: '公办' })];
    expect(sortPlanItems(items, [{ key: 'SCHOOL_NATURE', dir: 'asc' }], ctx).map((i) => i.id)).toEqual([5, 3, 9]);
  });

  it('空规则栈: 原样返回', () => {
    const items = [mk({ id: 2 }), mk({ id: 1 })];
    expect(sortPlanItems(items, [], ctx).map((i) => i.id)).toEqual([2, 1]);
  });

  it('相对位次差: 偏稳(desc)把超出多的排前', () => {
    // histRank - studentRank 越大越稳; studentRank=10000
    const items = [
      mk({ id: 1, rank25Major: 9000 }),  // diff -1000 偏冲
      mk({ id: 2, rank25Major: 15000 }), // diff +5000 偏稳
    ];
    expect(sortPlanItems(items, [{ key: 'RANK_DIFF', dir: 'desc' }], ctx).map((i) => i.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter web test -- plan-sort`
Expected: FAIL（`Cannot find module '../plan-sort'`）

- [ ] **Step 3: 写实现**

Create `apps/web/src/app/(teacher)/teacher/plans/[id]/plan-sort.ts`:

```ts
// 志愿表多级排序: 段内(冲/稳/保 各自)对方案行做可堆叠的稳定排序。
// 梯度是固定分组层, 不在此 SortKey 内(见 buildAppliedOrder)。null 值一律沉底。

export type SortKey =
  | 'SCHOOL_NATURE'    // 办学性质 公办/民办/中外合作
  | 'PROVINCE_INOUT'   // 川内 / 川外
  | 'GROUP_MIN_SCORE'  // 专业组最低分
  | 'GROUP_MIN_RANK'   // 专业组最低位次
  | 'PLAN_COUNT'       // 招生计划数
  | 'UNIVERSITY_RANK'  // 院校排名(软科)
  | 'TUITION'          // 学费
  | 'TAGS'             // 985/211/双一流
  | 'RANK_DIFF';       // 相对学生位次差

export type SortDir = 'asc' | 'desc';
export interface SortRule { key: SortKey; dir: SortDir; }

// 排序读取的最小行形状(后端 findById 已透出这些字段)
export interface SortableItem {
  id: number;
  gradient: string; // CHONG / WEN / BAO
  schoolNature: string | null;
  province: string | null;
  inSichuan: boolean;
  score25Group: number | null;
  rank25Group: number | null;
  planCount: number | null;
  tuition: number | null;
  softRanking: number | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  rank25Major: number | null;
  lastYearMinRank: number | null;
}

export interface SortContext { studentRank: number | null; }

// 办学性质 → 序: 公办0 < 民办1 < 中外合作2; 无法判定 = null(沉底)
function natureRank(s: string | null): number | null {
  if (!s) return null;
  if (s.includes('公办')) return 0;
  if (s.includes('民办')) return 1;
  if (s.includes('中外') || s.includes('合作')) return 2;
  return null;
}

// 取某行某键的数值化比较值; null = 该键无值 → 沉底
function getSortValue(item: SortableItem, key: SortKey, ctx: SortContext): number | null {
  switch (key) {
    case 'SCHOOL_NATURE':
      return natureRank(item.schoolNature);
    case 'PROVINCE_INOUT':
      return item.inSichuan ? 0 : item.province ? 1 : null;
    case 'GROUP_MIN_SCORE':
      return item.score25Group ?? null;
    case 'GROUP_MIN_RANK':
      return item.rank25Group ?? null;
    case 'PLAN_COUNT':
      return item.planCount ?? null;
    case 'UNIVERSITY_RANK':
      return item.softRanking ?? null;
    case 'TUITION':
      return item.tuition ?? null;
    case 'TAGS':
      return item.is985 || item.is211 || item.isDoubleFirstClass ? 0 : 1;
    case 'RANK_DIFF': {
      const histRank = item.rank25Major ?? item.rank25Group ?? item.lastYearMinRank ?? null;
      if (histRank == null || ctx.studentRank == null) return null;
      return histRank - ctx.studentRank;
    }
    default:
      return null;
  }
}

function compareByRule(a: SortableItem, b: SortableItem, rule: SortRule, ctx: SortContext): number {
  const va = getSortValue(a, rule.key, ctx);
  const vb = getSortValue(b, rule.key, ctx);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;  // null 沉底
  if (vb == null) return -1;
  const base = va - vb;       // 升序基准
  if (base === 0) return 0;
  return rule.dir === 'asc' ? base : -base;
}

// 段内稳定多级排序: 用原索引兜底保证稳定
export function sortPlanItems(items: SortableItem[], rules: SortRule[], ctx: SortContext): SortableItem[] {
  const decorated = items.map((item, i) => ({ item, i }));
  decorated.sort((a, b) => {
    for (const rule of rules) {
      const c = compareByRule(a.item, b.item, rule, ctx);
      if (c !== 0) return c;
    }
    return a.i - b.i;
  });
  return decorated.map((d) => d.item);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter web test -- plan-sort`
Expected: PASS（6 个用例）

- [ ] **Step 5: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/[id]/plan-sort.ts" "apps/web/src/app/(teacher)/teacher/plans/[id]/__tests__/plan-sort.test.ts"
git commit -m "feat(plan): sortPlanItems 段内多级稳定排序纯函数(null 沉底/分类键序)"
```

---

## Task 4: 应用顺序 `buildAppliedOrder` + 选项常量

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/plan-sort.ts`
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/__tests__/plan-sort.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `__tests__/plan-sort.test.ts` 末尾追加：

```ts
import { buildAppliedOrder } from '../plan-sort';

describe('buildAppliedOrder', () => {
  it('强制冲→稳→保 分块, 块内按规则排, 返回 itemId 顺序', () => {
    const items = [
      mk({ id: 1, gradient: 'BAO', score25Group: 500 }),
      mk({ id: 2, gradient: 'CHONG', score25Group: 680 }),
      mk({ id: 3, gradient: 'CHONG', score25Group: 700 }),
      mk({ id: 4, gradient: 'WEN', score25Group: 600 }),
    ];
    const rules: SortRule[] = [{ key: 'GROUP_MIN_SCORE', dir: 'desc' }];
    // 冲块(3:700, 2:680) → 稳块(4) → 保块(1)
    expect(buildAppliedOrder(items, rules, ctx)).toEqual([3, 2, 4, 1]);
  });

  it('未知梯度归入冲块兜底', () => {
    const items = [mk({ id: 1, gradient: 'WEN' }), mk({ id: 2, gradient: 'X' as any })];
    expect(buildAppliedOrder(items, [], ctx)).toEqual([2, 1]); // X→冲块在前, WEN→稳块
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter web test -- plan-sort`
Expected: FAIL（`buildAppliedOrder` 未导出）

- [ ] **Step 3: 实现 `buildAppliedOrder` + 选项常量**

在 `plan-sort.ts` 末尾追加：

```ts
// 写回志愿顺位: 投档铁律强制 冲→稳→保 分块, 块内套用段内多级排序, 返回扁平 itemId 顺序。
// 喂给现有 reorderItems(planId, itemIds) 即可(后端两阶段提交避让唯一约束)。
const TIER_ORDER: string[] = ['CHONG', 'WEN', 'BAO'];

export function buildAppliedOrder(items: SortableItem[], rules: SortRule[], ctx: SortContext): number[] {
  const buckets: Record<string, SortableItem[]> = { CHONG: [], WEN: [], BAO: [] };
  for (const it of items) {
    (buckets[it.gradient] ?? buckets.CHONG).push(it); // 未知梯度兜底进冲块
  }
  const ordered = TIER_ORDER.flatMap((g) => sortPlanItems(buckets[g], rules, ctx));
  return ordered.map((it) => it.id);
}

// 排序键下拉选项: label + 默认方向 + 双向标签(切键时方向重置为 defaultDir)
export const SORT_KEY_OPTIONS: Array<{
  key: SortKey; label: string; defaultDir: SortDir; dir: { asc: string; desc: string };
}> = [
  { key: 'SCHOOL_NATURE',   label: '办学性质',       defaultDir: 'asc',  dir: { asc: '公办优先', desc: '中外优先' } },
  { key: 'PROVINCE_INOUT',  label: '川内川外',       defaultDir: 'asc',  dir: { asc: '川内优先', desc: '川外优先' } },
  { key: 'GROUP_MIN_SCORE', label: '专业组最低分',   defaultDir: 'desc', dir: { asc: '分低', desc: '分高' } },
  { key: 'GROUP_MIN_RANK',  label: '专业组最低位次', defaultDir: 'asc',  dir: { asc: '位次靠前', desc: '位次靠后' } },
  { key: 'PLAN_COUNT',      label: '招生计划数',     defaultDir: 'desc', dir: { asc: '计划少', desc: '计划多' } },
  { key: 'UNIVERSITY_RANK', label: '院校排名',       defaultDir: 'asc',  dir: { asc: '排名高', desc: '排名低' } },
  { key: 'TUITION',         label: '学费',           defaultDir: 'asc',  dir: { asc: '学费低', desc: '学费高' } },
  { key: 'TAGS',            label: '985/211/双一流',  defaultDir: 'asc',  dir: { asc: '有标签优先', desc: '无标签优先' } },
  { key: 'RANK_DIFF',       label: '相对位次差',     defaultDir: 'desc', dir: { asc: '偏冲', desc: '偏稳' } },
];

export const SORT_KEY_LABEL: Record<SortKey, string> = Object.fromEntries(
  SORT_KEY_OPTIONS.map((o) => [o.key, o.label]),
) as Record<SortKey, string>;

export function defaultDirOf(key: SortKey): SortDir {
  return SORT_KEY_OPTIONS.find((o) => o.key === key)?.defaultDir ?? 'desc';
}

// 快捷预设: 一键填入常用规则栈
export const SORT_PRESETS: Array<{ label: string; rules: SortRule[] }> = [
  { label: '公办优先', rules: [{ key: 'SCHOOL_NATURE', dir: 'asc' }] },
  { label: '川内优先', rules: [{ key: 'PROVINCE_INOUT', dir: 'asc' }] },
  { label: '分数线高→低', rules: [{ key: 'GROUP_MIN_SCORE', dir: 'desc' }] },
];
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter web test -- plan-sort`
Expected: PASS（全部 8 个用例）

- [ ] **Step 5: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/[id]/plan-sort.ts" "apps/web/src/app/(teacher)/teacher/plans/[id]/__tests__/plan-sort.test.ts"
git commit -m "feat(plan): buildAppliedOrder 段内栈应用(冲→稳→保 写回)+ 排序键选项/预设常量"
```

---

## Task 5: 规则栈编辑器组件 `PlanSortPanel`

**Files:**
- Create: `apps/web/src/app/(teacher)/teacher/plans/[id]/PlanSortPanel.tsx`

> 该组件是受控的：规则栈/梯度方向由父页面持有，组件只渲染编辑 UI + 触发回调。视觉沿用生成页 `pgv3-sort` 风格的轻量内联样式（spec 第 4 节），不新增 CSS 文件。

- [ ] **Step 1: 实现组件**

Create `apps/web/src/app/(teacher)/teacher/plans/[id]/PlanSortPanel.tsx`:

```tsx
'use client';

import { Button } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  SORT_KEY_OPTIONS, SORT_PRESETS, defaultDirOf,
  type SortKey, type SortDir, type SortRule,
} from './plan-sort';

export interface PlanSortPanelProps {
  rules: SortRule[];
  gradientDir: SortDir;           // 段序: asc=冲→稳→保, desc=保→稳→冲(仅预览)
  preview: boolean;
  canApply: boolean;              // 仅 DRAFT 可写回
  onRulesChange: (rules: SortRule[]) => void;
  onGradientDirChange: (dir: SortDir) => void;
  onPreview: () => void;
  onRestore: () => void;
  onApply: () => void;
}

export default function PlanSortPanel({
  rules, gradientDir, preview, canApply,
  onRulesChange, onGradientDirChange, onPreview, onRestore, onApply,
}: PlanSortPanelProps) {
  const usedKeys = new Set(rules.map((r) => r.key));
  const firstUnused = SORT_KEY_OPTIONS.find((o) => !usedKeys.has(o.key));

  const setRuleKey = (idx: number, key: SortKey) =>
    onRulesChange(rules.map((r, i) => (i === idx ? { key, dir: defaultDirOf(key) } : r)));
  const setRuleDir = (idx: number, dir: SortDir) =>
    onRulesChange(rules.map((r, i) => (i === idx ? { ...r, dir } : r)));
  const removeRule = (idx: number) => onRulesChange(rules.filter((_, i) => i !== idx));
  const addRule = () => firstUnused && onRulesChange([...rules, { key: firstUnused.key, dir: firstUnused.defaultDir }]);

  return (
    <div style={{ width: 360, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 快捷预设 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SORT_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onRulesChange(p.rules)}
            style={chipStyle}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 梯度固定第一级(分组层) */}
      <div style={ruleRowStyle}>
        <span style={{ flex: 1, fontWeight: 600 }}>① 梯度（分组）</span>
        <div style={dirGroupStyle} role="group" aria-label="段序方向">
          {([['asc', '冲→保'], ['desc', '保→冲']] as const).map(([d, txt]) => (
            <button key={d} type="button" onClick={() => onGradientDirChange(d)} style={dirBtnStyle(gradientDir === d)}>
              {txt}
            </button>
          ))}
        </div>
      </div>

      {/* 段内排序栈 */}
      {rules.map((rule, idx) => {
        const opt = SORT_KEY_OPTIONS.find((o) => o.key === rule.key);
        return (
          <div key={idx} style={ruleRowStyle}>
            <span style={{ width: 18, color: '#8c8c8c' }}>{idx + 2}</span>
            <select
              value={rule.key}
              onChange={(e) => setRuleKey(idx, e.target.value as SortKey)}
              style={{ flex: 1, padding: '4px 6px', borderRadius: 6, border: '1px solid #d9d9d9' }}
            >
              {SORT_KEY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} disabled={usedKeys.has(o.key) && o.key !== rule.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <div style={dirGroupStyle} role="group" aria-label="排序方向">
              {([['asc', opt?.dir.asc ?? '升'], ['desc', opt?.dir.desc ?? '降']] as const).map(([d, txt]) => (
                <button key={d} type="button" onClick={() => setRuleDir(idx, d as SortDir)} style={dirBtnStyle(rule.dir === d)}>
                  {txt}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => removeRule(idx)} aria-label="删除该级" style={iconBtnStyle}>
              <DeleteOutlined />
            </button>
          </div>
        );
      })}

      <Button size="small" type="dashed" icon={<PlusOutlined />} disabled={!firstUnused} onClick={addRule} block>
        加一级排序
      </Button>

      {/* 动作 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {preview ? (
          <Button size="small" onClick={onRestore}>恢复手动顺序</Button>
        ) : (
          <Button size="small" type="primary" ghost onClick={onPreview} disabled={!rules.length}>预览</Button>
        )}
        <Button
          size="small"
          type="primary"
          onClick={onApply}
          disabled={!canApply || !rules.length}
          title={canApply ? '' : '仅草稿状态可写回顺序'}
          style={{ marginLeft: 'auto' }}
        >
          应用为志愿顺序
        </Button>
      </div>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  border: '1px solid #d9d9d9', borderRadius: 14, padding: '2px 10px',
  fontSize: 12, background: '#fff', cursor: 'pointer', color: '#595959',
};
const ruleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const dirGroupStyle: React.CSSProperties = {
  display: 'inline-flex', border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden',
};
const dirBtnStyle = (active: boolean): React.CSSProperties => ({
  border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 12, lineHeight: 1.5,
  background: active ? '#1677ff' : '#fff', color: active ? '#fff' : '#595959',
});
const iconBtnStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', color: '#bfbfbf', padding: 4,
};
```

- [ ] **Step 2: 编译确认无类型错误**

Run: `pnpm --filter web build` （或 `pnpm --filter web exec tsc --noEmit`）
Expected: 通过（组件类型自洽；尚未在 page 引用，不影响构建）

- [ ] **Step 3: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/[id]/PlanSortPanel.tsx"
git commit -m "feat(plan): PlanSortPanel 多级排序规则栈编辑器(梯度固定层+预设+方向)"
```

---

## Task 6: 页面集成（工具栏入口 + 预览渲染 + 应用/恢复）

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`

> 关键点：预览是**渲染时变换**（不改 `localItems`，不发请求）；应用走现有 `reorderMutation`；预览开启时禁用拖拽（位置由排序算出）。

- [ ] **Step 1: import 排序模块 + 组件 + antd Popover/SortAscending 图标**

在 `page.tsx` 顶部 import 区追加：

```tsx
import { Popover } from 'antd';
import { SortAscendingOutlined } from '@ant-design/icons';
import PlanSortPanel from './PlanSortPanel';
import {
  sortPlanItems, buildAppliedOrder,
  type SortRule, type SortDir, type SortableItem,
} from './plan-sort';
```

（`Popover` 加进现有 `from 'antd'` 的解构，或单独 import 一行；`SortAscendingOutlined` 加进现有 `@ant-design/icons` 解构。）

- [ ] **Step 2: 加排序状态**

在组件内（`localItems` state 附近，约 L242 之后）加：

```tsx
  // —— 多级排序(预览 + 一键应用) ——
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [gradientDir, setGradientDir] = useState<SortDir>('asc'); // 段序: asc=冲→稳→保
  const [sortPreview, setSortPreview] = useState(false);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
```

- [ ] **Step 3: 应用/恢复处理 + 段序与段内排序计算**

在 `commitRowReorder` / `handleRowDragEnd` 之后加：

```tsx
  const sortCtx = { studentRank: summary.studentRank };

  // 应用为志愿顺序: 段内栈算出扁平 itemId, 复用 reorder 写回(仅 DRAFT)
  const applySortOrder = () => {
    const order = buildAppliedOrder(localItems as SortableItem[], sortRules, sortCtx);
    setLocalItems((prev) => {
      const byId = new Map(prev.map((it) => [it.id, it]));
      return order.map((id) => byId.get(id)).filter(Boolean) as any[];
    });
    reorderMutation.mutate(order);
    setSortPreview(false);
    setSortPanelOpen(false);
  };

  // 预览态下: TIER_META 渲染顺序按段序方向, 段内按规则排
  const tierMetaOrdered = gradientDir === 'desc' ? [...TIER_META].reverse() : TIER_META;
```

> 注意：`sortCtx` 引用了 `summary`，必须放在 `summary = useMemo(...)`（约 L547-576）**之后**。把上面这段移到 `summary` 定义之后、`if (isLoading)` 之前。

- [ ] **Step 4: 工具栏加「排序」入口（Popover）**

在 `pl-tbl-toolhint` 区块（约 L908-939）内，"点击任意行..."提示之后、清空按钮之前，插入排序入口：

```tsx
          <Popover
            open={sortPanelOpen}
            onOpenChange={setSortPanelOpen}
            trigger="click"
            placement="bottomLeft"
            content={
              <PlanSortPanel
                rules={sortRules}
                gradientDir={gradientDir}
                preview={sortPreview}
                canApply={status === 'DRAFT'}
                onRulesChange={(r) => { setSortRules(r); if (r.length) setSortPreview(true); }}
                onGradientDirChange={setGradientDir}
                onPreview={() => setSortPreview(true)}
                onRestore={() => setSortPreview(false)}
                onApply={applySortOrder}
              />
            }
          >
            <Button size="small" type="text" icon={<SortAscendingOutlined />} style={{ marginLeft: 8 }}>
              排序
            </Button>
          </Popover>
```

- [ ] **Step 5: 预览提示条 + 段内排序渲染 + 禁拖**

把志愿表渲染处（约 L956-1006）的两点改掉。

(a) 段循环用 `tierMetaOrdered` 替换 `TIER_META`，且段内 items 预览时排序、并禁拖：

```tsx
          tierMetaOrdered.map((meta) => {
            const rawTierItems = localItems.filter((it) => GRADIENT_TIER[it.gradient] === meta.tier);
            const tierItems = sortPreview
              ? sortPlanItems(rawTierItems as SortableItem[], sortRules, sortCtx)
              : rawTierItems;
            if (tierItems.length === 0) return null;
            const canDragRows = status === 'DRAFT' && !reorderMutation.isPending && !sortPreview;
```

（其余 `tierItems.map(...)` 不变。）

(b) 在 `pl-tbl-head`（约 L940）之前插入预览提示条：

```tsx
        {sortPreview ? (
          <div style={{ padding: '8px 22px', background: '#fffbe6', borderBottom: '1px solid #ffe58f', fontSize: 12, color: '#874d00', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>排序预览中（未保存）· 拖拽已暂停</span>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSortPreview(false)}>恢复手动顺序</Button>
            {status === 'DRAFT' ? (
              <Button size="small" type="link" style={{ padding: 0, marginLeft: 'auto' }} onClick={applySortOrder}>应用为志愿顺序</Button>
            ) : (
              <span style={{ marginLeft: 'auto', color: '#bfbfbf' }}>仅草稿可写回顺序</span>
            )}
          </div>
        ) : null}
```

- [ ] **Step 6: 编译 + 既有前端测试不回归**

Run: `pnpm --filter web build`
Expected: 构建通过

Run: `pnpm --filter web test -- GeneratePlanPage`
Expected: 既有用例不回归（对照 baseline）

- [ ] **Step 7: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx"
git commit -m "feat(plan): 志愿表多级排序集成(工具栏入口/预览渲染/段序/应用写回)"
```

---

## Task 7: 手动验证

**Files:** 无（运行验证）

- [ ] **Step 1: 起本地前后端**

参考 `/run` 或项目脚本启动 server + web，登录教师账号（见 memory `demo_teacher_accounts`），打开一个 **DRAFT** 状态、已有志愿的方案详情页。

- [ ] **Step 2: 逐项验证**

- [ ] 工具栏出现「排序」按钮，点开弹出规则栈面板。
- [ ] 点预设「公办优先」→ 自动进入预览，冲/稳/保各段内公办行排到前面；表顶出现"排序预览中"黄条。
- [ ] 加一级「专业组最低分·分高」→ 段内同性质再按分数线高到低。
- [ ] 切「川内川外·川外优先」方向 → 段内顺序随之翻转。
- [ ] 预览态下行无法拖拽（grip 不响应）。
- [ ] 点「应用为志愿顺序」→ 顺位 01.. 重排并 toast"志愿顺序已保存"；刷新页面顺序保持。
- [ ] 切到一个 **非 DRAFT**（如 PENDING_REVIEW）方案 → 排序可预览，"应用"按钮灰显且提示"仅草稿可写回顺序"。
- [ ] 最低分/最低位次列对有数据的行正常显示（验证后端拆字段透出生效）。

- [ ] **Step 3: 若全部通过, 收尾提交（无代码改动则跳过）**

如验证中发现需微调，改完按对应 Task 的提交粒度补交。

---

## Self-Review（已执行，记录于此）

**Spec coverage：**
- 排序模型(有序栈/段内) → Task 3。
- 9 个排序键 + 分类键内部序 + null 沉底 → Task 3（getSortValue/natureRank/compareByRule）。
- 梯度固定分组层 + 应用强制冲→稳→保 + 段序翻转仅预览 → Task 4(buildAppliedOrder) + Task 6(gradientDir/tierMetaOrdered)。
- 预览/应用/恢复 + 工具栏 + 预设 → Task 5 + Task 6。
- 状态机边界(仅 DRAFT 写回) → Task 6(canApply=status==='DRAFT') + 预览态禁拖。
- 后端拆分数线 + merge University(零迁移) → Task 1 + Task 2。

**Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码。

**Type consistency：** `SortKey`/`SortDir`/`SortRule`/`SortableItem`/`SortContext` 在 Task 3 定义，Task 4/5/6 一致引用；`buildAppliedOrder`/`sortPlanItems`/`SORT_KEY_OPTIONS`/`SORT_PRESETS`/`defaultDirOf` 命名前后一致；后端 `toSortFields`/`UniversitySortSource` Task 1 定义，Task 2 引用一致。
