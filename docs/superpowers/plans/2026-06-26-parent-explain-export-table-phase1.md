# 家长版 A3 数据表导出（第一期：共享核心 + 打印页）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 老师在方案详情页点「家长版数据表」，新标签打开一张 A3 横版、数据丰富的方案解释表，Ctrl+P 打印或另存为 PDF 给家长。

**Architecture:** 新增后端端点 `GET /plans/:planId/export-rows`，复用候选服务 `getCandidateGroups`（传 `excludeAdded:false` + 各 include 开关 + 大 pageSize）富化方案条目，按 `(universityId|groupCode)` 匹配，缺组用快照兜底，返回「按专业组分组的富化行」JSON（`ExportSheet`）。富化与组装逻辑拆成纯函数文件便于单测。前端在独立路由组 `(print)` 下渲染 A3 表（CSS `@page A3 landscape`）。

**Tech Stack:** NestJS + Prisma（后端）、exceljs（二期才用）、Next.js App Router + React + antd + CSS Modules、jest + @testing-library/react。

**口径来源（已在设计文档核实）：**
- 候选组对象字段：`universityId / universityName / universityCode / universityRank`、`university.{city, runningNature, is985, is211, isDoubleFirstClass}`、`groupCode`、`currentPlanCount`(组当年招生人数)、`majors[]`。
- 候选专业字段：`majorCode / majorName / planCount(当前年) / tuition / duration / standardDuration / planNotes`、`majorHistory4y: [{year, minScore, minRank, avgScore, avgRank, planCount}]`、`supplementaryByYear: {[year]: number|null}`、`supplementaryRoundsByYear: {[year]: [{round,count}]|null}`。
- `getCandidateGroups(planId, q, userId)` 已自校验归属并从 planId 派生学生/批次；返回含 `groups[]` 与 `admissionBaselineYear`。
- 前端 `api` 客户端自动带 JWT，并把响应解包成 `response.data`。

---

## File Structure

**后端（apps/server）：**
- Create `src/modules/plan-candidate/plan-export-rows.builder.ts` —— 纯函数 + 类型：把候选组 + 方案条目组装成 `ExportSheet`。无 Prisma 依赖，纯数据变换。
- Create `src/modules/plan-candidate/plan-export-rows.builder.spec.ts` —— 纯单测。
- Modify `src/modules/plan-candidate/plan-candidate.service.ts` —— 加 `getExportRows(planId, userId?)`（加载 plan + 调 getCandidateGroups + 调 builder）。
- Modify `src/modules/plan-candidate/plan-candidate.controller.ts` —— 加路由 `GET :planId/export-rows`。

**前端（apps/web）：**
- Create `src/app/(print)/plan-sheet/[id]/types.ts` —— `ExportSheet/ExportGroup/ExportMajor`（镜像后端 builder 类型）。
- Create `src/app/(print)/plan-sheet/[id]/ParentExplainTable.tsx` —— 纯渲染组件（A3 表）。
- Create `src/app/(print)/plan-sheet/[id]/ParentExplainTable.module.css` —— A3 打印样式。
- Create `src/app/(print)/plan-sheet/[id]/__tests__/ParentExplainTable.test.tsx` —— 组件测。
- Create `src/app/(print)/plan-sheet/[id]/page.tsx` —— 打印页（拉数 + 打印按钮 + @page CSS）。
- Modify `src/services/plan-api.ts` —— 加 `getExportRows(planId)`。
- Modify `src/app/(teacher)/teacher/plans/[id]/page.tsx` —— 下拉菜单加「家长版数据表」入口。

`(print)` 是新路由组，**不放 layout.tsx**，因此只继承根布局（QueryProvider + antd），无侧栏 —— 适合打印。

---

## Task 1: 后端富化组装纯函数 + 类型（plan-export-rows.builder）

**Files:**
- Create: `apps/server/src/modules/plan-candidate/plan-export-rows.builder.ts`
- Test: `apps/server/src/modules/plan-candidate/plan-export-rows.builder.spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/server/src/modules/plan-candidate/plan-export-rows.builder.spec.ts`:

```ts
import { buildExportSheet } from './plan-export-rows.builder';

const YEARS = [2023, 2024, 2025];

// 一个富化候选组(含 1 个候选专业, majorHistory4y 覆盖 2024/2025, 2023 缺)
const enrichedGroup = {
  universityId: 10,
  universityName: '电子科技大学',
  universityCode: '0612',
  universityRank: 33,
  university: { city: '成都', runningNature: '公办', is985: true, is211: true, isDoubleFirstClass: true },
  groupCode: '01',
  currentPlanCount: 88,
  majors: [
    {
      majorCode: '0809',
      majorName: '计算机类',
      planCount: 20, // 26 计划
      tuition: 4900,
      duration: '四年',
      standardDuration: '4年',
      planNotes: '色盲色弱不录取；含中外合作办学方向，学费以当年为准',
      majorHistory4y: [
        { year: 2025, minScore: 668, minRank: 1200, avgScore: 675, avgRank: 900, planCount: 20 },
        { year: 2024, minScore: 662, minRank: 1500, avgScore: 670, avgRank: 1100, planCount: 18 },
        { year: 2023, minScore: null, minRank: null, avgScore: null, avgRank: null, planCount: null },
        { year: 2022, minScore: 655, minRank: 1800, avgScore: 663, avgRank: 1300, planCount: 16 },
      ],
      supplementaryByYear: { 2025: 3, 2024: null, 2023: null },
      supplementaryRoundsByYear: { 2025: [{ round: 1, count: 2 }, { round: 2, count: 1 }], 2024: null, 2023: null },
    },
  ],
};

const plan = {
  id: 7,
  name: 'v1 方案',
  year: 2026,
  batchName: '本科批',
  version: 1,
  scoreUsed: 670,
  rankUsed: 1000,
  student: { user: { realName: '张三' }, examType: 'PHYSICS', totalScore: 670, provincialRank: 1000, userId: 99 },
  planItems: [
    {
      sequence: 1,
      gradient: 'WEN',
      universityId: 10,
      universityName: '电子科技大学',
      universityCode: '0612',
      schoolNature: '公办',
      schoolTags: '985/211/双一流',
      groupCode: '01',
      majorId: 501,
      majorName: '计算机类',
      majorCode: '0809',
      planCount: 20,
      tuition: 4900,
      score25Major: 668,
      score24Major: 662,
    },
  ],
};

describe('buildExportSheet', () => {
  it('富化组：合并院校字段 + 候选专业 + 多年/征集透出', () => {
    const sheet = buildExportSheet({ plan, enrichedGroups: [enrichedGroup], years: YEARS });

    expect(sheet.student).toEqual({ name: '张三', examTypeLabel: '物理类', score: 670, rank: 1000 });
    expect(sheet.years).toEqual([2023, 2024, 2025]);
    expect(sheet.groups).toHaveLength(1);

    const g = sheet.groups[0];
    expect(g.fallback).toBe(false);
    expect(g.city).toBe('成都');
    expect(g.universityRank).toBe(33);
    expect(g.schoolNature).toBe('公办');
    expect(g.groupCode).toBe('01');
    expect(g.groupPlanCount).toBe(88);
    expect(g.gradientLabel).toBe('稳');
    expect(g.majors).toHaveLength(1);

    const m = g.majors[0];
    expect(m.planCount).toBe(20);
    expect(m.planByYear).toEqual({ 2023: null, 2024: 18, 2025: 20 });
    expect(m.minScoreByYear).toEqual({ 2023: null, 2024: 662, 2025: 668 });
    expect(m.suppByYear[2025]).toEqual({ count: 3, rounds: 2 });
    expect(m.suppByYear[2024]).toBeNull();
    expect(m.duration).toBe('四年');
    expect(m.tuition).toBe(4900);
    expect(m.planNotes).toContain('中外合作');
  });

  it('快照兜底：组在富化结果缺失时用 planItem 快照渲染单个锚定专业', () => {
    const sheet = buildExportSheet({ plan, enrichedGroups: [], years: YEARS });
    const g = sheet.groups[0];
    expect(g.fallback).toBe(true);
    expect(g.universityName).toBe('电子科技大学');
    expect(g.city).toBeNull();           // 快照无城市
    expect(g.universityRank).toBeNull();  // 快照无排名
    expect(g.groupPlanCount).toBeNull();
    expect(g.majors).toHaveLength(1);
    const m = g.majors[0];
    expect(m.majorName).toBe('计算机类');
    expect(m.minScoreByYear).toEqual({ 2023: null, 2024: 662, 2025: 668 }); // 快照 25/24 有, 23 无
    expect(m.planByYear).toEqual({ 2023: null, 2024: null, 2025: null });
    expect(m.suppByYear[2025]).toBeNull();
  });

  it('多条目按 planItems 顺序输出', () => {
    const twoItemPlan = {
      ...plan,
      planItems: [
        { ...plan.planItems[0], sequence: 1, universityId: 10, groupCode: '01' },
        { ...plan.planItems[0], sequence: 2, universityId: 20, groupCode: '02', universityName: '西南交大', majorName: '土木类' },
      ],
    };
    const sheet = buildExportSheet({ plan: twoItemPlan, enrichedGroups: [enrichedGroup], years: YEARS });
    expect(sheet.groups.map((g) => g.sequence)).toEqual([1, 2]);
    expect(sheet.groups[0].fallback).toBe(false); // 命中富化
    expect(sheet.groups[1].fallback).toBe(true);  // 无富化 → 兜底
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter server test plan-export-rows.builder`
Expected: FAIL —— `Cannot find module './plan-export-rows.builder'`。

- [ ] **Step 3: 写最小实现**

Create `apps/server/src/modules/plan-candidate/plan-export-rows.builder.ts`:

```ts
// 把候选服务富化组 + 方案条目快照组装成「家长版 A3 数据表」数据模型。
// 纯函数, 无 Prisma 依赖, 便于单测。口径见 docs/superpowers/specs/2026-06-26-parent-explain-export-table-design.md。

export interface ExportMajor {
  majorCode: string | null;
  majorName: string;
  planCount: number | null; // 26 计划(当前年)
  planByYear: Record<number, number | null>;
  minScoreByYear: Record<number, number | null>;
  suppByYear: Record<number, { count: number; rounds: number } | null>;
  duration: string | null;
  tuition: number | null;
  planNotes: string | null;
}

export interface ExportGroup {
  sequence: number;
  gradient: string;
  gradientLabel: string; // 冲/稳/保
  universityName: string;
  universityCode: string | null;
  schoolNature: string | null;
  schoolTags: string | null;
  city: string | null;
  universityRank: number | null;
  groupCode: string | null;
  groupPlanCount: number | null; // 组招生人数
  fallback: boolean;
  majors: ExportMajor[];
}

export interface ExportSheet {
  student: { name: string; examTypeLabel: string; score: number | null; rank: number | null };
  plan: { id: number; name: string; year: number; batchName: string | null; version: number | null };
  years: number[]; // [b-2, b-1, b]
  groups: ExportGroup[];
}

const GRADIENT_LABEL: Record<string, string> = { CHONG: '冲', WEN: '稳', BAO: '保' };
const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
  COMPREHENSIVE_SCIENCE: '理科',
  COMPREHENSIVE_LIBERAL: '文科',
};

function groupKey(universityId: unknown, groupCode: unknown): string {
  return `${universityId}|${groupCode ?? ''}`;
}

function composeSchoolTags(u: any): string | null {
  if (!u) return null;
  const tags: string[] = [];
  if (u.is985) tags.push('985');
  if (u.is211) tags.push('211');
  if (u.isDoubleFirstClass) tags.push('双一流');
  return tags.length ? tags.join('/') : null;
}

function pickHistoryByYear(
  history4y: any[] | null | undefined,
  years: number[],
  field: 'planCount' | 'minScore',
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const y of years) {
    const row = Array.isArray(history4y) ? history4y.find((h) => h?.year === y) : null;
    const v = row ? row[field] : null;
    out[y] = typeof v === 'number' ? v : null;
  }
  return out;
}

function buildSuppByYear(
  suppByYear: Record<number, number | null> | null | undefined,
  suppRoundsByYear: Record<number, Array<{ round: number; count: number }> | null> | null | undefined,
  years: number[],
): Record<number, { count: number; rounds: number } | null> {
  const out: Record<number, { count: number; rounds: number } | null> = {};
  for (const y of years) {
    const count = suppByYear?.[y];
    const rounds = suppRoundsByYear?.[y];
    if ((typeof count === 'number' && count > 0) || (Array.isArray(rounds) && rounds.length > 0)) {
      out[y] = { count: typeof count === 'number' ? count : 0, rounds: Array.isArray(rounds) ? rounds.length : 0 };
    } else {
      out[y] = null;
    }
  }
  return out;
}

function buildEnrichedMajor(m: any, years: number[]): ExportMajor {
  return {
    majorCode: m.majorCode ?? null,
    majorName: m.majorName ?? '',
    planCount: typeof m.planCount === 'number' ? m.planCount : null,
    planByYear: pickHistoryByYear(m.majorHistory4y, years, 'planCount'),
    minScoreByYear: pickHistoryByYear(m.majorHistory4y, years, 'minScore'),
    suppByYear: buildSuppByYear(m.supplementaryByYear, m.supplementaryRoundsByYear, years),
    duration: m.duration ?? m.standardDuration ?? null,
    tuition: typeof m.tuition === 'number' ? m.tuition : null,
    planNotes: m.planNotes ?? null,
  };
}

function buildEnrichedGroup(item: any, g: any, years: number[]): ExportGroup {
  return {
    sequence: item.sequence,
    gradient: item.gradient,
    gradientLabel: GRADIENT_LABEL[item.gradient] ?? '-',
    universityName: g.universityName ?? item.universityName ?? '',
    universityCode: g.universityCode ?? item.universityCode ?? null,
    schoolNature: g.university?.runningNature ?? item.schoolNature ?? null,
    schoolTags: item.schoolTags ?? composeSchoolTags(g.university),
    city: g.university?.city ?? null,
    universityRank: typeof g.universityRank === 'number' ? g.universityRank : null,
    groupCode: item.groupCode ?? g.groupCode ?? null,
    groupPlanCount: typeof g.currentPlanCount === 'number' ? g.currentPlanCount : null,
    fallback: false,
    majors: Array.isArray(g.majors) ? g.majors.map((m: any) => buildEnrichedMajor(m, years)) : [],
  };
}

// 快照兜底: 富化结果缺该组时, 用 planItem 自身渲染单个锚定专业。
function buildFallbackGroup(item: any, years: number[]): ExportGroup {
  const minScoreByYear: Record<number, number | null> = {};
  for (const y of years) minScoreByYear[y] = null;
  // 快照里 25/24 专业线可能有
  const [, y2, y3] = years; // years = [b-2, b-1, b]
  if (typeof item.score24Major === 'number') minScoreByYear[y2] = item.score24Major;
  if (typeof item.score25Major === 'number') minScoreByYear[y3] = item.score25Major;
  const planByYear: Record<number, number | null> = {};
  const suppByYear: Record<number, { count: number; rounds: number } | null> = {};
  for (const y of years) { planByYear[y] = null; suppByYear[y] = null; }

  return {
    sequence: item.sequence,
    gradient: item.gradient,
    gradientLabel: GRADIENT_LABEL[item.gradient] ?? '-',
    universityName: item.universityName ?? '',
    universityCode: item.universityCode ?? null,
    schoolNature: item.schoolNature ?? null,
    schoolTags: item.schoolTags ?? null,
    city: null,
    universityRank: null,
    groupCode: item.groupCode ?? null,
    groupPlanCount: null,
    fallback: true,
    majors: [
      {
        majorCode: item.majorCode ?? null,
        majorName: item.majorName ?? '',
        planCount: typeof item.planCount === 'number' ? item.planCount : null,
        planByYear,
        minScoreByYear,
        suppByYear,
        duration: null,
        tuition: typeof item.tuition === 'number' ? item.tuition : null,
        planNotes: null,
      },
    ],
  };
}

export function buildExportSheet(input: {
  plan: any;
  enrichedGroups: any[];
  years: number[];
}): ExportSheet {
  const { plan, enrichedGroups, years } = input;
  const byKey = new Map<string, any>();
  for (const g of enrichedGroups ?? []) byKey.set(groupKey(g.universityId, g.groupCode), g);

  const items: any[] = Array.isArray(plan.planItems) ? plan.planItems : [];
  const groups = items.map((item) => {
    const g = byKey.get(groupKey(item.universityId, item.groupCode));
    return g ? buildEnrichedGroup(item, g, years) : buildFallbackGroup(item, years);
  });

  return {
    student: {
      name: plan.student?.user?.realName ?? '学生',
      examTypeLabel: EXAM_TYPE_LABEL[plan.student?.examType] ?? '',
      score: plan.scoreUsed ?? plan.student?.totalScore ?? null,
      rank: plan.rankUsed ?? plan.student?.provincialRank ?? null,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      year: plan.year,
      batchName: plan.batchName ?? null,
      version: plan.version ?? null,
    },
    years,
    groups,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter server test plan-export-rows.builder`
Expected: PASS（3 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan-candidate/plan-export-rows.builder.ts apps/server/src/modules/plan-candidate/plan-export-rows.builder.spec.ts
git commit -m "feat(export): 家长版数据表富化组装纯函数 + 单测"
```

---

## Task 2: 后端端点（service.getExportRows + controller 路由）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.controller.ts`

- [ ] **Step 1: service 顶部导入 builder**

在 `plan-candidate.service.ts` 现有 import 区加入（紧挨其他相对导入即可）：

```ts
import { buildExportSheet, ExportSheet } from './plan-export-rows.builder';
```

- [ ] **Step 2: 在 PlanCandidateService 类内新增 `getExportRows` 方法**

加在 `getCandidateGroups(...)` 方法之后（同一个 class 内）。注意：**先做归属校验再 try/catch**，避免富化异常被吞导致越权返回快照。

```ts
  // 家长版 A3 数据表数据源: 复用 getCandidateGroups 富化 plan 各组, 缺组用快照兜底。
  async getExportRows(planId: number, userId?: number): Promise<ExportSheet> {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: {
        planItems: { orderBy: { sequence: 'asc' } },
        student: { include: { user: true } },
      },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    // 归属校验(与 getCandidateGroups 同口径), 必须在 try 外, 不可被富化兜底绕过。
    if (userId && plan.createdById !== userId && plan.student?.userId !== userId) {
      throw new ForbiddenException('无权查看此方案');
    }

    // 富化基准年: 默认 plan.year-1(高考年的上一年=最新录取年), 富化成功则用真实 admissionBaselineYear。
    let baselineYear = (plan.year ?? new Date().getFullYear()) - 1;
    let enrichedGroups: any[] = [];
    try {
      const res = await this.getCandidateGroups(
        planId,
        {
          page: 1,
          pageSize: 500,
          excludeAdded: false,
          includeSoftFails: true,
          includeHardFails: true,
          includeRegionMismatch: true,
          groupBy: 'GROUP',
        } as any,
        userId,
      );
      enrichedGroups = (res as any)?.groups ?? [];
      if (typeof (res as any)?.admissionBaselineYear === 'number') {
        baselineYear = (res as any).admissionBaselineYear;
      }
    } catch (e) {
      // 富化失败(如方案缺批次)不致命: 退回全快照渲染, 不让打印页空白。
      console.warn('[export-rows] 富化失败, 退回快照:', (e as Error)?.message);
    }

    const years = [baselineYear - 2, baselineYear - 1, baselineYear];
    return buildExportSheet({ plan, enrichedGroups, years });
  }
```

> `NotFoundException` / `ForbiddenException` 已在本文件 import（见 getCandidateGroups 中使用），无需新增导入。`new Date()` 仅用于无 plan.year 的兜底，与 plan 逻辑无关。

- [ ] **Step 3: controller 加路由**

在 `plan-candidate.controller.ts` 的 `getCandidateGroups` 路由之后加：

```ts
  @Get(':planId/export-rows')
  getExportRows(
    @Param('planId', ParseIntPipe) planId: number,
    @Req() req: any,
  ) {
    return this.service.getExportRows(planId, req.user.id);
  }
```

- [ ] **Step 4: 类型检查 / 构建后端**

Run: `pnpm --filter server build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 5: 跑现有候选服务测试，确认无回归**

Run: `pnpm --filter server test plan-candidate.service`
Expected: 与基线一致（未引入新失败；既有红的对照 [[test_suite_baseline_failures]] 名单）。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.controller.ts
git commit -m "feat(export): GET /plans/:id/export-rows 家长版数据表端点"
```

---

## Task 3: 前端 plan-api + 类型镜像

**Files:**
- Create: `apps/web/src/app/(print)/plan-sheet/[id]/types.ts`
- Modify: `apps/web/src/services/plan-api.ts`

- [ ] **Step 1: 创建 web 端类型（镜像后端 builder）**

Create `apps/web/src/app/(print)/plan-sheet/[id]/types.ts`:

```ts
// 镜像 apps/server/.../plan-export-rows.builder.ts 的导出类型(无共享包, 故复制小接口)。
export interface ExportMajor {
  majorCode: string | null;
  majorName: string;
  planCount: number | null;
  planByYear: Record<number, number | null>;
  minScoreByYear: Record<number, number | null>;
  suppByYear: Record<number, { count: number; rounds: number } | null>;
  duration: string | null;
  tuition: number | null;
  planNotes: string | null;
}

export interface ExportGroup {
  sequence: number;
  gradient: string;
  gradientLabel: string;
  universityName: string;
  universityCode: string | null;
  schoolNature: string | null;
  schoolTags: string | null;
  city: string | null;
  universityRank: number | null;
  groupCode: string | null;
  groupPlanCount: number | null;
  fallback: boolean;
  majors: ExportMajor[];
}

export interface ExportSheet {
  student: { name: string; examTypeLabel: string; score: number | null; rank: number | null };
  plan: { id: number; name: string; year: number; batchName: string | null; version: number | null };
  years: number[];
  groups: ExportGroup[];
}
```

- [ ] **Step 2: plan-api 加 getExportRows**

在 `apps/web/src/services/plan-api.ts` 的 `planApi` 对象里加一个方法（放在 `exportExcel` 附近）。`api.get` 已解包成 data：

```ts
  getExportRows(planId: number | string): Promise<any> {
    return api.get(`/plans/${planId}/export-rows`) as any;
  },
```

- [ ] **Step 3: 类型检查前端**

Run: `pnpm --filter web build`
Expected: 构建成功（本步只加了未被引用的类型文件 + 一个 api 方法，应无报错）。

- [ ] **Step 4: 提交**

```bash
git add "apps/web/src/app/(print)/plan-sheet/[id]/types.ts" apps/web/src/services/plan-api.ts
git commit -m "feat(export): 前端 getExportRows + ExportSheet 类型"
```

---

## Task 4: A3 表组件 ParentExplainTable（含组件测）

**Files:**
- Create: `apps/web/src/app/(print)/plan-sheet/[id]/ParentExplainTable.tsx`
- Create: `apps/web/src/app/(print)/plan-sheet/[id]/ParentExplainTable.module.css`
- Test: `apps/web/src/app/(print)/plan-sheet/[id]/__tests__/ParentExplainTable.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `apps/web/src/app/(print)/plan-sheet/[id]/__tests__/ParentExplainTable.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import ParentExplainTable from '../ParentExplainTable';
import type { ExportSheet } from '../types';

const sheet: ExportSheet = {
  student: { name: '张三', examTypeLabel: '物理类', score: 670, rank: 1000 },
  plan: { id: 7, name: 'v1 方案', year: 2026, batchName: '本科批', version: 1 },
  years: [2023, 2024, 2025],
  groups: [
    {
      sequence: 1,
      gradient: 'WEN',
      gradientLabel: '稳',
      universityName: '电子科技大学',
      universityCode: '0612',
      schoolNature: '公办',
      schoolTags: '985/211/双一流',
      city: '成都',
      universityRank: 33,
      groupCode: '01',
      groupPlanCount: 88,
      fallback: false,
      majors: [
        {
          majorCode: '0809',
          majorName: '计算机类',
          planCount: 20,
          planByYear: { 2023: null, 2024: 18, 2025: 20 },
          minScoreByYear: { 2023: null, 2024: 662, 2025: 668 },
          suppByYear: { 2023: null, 2024: null, 2025: { count: 3, rounds: 2 } },
          duration: '四年',
          tuition: 4900,
          planNotes: '色盲色弱不录取',
        },
        {
          majorCode: '0807',
          majorName: '电子信息类',
          planCount: 30,
          planByYear: { 2023: null, 2024: 28, 2025: 30 },
          minScoreByYear: { 2023: null, 2024: 658, 2025: 665 },
          suppByYear: { 2023: null, 2024: null, 2025: null },
          duration: '四年',
          tuition: 4900,
          planNotes: '',
        },
      ],
    },
  ],
};

describe('ParentExplainTable', () => {
  it('院校名称合并一次, 候选专业各占一行', () => {
    render(<ParentExplainTable sheet={sheet} />);
    // 院校名称在合并单元格里只出现一次
    expect(screen.getAllByText('电子科技大学')).toHaveLength(1);
    // 两个候选专业都渲染
    expect(screen.getByText('计算机类')).toBeInTheDocument();
    expect(screen.getByText('电子信息类')).toBeInTheDocument();
    // 城市 / 排名透出
    expect(screen.getByText('成都')).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();
    // 组招生人数
    expect(screen.getByText(/组招\s*88\s*人/)).toBeInTheDocument();
  });

  it('缺数据年份显示「—」, 有征集年份显示征集尾注', () => {
    render(<ParentExplainTable sheet={sheet} />);
    // 2023 计划/最低分缺失 → 至少出现「—」
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // 征集尾注
    expect(screen.getByText(/征\s*2\s*轮/)).toBeInTheDocument();
  });

  it('梯度标签渲染', () => {
    render(<ParentExplainTable sheet={sheet} />);
    expect(screen.getByText('稳')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter web test ParentExplainTable`
Expected: FAIL —— `Cannot find module '../ParentExplainTable'`。

- [ ] **Step 3: 写组件实现**

Create `apps/web/src/app/(print)/plan-sheet/[id]/ParentExplainTable.tsx`:

```tsx
'use client';

import styles from './ParentExplainTable.module.css';
import type { ExportSheet, ExportMajor } from './types';

// 梯度中文 → CSS class(底色)
const GRADIENT_CLASS: Record<string, string> = { 冲: 'rush', 稳: 'stable', 保: 'safe' };

function dash(v: unknown) {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function YearPlanCell({ major, year }: { major: ExportMajor; year: number }) {
  const plan = major.planByYear[year];
  const supp = major.suppByYear[year];
  return (
    <>
      {plan === null || plan === undefined ? '—' : plan}
      {supp ? <span className={styles.supp}>（征{supp.rounds}轮·{supp.count}人）</span> : null}
    </>
  );
}

export default function ParentExplainTable({ sheet }: { sheet: ExportSheet }) {
  const { years } = sheet;
  return (
    <div className={styles.sheet}>
      <h1 className={styles.title}>
        {sheet.student.name} · {sheet.plan.batchName ?? ''}志愿方案（家长版）
      </h1>
      <div className={styles.meta}>
        {sheet.student.examTypeLabel} · {dash(sheet.student.score)} 分 · 位次 {dash(sheet.student.rank)} · {sheet.plan.name}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>顺位</th>
            <th>梯度</th>
            <th>院校名称</th>
            <th>院校代码</th>
            <th>办学性质</th>
            <th>学校标签</th>
            <th>所在城市</th>
            <th>院校排名</th>
            <th>专业组</th>
            <th>专业代码</th>
            <th>专业名称</th>
            <th>26计划</th>
            {years.map((y) => (
              <th key={`ph${y}`}>{String(y).slice(2)}计划</th>
            ))}
            {years.map((y) => (
              <th key={`sh${y}`}>{String(y).slice(2)}最低分</th>
            ))}
            <th>学制</th>
            <th>学费</th>
            <th className={styles.notesHead}>专业备注</th>
          </tr>
        </thead>
        <tbody>
          {sheet.groups.map((g, gi) => {
            const tone = GRADIENT_CLASS[g.gradientLabel] ?? 'rush';
            return g.majors.map((m, mi) => (
              <tr key={`${gi}-${mi}`} className={styles[tone]}>
                {mi === 0 && (
                  <>
                    <td rowSpan={g.majors.length} className={styles.merge}>
                      {String(g.sequence).padStart(2, '0')}
                    </td>
                    <td rowSpan={g.majors.length} className={`${styles.merge} ${styles.gradeCell}`}>
                      {g.gradientLabel}
                    </td>
                    <td rowSpan={g.majors.length} className={`${styles.merge} ${styles.uniName}`}>
                      {dash(g.universityName)}
                      {g.fallback ? <span className={styles.fallback}>·快照</span> : null}
                    </td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.universityCode)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.schoolNature)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.schoolTags)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.city)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.universityRank)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>
                      {dash(g.groupCode)}
                      <div className={styles.groupPlan}>组招 {dash(g.groupPlanCount)} 人</div>
                    </td>
                  </>
                )}
                <td>{dash(m.majorCode)}</td>
                <td className={styles.majorName}>{dash(m.majorName)}</td>
                <td>{dash(m.planCount)}</td>
                {years.map((y) => (
                  <td key={`p${y}`}>
                    <YearPlanCell major={m} year={y} />
                  </td>
                ))}
                {years.map((y) => (
                  <td key={`s${y}`}>{dash(m.minScoreByYear[y])}</td>
                ))}
                <td>{dash(m.duration)}</td>
                <td>{dash(m.tuition)}</td>
                <td className={styles.notes}>{dash(m.planNotes)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 写 CSS（A3 打印样式）**

Create `apps/web/src/app/(print)/plan-sheet/[id]/ParentExplainTable.module.css`:

```css
.sheet {
  background: #fff;
  color: #1a1a19;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}

.meta {
  font-size: 11px;
  color: #4d4c48;
  margin-bottom: 8px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 9px;
}

.table th,
.table td {
  border: 0.5px solid #b8b6ad;
  padding: 2px 3px;
  text-align: center;
  vertical-align: middle;
  word-break: break-all;
}

.table thead th {
  background: #e8e6dc;
  font-weight: 600;
  white-space: nowrap;
}

.merge {
  vertical-align: middle;
}

.uniName {
  font-weight: 600;
  word-break: break-all;
}

.gradeCell {
  font-weight: 700;
}

.majorName {
  text-align: left;
}

.groupPlan {
  font-size: 8px;
  color: #6b6962;
  margin-top: 1px;
}

.supp {
  color: #b8860b;
  font-size: 8px;
}

.fallback {
  color: #c53030;
  font-size: 8px;
}

/* 专业备注: 弹性宽 + 自动换行(可能很长) */
.notesHead {
  width: 18%;
}
.notes {
  text-align: left;
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
}

/* 梯度底色: 冲=橙 / 稳=绿 / 保=蓝 (与服务端 GRADIENT_COLORS 同色系) */
.rush td { background: #fdf2e9; }
.stable td { background: #eafaf3; }
.safe td { background: #eef4fb; }
.rush td.merge,
.stable td.merge,
.safe td.merge { background: inherit; }

@media print {
  .table { font-size: 8px; }
  .rush td, .stable td, .safe td {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .table thead { display: table-header-group; }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter web test ParentExplainTable`
Expected: PASS（3 个用例全绿）。

- [ ] **Step 6: 提交**

```bash
git add "apps/web/src/app/(print)/plan-sheet/[id]/ParentExplainTable.tsx" "apps/web/src/app/(print)/plan-sheet/[id]/ParentExplainTable.module.css" "apps/web/src/app/(print)/plan-sheet/[id]/__tests__/ParentExplainTable.test.tsx"
git commit -m "feat(export): 家长版 A3 表组件 ParentExplainTable + 组件测"
```

---

## Task 5: 打印页路由（拉数 + 打印按钮 + @page A3）

**Files:**
- Create: `apps/web/src/app/(print)/plan-sheet/[id]/page.tsx`

- [ ] **Step 1: 写打印页**

Create `apps/web/src/app/(print)/plan-sheet/[id]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { planApi } from '@/services/plan-api';
import ParentExplainTable from './ParentExplainTable';
import type { ExportSheet } from './types';

// @page 必须是全局 at-rule(CSS Module 不 scope 它), 故直接注入 <style>。
const PRINT_CSS = `
@page { size: A3 landscape; margin: 8mm; }
@media print {
  .no-print { display: none !important; }
  html, body { background: #fff !important; }
}
`;

export default function PlanSheetPrintPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['plan-export-rows', params.id],
    queryFn: () => planApi.getExportRows(params.id) as Promise<ExportSheet>,
    enabled: !!params.id,
  });

  return (
    <div style={{ padding: 16, background: '#fff', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          打印 / 另存为 PDF（A3 横版）
        </Button>
        <span style={{ fontSize: 12, color: '#6b6962' }}>
          打印对话框里选 A3、横向；可直接「另存为 PDF」发家长。
        </span>
      </div>

      {isLoading ? (
        <Spin />
      ) : isError ? (
        <Empty description="加载失败，请确认已登录且有权访问该方案" />
      ) : !data || data.groups.length === 0 ? (
        <Empty description="该方案暂无志愿" />
      ) : (
        <ParentExplainTable sheet={data} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 构建前端，确认路由编译**

Run: `pnpm --filter web build`
Expected: 构建成功，输出里出现 `/plan-sheet/[id]` 路由。

- [ ] **Step 3: 提交**

```bash
git add "apps/web/src/app/(print)/plan-sheet/[id]/page.tsx"
git commit -m "feat(export): 家长版数据表 A3 打印页路由"
```

---

## Task 6: 方案详情页入口按钮

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx:686-704`（`moreMenuItems` 定义处）

- [ ] **Step 1: 在 moreMenuItems 顶部加「家长版数据表」入口**

把 `moreMenuItems` 数组改为（在 `export`/`导出 PDF` 项之前插入新项；新标签打开打印页，`planId` 已是本组件内变量）：

```tsx
  const moreMenuItems = [
    {
      key: 'parent-sheet',
      icon: <ExportOutlined />,
      label: '家长版数据表',
      onClick: () => window.open(`/plan-sheet/${planId}`, '_blank', 'noopener'),
    },
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '导出 PDF',
      onClick: () => exportMutation.mutate(),
    },
    ...(status === 'DRAFT'
      ? [
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: '删除草稿',
            danger: true,
            onClick: confirmDeletePlan,
          },
        ]
      : []),
  ];
```

> `ExportOutlined`、`planId` 均已在文件内（见 import 与 `const planId = params.id`），无需新增导入。

- [ ] **Step 2: 构建前端确认无报错**

Run: `pnpm --filter web build`
Expected: 构建成功。

- [ ] **Step 3: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx"
git commit -m "feat(export): 方案详情页加家长版数据表入口"
```

---

## Task 7: 端到端人工验证（A3 打印预览 + 数字核对）

**Files:** 无（验证为主）

- [ ] **Step 1: 起本地服务**

Run（两个终端）：`pnpm --filter server start:dev` 与 `pnpm --filter web dev`
Expected: 后端 :3003 / 前端 :3004（或项目实际端口）正常启动。

- [ ] **Step 2: 端点冒烟**

用某个有志愿条目的演示方案 id（如 [[teacher_flow_e2e_test_data]] 方案 26），登录后在浏览器开 `/plan-sheet/26`。
Expected: 表格渲染，专业组合并、组内多候选专业成行、城市/排名/学制/备注有值。

- [ ] **Step 3: 数字一致性核对**

对同一方案，对照老师生成页该组的多年最低分/计划/征集。
Expected: A3 表数字与生成页一致（富化复用同管线）；个别走快照兜底的组带「·快照」标记且部分列为「—」，符合预期。

- [ ] **Step 4: A3 打印预览**

点「打印 / 另存为 PDF」→ Chrome 打印对话框选 A3、横向。
Expected: 横版铺满 A3；专业备注长文本自动换行；表头跨页重复；梯度底色打印可见。

- [ ] **Step 5: 入口验证**

方案详情页「更多」菜单 →「家长版数据表」→ 新标签打开上述页面。
Expected: 正常跳转。

- [ ] **Step 6（按需）：部署**

参照 [[deploy_workflow]]：`pnpm --filter server build && pnpm --filter web build` → `python deploy_auto.py --skip-build --skip-tests`。本功能不涉及迁移/Redis/数据回填，无额外补充动作。

---

## Self-Review（plan vs spec）

**Spec 覆盖：**
- 共享富化端点 → Task 1+2 ✅
- A3 HTML 打印页（一期）→ Task 4+5 ✅
- 复用候选服务富化（方案 A）+ 快照兜底 → Task 2（getCandidateGroups 参数）+ Task 1（buildFallbackGroup）✅
- 列：顺位/梯度 + 院校块 + 26计划 + 23/24/25 计划(征集尾注) + 23/24/25 最低分 + 学制/学费/备注 → Task 4 表头与单元格 ✅
- 23/24 空填「—」整列保留 → `dash()` + 表头固定渲染 `years` ✅
- 入口按钮 → Task 6 ✅
- 二期 Excel → 本计划不含（设计文档已标二期），无遗漏。

**占位扫描：** 无 TODO/TBD；每个改码步骤均含完整代码。

**类型一致性：** `ExportSheet/ExportGroup/ExportMajor`、`buildExportSheet`、`getExportRows`、`getExportRows`(web)、`planByYear/minScoreByYear/suppByYear`、`gradientLabel`、`groupPlanCount` 在后端 builder、service、web types、组件间命名一致。`suppByYear[y] = {count, rounds} | null` 在 builder 产出与组件消费一致。
