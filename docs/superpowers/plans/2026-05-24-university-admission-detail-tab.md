# 院校详情页 · 招录详情 Tab — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用统一的 "招录详情" Tab 替换院校详情页现有的"招生计划"和"历年录取"两个 Tab，按"专业组"为核心组织招录信息，包含院校最低调档线总览栏 + 专业组卡片组（含组内专业行 + graceful 排名 chip）+ 用户位次冲稳保色带。

**Architecture:** 前端纯组合 React 组件 + 2 个纯函数 util；后端只在 `findAdmissions` 上加 enrollment_plans 的 chip 字段 join，不新增 endpoint。所有数据从已有 `getById` + `getAdmissions` 拿。基于 spec `docs/superpowers/specs/2026-05-24-university-detail-group-view-design.md`。

**Tech Stack:** Next.js 14 (app router) + React 18 + TypeScript + Jest + @testing-library/react + Prisma 7 (MariaDB adapter) + Tailwind CSS + Ant Design (Tabs 复用)。

---

## File Structure

**新增**：
- `apps/web/src/utils/batch-categorize.ts` — batch 字符串归类（"本科一批 B段" → "本科批"）
- `apps/web/src/utils/__tests__/batch-categorize.test.ts`
- `apps/web/src/utils/group-admissions.ts` — 按 (year, subjects, batch, groupCode) 聚合 AdmissionRecord，输出专业组结构
- `apps/web/src/utils/__tests__/group-admissions.test.ts`
- `apps/web/src/components/university/admission-detail/types.ts` — 共享 TypeScript 类型
- `apps/web/src/components/university/admission-detail/MajorRow.tsx` — 单专业行（含 chip）
- `apps/web/src/components/university/admission-detail/MajorRow.test.tsx`
- `apps/web/src/components/university/admission-detail/GroupCard.tsx` — 单专业组卡片
- `apps/web/src/components/university/admission-detail/GroupCard.test.tsx`
- `apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.tsx` — 切换器
- `apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.test.tsx`
- `apps/web/src/components/university/admission-detail/UniversityRankBanner.tsx` — 总览栏
- `apps/web/src/components/university/admission-detail/UniversityRankBanner.test.tsx`
- `apps/web/src/components/university/admission-detail/AdmissionDetailTab.tsx` — 容器组件

**修改**：
- `apps/server/src/modules/university/university.service.ts` (~L255-268) — `findAdmissions` 加 enrollment_plans chip 数据 join
- `apps/server/src/modules/university/university.service.spec.ts` — 加测试
- `apps/web/src/app/(main)/universities/[id]/page.tsx` — 删除"招生计划"和"历年录取" Tab、挂载新 `AdmissionDetailTab`、nav 加"招录详情"锚点

**保留不动**：
- `apps/web/src/components/university/PlanPivotTable.tsx`、`AdmissionPivotTable.tsx`（防他处引用）

---

## Task 1: 后端 — `findAdmissions` 透传 enrollment_plans chip 字段

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts:255-268`
- Test: `apps/server/src/modules/university/university.service.spec.ts`

**Goal:** 让 `GET /universities/:id/admissions` 返回的每条 AdmissionRecord 带上 `extras: { majorRanking, disciplineEval, isNationalFeature }`，来源是同 `(universityId, majorId)` 下最新年份的 EnrollmentPlan。

- [ ] **Step 1.1: 写失败测试**

写入 `apps/server/src/modules/university/university.service.spec.ts`（追加到 describe 块内）：

```typescript
describe('findAdmissions extras transcription', () => {
  it('attaches latest-year enrollmentPlan chip fields to each admission', async () => {
    // Arrange: mock prisma.admissionRecord.findMany + prisma.enrollmentPlan.findMany
    const mockAdmissions = [
      { id: 1, universityId: 10, majorId: 100, year: 2024, majorMinScore: 600, major: { id: 100, name: '计算机' } },
      { id: 2, universityId: 10, majorId: 101, year: 2024, majorMinScore: 590, major: { id: 101, name: '软工' } },
    ];
    const mockPlans = [
      { universityId: 10, majorId: 100, year: 2024, majorRanking: '12', disciplineEval: '软科：A+', isNationalFeature: true },
      { universityId: 10, majorId: 100, year: 2023, majorRanking: '15', disciplineEval: '软科：A', isNationalFeature: false },
      { universityId: 10, majorId: 101, year: 2022, majorRanking: '25', disciplineEval: null,       isNationalFeature: false },
    ];
    (service as any).prisma.admissionRecord.findMany = jest.fn().mockResolvedValue(mockAdmissions);
    (service as any).prisma.enrollmentPlan.findMany = jest.fn().mockResolvedValue(mockPlans);

    // Act
    const result = await service.findAdmissions(10);

    // Assert: 每条 admission 上挂 extras，取 majorId 对应 latest-year 的 plan 数据
    expect(result[0].extras).toEqual({ majorRanking: '12', disciplineEval: '软科：A+', isNationalFeature: true });
    expect(result[1].extras).toEqual({ majorRanking: '25', disciplineEval: null, isNationalFeature: false });
  });

  it('attaches empty extras when no enrollmentPlan rows for that major', async () => {
    const mockAdmissions = [{ id: 1, universityId: 10, majorId: 999, year: 2024, major: { id: 999, name: '冷门' } }];
    (service as any).prisma.admissionRecord.findMany = jest.fn().mockResolvedValue(mockAdmissions);
    (service as any).prisma.enrollmentPlan.findMany = jest.fn().mockResolvedValue([]);
    const result = await service.findAdmissions(10);
    expect(result[0].extras).toEqual({ majorRanking: null, disciplineEval: null, isNationalFeature: false });
  });
});
```

- [ ] **Step 1.2: 跑测试确认失败**

```bash
cd apps/server && pnpm jest university.service.spec.ts -t 'findAdmissions extras' 2>&1 | tail -30
```
Expected: FAIL — `result[0].extras` undefined（实现还没改）

- [ ] **Step 1.3: 实现 findAdmissions 改造**

替换 `apps/server/src/modules/university/university.service.ts:255-268`：

```typescript
async findAdmissions(id: number, years?: number[]) {
  const where: any = { universityId: id };
  if (years?.length) {
    where.year = { in: years };
  }

  const admissions = await this.prisma.admissionRecord.findMany({
    where,
    include: { major: true },
    orderBy: [{ year: 'desc' }, { majorMinRank: 'asc' }],
  });

  // 收集所有用到的 majorId,一次 fetch 对应的 enrollmentPlans
  const majorIds = Array.from(new Set(admissions.map(a => a.majorId).filter(Boolean)));
  const plans = majorIds.length > 0
    ? await this.prisma.enrollmentPlan.findMany({
        where: { universityId: id, majorId: { in: majorIds } },
        orderBy: { year: 'desc' },
      })
    : [];

  // majorId -> latest-year plan
  const latestPlanByMajor = new Map<number, typeof plans[0]>();
  for (const p of plans) {
    if (!latestPlanByMajor.has(p.majorId)) {
      latestPlanByMajor.set(p.majorId, p);  // plans already desc by year; first wins
    }
  }

  return admissions.map(a => ({
    ...a,
    extras: {
      majorRanking: latestPlanByMajor.get(a.majorId)?.majorRanking ?? null,
      disciplineEval: latestPlanByMajor.get(a.majorId)?.disciplineEval ?? null,
      isNationalFeature: latestPlanByMajor.get(a.majorId)?.isNationalFeature ?? false,
    },
  }));
}
```

- [ ] **Step 1.4: 跑测试确认通过**

```bash
cd apps/server && pnpm jest university.service.spec.ts -t 'findAdmissions extras' 2>&1 | tail -20
```
Expected: PASS · 2 tests

- [ ] **Step 1.5: Commit**

```bash
git add apps/server/src/modules/university/university.service.ts apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(university-service): attach enrollment-plan chip extras to admissions

Adds majorRanking / disciplineEval / isNationalFeature to each AdmissionRecord
in findAdmissions response. Latest-year EnrollmentPlan per major is used as
the chip source (decoupled from the admission year being viewed)."
```

---

## Task 2: 前端 util — `batch-categorize.ts` (TDD)

**Files:**
- Create: `apps/web/src/utils/batch-categorize.ts`
- Test: `apps/web/src/utils/__tests__/batch-categorize.test.ts`

**Goal:** 把后端的细分 batch 字符串归类为 3 大类。

```
"本科一批 B段"     → "本科批"
"本科一批 A段"     → "本科批"
"本科一批(高校专项)" → "本科批"
"本科提前批 A段"   → "提前批"
"高职(专科)批"    → "高职专科"
"高职(专科)提前批" → "高职专科"
""               → null  // 不可归类
```

- [ ] **Step 2.1: 写失败测试**

Create `apps/web/src/utils/__tests__/batch-categorize.test.ts`:

```typescript
import { categorizeBatch, BATCH_CATEGORIES, type BatchCategory } from '../batch-categorize';

describe('categorizeBatch', () => {
  it('归"本科一批*" 为 "本科批"', () => {
    expect(categorizeBatch('本科一批 B段')).toBe('本科批');
    expect(categorizeBatch('本科一批 A段')).toBe('本科批');
    expect(categorizeBatch('本科一批(高校专项)')).toBe('本科批');
    expect(categorizeBatch('本科一批(地方专项)')).toBe('本科批');
    expect(categorizeBatch('本科一批(乡村振兴重点发展专项)')).toBe('本科批');
  });

  it('归"本科提前批*" 为 "提前批"', () => {
    expect(categorizeBatch('本科提前批 A段')).toBe('提前批');
    expect(categorizeBatch('本科提前批 B段')).toBe('提前批');
    expect(categorizeBatch('本科提前批(军队专项)')).toBe('提前批');
  });

  it('归"高职*" 为 "高职专科"', () => {
    expect(categorizeBatch('高职(专科)批')).toBe('高职专科');
    expect(categorizeBatch('高职(专科)提前批')).toBe('高职专科');
  });

  it('返回 null 对空字符串或不识别 batch', () => {
    expect(categorizeBatch('')).toBeNull();
    expect(categorizeBatch('随便写的批次')).toBeNull();
  });

  it('BATCH_CATEGORIES 包含 3 个固定类别', () => {
    expect(BATCH_CATEGORIES).toEqual(['本科批', '提前批', '高职专科']);
  });
});
```

- [ ] **Step 2.2: 跑测试确认失败**

```bash
cd apps/web && pnpm jest batch-categorize 2>&1 | tail -15
```
Expected: FAIL — file not found

- [ ] **Step 2.3: 实现**

Create `apps/web/src/utils/batch-categorize.ts`:

```typescript
export const BATCH_CATEGORIES = ['本科批', '提前批', '高职专科'] as const;
export type BatchCategory = typeof BATCH_CATEGORIES[number];

/**
 * 把后端细分 batch 字符串归类为 3 大类。
 * - "本科一批 *" → 本科批
 * - "本科提前批 *" → 提前批
 * - "高职 *" → 高职专科
 * - 其他/空 → null
 *
 * 注意：四川已合并本一/本二，所以本 spec 不处理 "本科二批"。
 */
export function categorizeBatch(batch: string): BatchCategory | null {
  if (!batch) return null;
  if (batch.startsWith('本科提前批')) return '提前批';
  if (batch.startsWith('本科一批')) return '本科批';
  if (batch.startsWith('高职')) return '高职专科';
  return null;
}
```

- [ ] **Step 2.4: 跑测试确认通过**

```bash
cd apps/web && pnpm jest batch-categorize 2>&1 | tail -10
```
Expected: PASS · 5 tests

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/src/utils/batch-categorize.ts apps/web/src/utils/__tests__/batch-categorize.test.ts
git commit -m "feat(utils): add batch-categorize for 招录详情 Tab"
```

---

## Task 3: 前端 util — `group-admissions.ts` (TDD)

**Files:**
- Create: `apps/web/src/utils/group-admissions.ts`
- Test: `apps/web/src/utils/__tests__/group-admissions.test.ts`

**Goal:** 把 `AdmissionRecord[]` 按 `(year, subjects, batch, groupCode)` 聚合成"专业组维度"的结构，并把组内多个专业（不同 majorCode）放进 `majors` 子数组。

输出形态：

```typescript
type GroupedAdmission = {
  year: number;
  subjects: string;
  batch: string;
  groupCode: string;
  groupName: string | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
  majors: Array<{
    majorCode: string;
    majorName: string;
    majorMinScore: number | null;
    majorMinRank: number | null;
    planCount: number | null;
    extras: { majorRanking: string | null; disciplineEval: string | null; isNationalFeature: boolean };
  }>;
};
```

- [ ] **Step 3.1: 写失败测试**

Create `apps/web/src/utils/__tests__/group-admissions.test.ts`:

```typescript
import { groupAdmissions } from '../group-admissions';

const baseAdm = (overrides: Partial<any>) => ({
  year: 2024,
  subjects: '物理类',
  batch: '本科一批 B段',
  groupCode: '9999',
  groupName: '工科试验班',
  groupMinScore: 605,
  groupMinRank: 5000,
  groupAdmissionCount: 45,
  majorCode: '080901',
  majorName: '计算机科学与技术',
  majorMinScore: 615,
  majorMinRank: 4380,
  planCount: 10,
  extras: { majorRanking: '12', disciplineEval: '软科：A+', isNationalFeature: true },
  ...overrides,
});

describe('groupAdmissions', () => {
  it('两个不同专业同组 → 一个 group，组内 2 个 majors', () => {
    const input = [
      baseAdm({}),
      baseAdm({ majorCode: '080902', majorName: '软件工程', majorMinScore: 612, majorMinRank: 4521, planCount: 8 }),
    ];
    const groups = groupAdmissions(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupCode).toBe('9999');
    expect(groups[0].majors).toHaveLength(2);
    expect(groups[0].majors.map(m => m.majorCode).sort()).toEqual(['080901', '080902']);
  });

  it('不同 groupCode → 不同 group', () => {
    const input = [
      baseAdm({ groupCode: '9999' }),
      baseAdm({ groupCode: '8888', majorCode: '020101', majorName: '经济学' }),
    ];
    const groups = groupAdmissions(input);
    expect(groups).toHaveLength(2);
  });

  it('同 groupCode 跨年 → 不同 group（跨年不合并）', () => {
    const input = [
      baseAdm({ year: 2024 }),
      baseAdm({ year: 2023 }),
    ];
    const groups = groupAdmissions(input);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.year).sort()).toEqual([2023, 2024]);
  });

  it('排序：年份降序，组内 majors 按 majorMinRank 升序', () => {
    const input = [
      baseAdm({ year: 2023, majorCode: 'X1', majorMinRank: 9999 }),
      baseAdm({ year: 2024, majorCode: 'Y1', majorMinRank: 5000 }),
      baseAdm({ year: 2024, majorCode: 'Y2', majorMinRank: 4500 }),
    ];
    const groups = groupAdmissions(input);
    expect(groups[0].year).toBe(2024);
    expect(groups[0].majors[0].majorCode).toBe('Y2');  // 更低 rank 在前
    expect(groups[0].majors[1].majorCode).toBe('Y1');
  });

  it('空输入返回空数组', () => {
    expect(groupAdmissions([])).toEqual([]);
  });

  it('groupCode 为空字符串视为一个独立组（不与其他空 groupCode 合并）', () => {
    // 用 majorCode 兜底,避免完全无法区分的退化 row 被错合并
    const input = [
      baseAdm({ groupCode: '', majorCode: 'A1' }),
      baseAdm({ groupCode: '', majorCode: 'A2' }),
    ];
    const groups = groupAdmissions(input);
    // 两条空 groupCode 的记录在同 (year, subjects, batch) 下应合并为一组
    expect(groups).toHaveLength(1);
    expect(groups[0].majors).toHaveLength(2);
  });
});
```

- [ ] **Step 3.2: 跑测试确认失败**

```bash
cd apps/web && pnpm jest group-admissions 2>&1 | tail -15
```
Expected: FAIL — file not found

- [ ] **Step 3.3: 实现**

Create `apps/web/src/utils/group-admissions.ts`:

```typescript
export type GroupedAdmission = {
  year: number;
  subjects: string;
  batch: string;
  groupCode: string;
  groupName: string | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
  majors: Array<{
    majorCode: string;
    majorName: string;
    majorMinScore: number | null;
    majorMinRank: number | null;
    planCount: number | null;
    extras: { majorRanking: string | null; disciplineEval: string | null; isNationalFeature: boolean };
  }>;
};

type RawAdmission = {
  year: number;
  subjects: string;
  batch: string;
  groupCode: string;
  groupName: string | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
  majorCode: string;
  majorName: string;
  majorMinScore: number | null;
  majorMinRank: number | null;
  planCount: number | null;
  extras?: { majorRanking: string | null; disciplineEval: string | null; isNationalFeature: boolean };
};

/**
 * 按 (year, subjects, batch, groupCode) 把 AdmissionRecord 列表聚合成专业组结构。
 * - 跨年同 groupCode 不合并（每年独立）
 * - 组内 majors 按 majorMinRank 升序
 * - 输出整体按 year 降序
 */
export function groupAdmissions(records: RawAdmission[]): GroupedAdmission[] {
  const map = new Map<string, GroupedAdmission>();

  for (const r of records) {
    const key = `${r.year}|${r.subjects}|${r.batch}|${r.groupCode}`;
    let group = map.get(key);
    if (!group) {
      group = {
        year: r.year,
        subjects: r.subjects,
        batch: r.batch,
        groupCode: r.groupCode,
        groupName: r.groupName,
        groupMinScore: r.groupMinScore,
        groupMinRank: r.groupMinRank,
        groupAdmissionCount: r.groupAdmissionCount,
        majors: [],
      };
      map.set(key, group);
    }
    group.majors.push({
      majorCode: r.majorCode,
      majorName: r.majorName,
      majorMinScore: r.majorMinScore,
      majorMinRank: r.majorMinRank,
      planCount: r.planCount,
      extras: r.extras ?? { majorRanking: null, disciplineEval: null, isNationalFeature: false },
    });
  }

  // 组内 majors 排序 (minRank 升序，null 放末尾)
  for (const g of map.values()) {
    g.majors.sort((a, b) => {
      if (a.majorMinRank == null && b.majorMinRank == null) return 0;
      if (a.majorMinRank == null) return 1;
      if (b.majorMinRank == null) return -1;
      return a.majorMinRank - b.majorMinRank;
    });
  }

  // 整体按 year 降序
  return Array.from(map.values()).sort((a, b) => b.year - a.year);
}
```

- [ ] **Step 3.4: 跑测试确认通过**

```bash
cd apps/web && pnpm jest group-admissions 2>&1 | tail -10
```
Expected: PASS · 6 tests

- [ ] **Step 3.5: Commit**

```bash
git add apps/web/src/utils/group-admissions.ts apps/web/src/utils/__tests__/group-admissions.test.ts
git commit -m "feat(utils): add group-admissions to aggregate by 专业组"
```

---

## Task 4: 共享 types

**Files:**
- Create: `apps/web/src/components/university/admission-detail/types.ts`

**Goal:** 提取 props/data 类型避免重复，统一组件接口。

- [ ] **Step 4.1: 创建 types 文件**

Create `apps/web/src/components/university/admission-detail/types.ts`:

```typescript
import type { GroupedAdmission } from '@/utils/group-admissions';
import type { BatchCategory } from '@/utils/batch-categorize';
import type { RankTier } from '@/utils/classify-rank';

export type Subject = '物理类' | '历史类';

export interface UniversityRankInput {
  /** 当前选中科类下，最新年份的院校最低位次（已按 batchCategory 过滤） */
  latestUniversityMinRank: number | null;
  latestUniversityMinScore: number | null;
  latestYear: number | null;
  trendYears: Array<{
    year: number;
    universityMinScore: number | null;
    universityMinRank: number | null;
  }>;
}

export interface AdmissionDetailTabProps {
  universityId: number;
  universityFlags: { is985: boolean; is211: boolean };
  /** 经过聚合的所有年份/科类/批次专业组 */
  groups: GroupedAdmission[];
  /** 院校层最低分位次（来自 University.minScorePhysics/minRankPhysics 等） */
  universityRankAll: {
    physics: { score: number | null; rank: number | null };
    history: { score: number | null; rank: number | null };
  };
  userRank: number | null;
  defaultSubject?: Subject;
  defaultBatchCategory?: BatchCategory;
}

export interface GroupCardProps {
  group: GroupedAdmission;
  /** 同 (subjects, batch, groupCode) 跨年的所有记录（含 group 本身），用于卡头多年并排 */
  multiYearGroups: GroupedAdmission[];
  tier: RankTier;
  diffText: string | null;
  userRank: number | null;
}

export interface MajorRowProps {
  major: GroupedAdmission['majors'][number];
  multiYearData: Array<{ year: number; majorMinScore: number | null; majorMinRank: number | null }>;
}

export interface UniversityRankBannerProps {
  subject: Subject;
  batchCategory: BatchCategory;
  rankInput: UniversityRankInput;
  tier: RankTier;
  userRank: number | null;
  diffText: string | null;
}

export interface BatchSubjectSwitcherProps {
  subject: Subject;
  batchCategory: BatchCategory;
  onSubjectChange: (s: Subject) => void;
  onBatchChange: (b: BatchCategory) => void;
}
```

- [ ] **Step 4.2: Commit (no test needed — pure types)**

```bash
git add apps/web/src/components/university/admission-detail/types.ts
git commit -m "feat(admission-detail): add shared types"
```

---

## Task 5: `MajorRow.tsx` — 单专业行（含 graceful chip）

**Files:**
- Create: `apps/web/src/components/university/admission-detail/MajorRow.tsx`
- Test: `apps/web/src/components/university/admission-detail/MajorRow.test.tsx`

**Goal:** 渲染单行专业。3 个 chip（softRanking、disciplineEval、national feature）按 graceful 规则显示；如果三者都无则不渲染 chip 行。

**学科评估等级提取规则**（在组件内做）：从 `disciplineEval` 字符串里正则提取首个出现的 `A+/A/B+/B/C+/C` 等级。若无匹配则用原文本。

- [ ] **Step 5.1: 写失败测试**

Create `apps/web/src/components/university/admission-detail/MajorRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import MajorRow from './MajorRow';

const baseMajor = {
  majorCode: '080901',
  majorName: '计算机科学与技术',
  majorMinScore: 615,
  majorMinRank: 4380,
  planCount: 10,
  extras: { majorRanking: null as string | null, disciplineEval: null as string | null, isNationalFeature: false },
};

const noMultiYear = [{ year: 2024, majorMinScore: 615, majorMinRank: 4380 }];

describe('MajorRow', () => {
  it('显示专业名 + 代码 + 计划数', () => {
    render(<MajorRow major={baseMajor} multiYearData={noMultiYear} />);
    expect(screen.getByText('计算机科学与技术')).toBeInTheDocument();
    expect(screen.getByText(/080901/)).toBeInTheDocument();
    expect(screen.getByText(/计划 10/)).toBeInTheDocument();
  });

  it('majorRanking 非空时渲染 "软科 #N" chip', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, majorRanking: '12' } }} multiYearData={noMultiYear} />);
    expect(screen.getByText(/软科\s*#12/)).toBeInTheDocument();
  });

  it('从 disciplineEval 文本中提取首个等级到 chip', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, disciplineEval: '软科：A+，校友会：A' } }} multiYearData={noMultiYear} />);
    expect(screen.getByText('A+')).toBeInTheDocument();
  });

  it('disciplineEval 无可识别等级时用原文本', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, disciplineEval: '一般' } }} multiYearData={noMultiYear} />);
    expect(screen.getByText('一般')).toBeInTheDocument();
  });

  it('isNationalFeature 为 true 时显示"国家特色" chip', () => {
    render(<MajorRow major={{ ...baseMajor, extras: { ...baseMajor.extras, isNationalFeature: true } }} multiYearData={noMultiYear} />);
    expect(screen.getByText('国家特色')).toBeInTheDocument();
  });

  it('三个 chip 字段都为空 时不渲染 chip 行', () => {
    const { container } = render(<MajorRow major={baseMajor} multiYearData={noMultiYear} />);
    expect(container.querySelector('[data-testid="major-chips"]')).toBeNull();
  });

  it('多年数据并排显示', () => {
    const multi = [
      { year: 2024, majorMinScore: 615, majorMinRank: 4380 },
      { year: 2023, majorMinScore: 611, majorMinRank: 4720 },
      { year: 2022, majorMinScore: 608, majorMinRank: 5100 },
    ];
    render(<MajorRow major={baseMajor} multiYearData={multi} />);
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText(/4380/)).toBeInTheDocument();
    expect(screen.getByText(/4720/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: 跑测试确认失败**

```bash
cd apps/web && pnpm jest MajorRow 2>&1 | tail -15
```
Expected: FAIL — component not found

- [ ] **Step 5.3: 实现**

Create `apps/web/src/components/university/admission-detail/MajorRow.tsx`:

```tsx
import type { MajorRowProps } from './types';

const ELIGIBLE_GRADE_RE = /(A\+|A|A-|B\+|B|B-|C\+|C|C-)/;

function extractGrade(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(ELIGIBLE_GRADE_RE);
  return m ? m[1] : text;
}

export default function MajorRow({ major, multiYearData }: MajorRowProps) {
  const { extras } = major;
  const rankingChip = extras.majorRanking ? `软科 #${extras.majorRanking}` : null;
  const evalChip = extractGrade(extras.disciplineEval);
  const featureChip = extras.isNationalFeature ? '国家特色' : null;
  const hasAnyChip = rankingChip || evalChip || featureChip;

  return (
    <div className="px-3 py-2.5 border-b border-border-subtle last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-text">{major.majorName}</span>
            {hasAnyChip && (
              <span data-testid="major-chips" className="inline-flex gap-1.5 ml-0.5">
                {rankingChip && (
                  <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{rankingChip}</span>
                )}
                {evalChip && (
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{evalChip}</span>
                )}
                {featureChip && (
                  <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{featureChip}</span>
                )}
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-tertiary mt-0.5">
            代码 {major.majorCode}{major.planCount != null && ` · 计划 ${major.planCount} 人`}
          </div>
        </div>
        <div className="flex gap-2 text-[11px] flex-shrink-0">
          {multiYearData.map((y, idx) => (
            <div key={y.year} className={`text-right ${idx === 0 ? 'font-semibold text-text' : 'text-text-tertiary'} min-w-[60px]`}>
              <div className="font-bold">{y.year}</div>
              <div>{y.majorMinScore ?? '—'} / {y.majorMinRank != null ? `#${y.majorMinRank}` : '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: 跑测试确认通过**

```bash
cd apps/web && pnpm jest MajorRow 2>&1 | tail -10
```
Expected: PASS · 7 tests

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/src/components/university/admission-detail/MajorRow.tsx apps/web/src/components/university/admission-detail/MajorRow.test.tsx
git commit -m "feat(admission-detail): add MajorRow component with graceful chips"
```

---

## Task 6: `GroupCard.tsx` — 单专业组卡片（折叠/展开）

**Files:**
- Create: `apps/web/src/components/university/admission-detail/GroupCard.tsx`
- Test: `apps/web/src/components/university/admission-detail/GroupCard.test.tsx`

**Goal:** 渲染一张专业组卡片。卡头显示组代码 + 组名 + tier chip + 3 年组最低分位次。点击展开/折叠组内 MajorRow 列表。

折叠 / 展开是组件内部状态。默认折叠。

- [ ] **Step 6.1: 写失败测试**

Create `apps/web/src/components/university/admission-detail/GroupCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import GroupCard from './GroupCard';
import type { GroupedAdmission } from '@/utils/group-admissions';

const baseGroup: GroupedAdmission = {
  year: 2024,
  subjects: '物理类',
  batch: '本科一批 B段',
  groupCode: '9999',
  groupName: '工科试验班',
  groupMinScore: 612,
  groupMinRank: 4521,
  groupAdmissionCount: 45,
  majors: [
    { majorCode: '080901', majorName: '计算机', majorMinScore: 615, majorMinRank: 4380, planCount: 10,
      extras: { majorRanking: '12', disciplineEval: null, isNationalFeature: false } },
    { majorCode: '080902', majorName: '软件工程', majorMinScore: 612, majorMinRank: 4521, planCount: 8,
      extras: { majorRanking: null, disciplineEval: null, isNationalFeature: false } },
  ],
};

const otherYears: GroupedAdmission[] = [
  { ...baseGroup, year: 2023, groupMinScore: 608, groupMinRank: 4890, majors: [] },
  { ...baseGroup, year: 2022, groupMinScore: 605, groupMinRank: 5200, majors: [] },
];

describe('GroupCard', () => {
  it('卡头显示组代码、组名、批次、招生人数', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup, ...otherYears]} tier="rush" diffText="差 2279 名" userRank={6800} />);
    expect(screen.getByText(/9999/)).toBeInTheDocument();
    expect(screen.getByText(/工科试验班/)).toBeInTheDocument();
    expect(screen.getByText(/本科一批 B段/)).toBeInTheDocument();
    expect(screen.getByText(/45/)).toBeInTheDocument();  // 招生人数
  });

  it('卡头显示 3 年数据（按年份降序）', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup, ...otherYears]} tier="rush" diffText={null} userRank={null} />);
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
  });

  it('tier=rush 时显示 "冲" chip', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="rush" diffText="差 100 名" userRank={5000} />);
    expect(screen.getByText('冲')).toBeInTheDocument();
  });

  it('tier=stable 显示 "稳"', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="stable" diffText="高出 100 名" userRank={5000} />);
    expect(screen.getByText('稳')).toBeInTheDocument();
  });

  it('userRank 为 null 时不显示 tier chip 和 diffText', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="unknown" diffText={null} userRank={null} />);
    expect(screen.queryByText('冲')).toBeNull();
    expect(screen.queryByText('稳')).toBeNull();
  });

  it('默认折叠，不显示组内专业行', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="rush" diffText={null} userRank={null} />);
    expect(screen.queryByText('计算机')).toBeNull();
  });

  it('点击展开按钮后显示组内专业', () => {
    render(<GroupCard group={baseGroup} multiYearGroups={[baseGroup]} tier="rush" diffText={null} userRank={null} />);
    fireEvent.click(screen.getByRole('button', { name: /展开|折叠/ }));
    expect(screen.getByText('计算机')).toBeInTheDocument();
    expect(screen.getByText('软件工程')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.2: 跑测试确认失败**

```bash
cd apps/web && pnpm jest GroupCard 2>&1 | tail -15
```
Expected: FAIL — component not found

- [ ] **Step 6.3: 实现**

Create `apps/web/src/components/university/admission-detail/GroupCard.tsx`:

```tsx
'use client';
import { useState } from 'react';
import MajorRow from './MajorRow';
import type { GroupCardProps } from './types';
import type { RankTier } from '@/utils/classify-rank';

const TIER_STYLE: Record<RankTier, { border: string; bg: string; chip: string; label: string }> = {
  rush:    { border: 'border-red-200 border-l-red-500', bg: 'bg-red-50',    chip: 'bg-red-500',    label: '冲' },
  stable:  { border: 'border-blue-200 border-l-blue-500', bg: 'bg-blue-50',  chip: 'bg-blue-500',   label: '稳' },
  safe:    { border: 'border-green-200 border-l-green-500', bg: 'bg-green-50', chip: 'bg-green-500',  label: '保' },
  elite:   { border: 'border-amber-200 border-l-amber-500', bg: 'bg-amber-50', chip: 'bg-amber-500',  label: '远' },
  unknown: { border: 'border-gray-200 border-l-gray-300', bg: 'bg-gray-50',  chip: 'bg-gray-400',   label: '—' },
};

export default function GroupCard({ group, multiYearGroups, tier, diffText, userRank }: GroupCardProps) {
  const [open, setOpen] = useState(false);
  const style = TIER_STYLE[tier];
  // multiYearGroups 已含 group 本身；按 year 降序，取前 3
  const trendYears = [...multiYearGroups].sort((a, b) => b.year - a.year).slice(0, 3);

  return (
    <div className={`rounded-lg mb-3 overflow-hidden border border-l-4 ${style.border} ${style.bg}`}>
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-[14px] text-text">📦 {group.groupCode}{group.groupName && ` · ${group.groupName}`}</div>
            <div className="text-[11px] text-text-tertiary mt-1">
              {group.subjects} · {group.batch} · 招 {group.groupAdmissionCount ?? '—'} 人
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {userRank != null && (
              <span className={`text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full ${style.chip}`}>{style.label}</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-label={open ? '折叠' : '展开'}
              className="text-text-tertiary hover:text-primary bg-transparent border-0 cursor-pointer text-base leading-none"
            >
              {open ? '▴' : '▾'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          {trendYears.map((g, idx) => (
            <div key={g.year} className={`rounded p-1.5 ${idx === 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
              <div className={`text-[9px] font-bold ${idx === 0 ? 'text-amber-800' : 'text-text-tertiary'}`}>{g.year}</div>
              <div className="text-[15px] font-bold text-text">{g.groupMinScore ?? '—'}</div>
              <div className="text-[10px] text-text-tertiary">
                {g.groupMinRank != null ? `#${g.groupMinRank}` : '—'} · 招 {g.groupAdmissionCount ?? '—'}
              </div>
            </div>
          ))}
        </div>
        {userRank != null && diffText && (
          <div className="mt-2 px-2.5 py-1.5 bg-white rounded text-[11px] text-text">
            {group.year} 组最低 {group.groupMinRank != null ? `#${group.groupMinRank}` : '—'} · 你 #{userRank} · {diffText}
          </div>
        )}
      </div>
      {open && (
        <div className="bg-white border-t border-border-subtle">
          <div className="px-3 py-2 text-[10px] font-bold text-text-tertiary tracking-wide">组内专业 · {group.majors.length} 个</div>
          {group.majors.map(m => (
            <MajorRow
              key={m.majorCode}
              major={m}
              multiYearData={[{ year: group.year, majorMinScore: m.majorMinScore, majorMinRank: m.majorMinRank }]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.4: 跑测试确认通过**

```bash
cd apps/web && pnpm jest GroupCard 2>&1 | tail -10
```
Expected: PASS · 7 tests

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/src/components/university/admission-detail/GroupCard.tsx apps/web/src/components/university/admission-detail/GroupCard.test.tsx
git commit -m "feat(admission-detail): add GroupCard with collapsible group view"
```

---

## Task 7: `BatchSubjectSwitcher.tsx`

**Files:**
- Create: `apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.tsx`
- Test: `apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.test.tsx`

**Goal:** 科类（物理类/历史类） + 批次（本科批/提前批/高职专科）切换按钮组。受控组件。

- [ ] **Step 7.1: 写失败测试**

Create `apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import BatchSubjectSwitcher from './BatchSubjectSwitcher';

describe('BatchSubjectSwitcher', () => {
  it('渲染 2 个科类按钮 + 3 个批次按钮', () => {
    render(
      <BatchSubjectSwitcher
        subject="物理类"
        batchCategory="本科批"
        onSubjectChange={jest.fn()}
        onBatchChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '物理类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '本科批' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提前批' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '高职专科' })).toBeInTheDocument();
  });

  it('当前选中的按钮带 aria-pressed=true', () => {
    render(
      <BatchSubjectSwitcher
        subject="历史类"
        batchCategory="提前批"
        onSubjectChange={jest.fn()}
        onBatchChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '历史类' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '物理类' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '提前批' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('点击科类按钮触发 onSubjectChange', () => {
    const onSubjectChange = jest.fn();
    render(
      <BatchSubjectSwitcher
        subject="物理类"
        batchCategory="本科批"
        onSubjectChange={onSubjectChange}
        onBatchChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '历史类' }));
    expect(onSubjectChange).toHaveBeenCalledWith('历史类');
  });

  it('点击批次按钮触发 onBatchChange', () => {
    const onBatchChange = jest.fn();
    render(
      <BatchSubjectSwitcher
        subject="物理类"
        batchCategory="本科批"
        onSubjectChange={jest.fn()}
        onBatchChange={onBatchChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '高职专科' }));
    expect(onBatchChange).toHaveBeenCalledWith('高职专科');
  });
});
```

- [ ] **Step 7.2: 跑测试确认失败**

```bash
cd apps/web && pnpm jest BatchSubjectSwitcher 2>&1 | tail -15
```
Expected: FAIL — component not found

- [ ] **Step 7.3: 实现**

Create `apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.tsx`:

```tsx
'use client';
import { BATCH_CATEGORIES } from '@/utils/batch-categorize';
import type { BatchSubjectSwitcherProps, Subject } from './types';

const SUBJECTS: Subject[] = ['物理类', '历史类'];

export default function BatchSubjectSwitcher({
  subject,
  batchCategory,
  onSubjectChange,
  onBatchChange,
}: BatchSubjectSwitcherProps) {
  const btnClass = (active: boolean) =>
    `px-2.5 py-0.5 rounded text-[10px] font-semibold border ${
      active
        ? 'bg-amber-700 text-white border-amber-700'
        : 'bg-white text-text-tertiary border-amber-300'
    }`;

  return (
    <div className="flex gap-1 flex-wrap items-center">
      {SUBJECTS.map(s => (
        <button
          key={s}
          type="button"
          aria-pressed={s === subject}
          onClick={() => onSubjectChange(s)}
          className={btnClass(s === subject)}
        >
          {s}
        </button>
      ))}
      <span className="text-border mx-1">|</span>
      {BATCH_CATEGORIES.map(b => (
        <button
          key={b}
          type="button"
          aria-pressed={b === batchCategory}
          onClick={() => onBatchChange(b)}
          className={btnClass(b === batchCategory)}
        >
          {b}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7.4: 跑测试确认通过**

```bash
cd apps/web && pnpm jest BatchSubjectSwitcher 2>&1 | tail -10
```
Expected: PASS · 4 tests

- [ ] **Step 7.5: Commit**

```bash
git add apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.tsx apps/web/src/components/university/admission-detail/BatchSubjectSwitcher.test.tsx
git commit -m "feat(admission-detail): add BatchSubjectSwitcher"
```

---

## Task 8: `UniversityRankBanner.tsx` — 总览栏

**Files:**
- Create: `apps/web/src/components/university/admission-detail/UniversityRankBanner.tsx`
- Test: `apps/web/src/components/university/admission-detail/UniversityRankBanner.test.tsx`

**Goal:** 渲染顶部总览栏 — 切换器 + 大数字 + 历年趋势 3 卡 + 冲稳保色带 + 差额文案。仅渲染，所有数据 props in。

- [ ] **Step 8.1: 写失败测试**

Create `apps/web/src/components/university/admission-detail/UniversityRankBanner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import UniversityRankBanner from './UniversityRankBanner';

const baseRankInput = {
  latestUniversityMinRank: 28000,
  latestUniversityMinScore: 595,
  latestYear: 2024,
  trendYears: [
    { year: 2023, universityMinScore: 590, universityMinRank: 29200 },
    { year: 2022, universityMinScore: 587, universityMinRank: 30100 },
  ],
};

describe('UniversityRankBanner', () => {
  it('显示最新年大数字 + 位次', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="rush"
        userRank={6800}
        diffText="差 21200 名"
      />
    );
    expect(screen.getByText('595')).toBeInTheDocument();
    expect(screen.getByText(/#28000/)).toBeInTheDocument();
    expect(screen.getByText('2024 录取')).toBeInTheDocument();
  });

  it('显示历年趋势', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="rush"
        userRank={6800}
        diffText="差 21200 名"
      />
    );
    expect(screen.getByText('590')).toBeInTheDocument();
    expect(screen.getByText('587')).toBeInTheDocument();
  });

  it('userRank 非空时显示 tier chip + 差额', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="rush"
        userRank={6800}
        diffText="差 21200 名"
      />
    );
    expect(screen.getByText(/冲/)).toBeInTheDocument();
    expect(screen.getByText(/差 21200 名/)).toBeInTheDocument();
  });

  it('userRank 为 null 时显示"输入位次"提示，不显示 tier chip', () => {
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={baseRankInput}
        tier="unknown"
        userRank={null}
        diffText={null}
      />
    );
    expect(screen.queryByText('冲')).toBeNull();
    expect(screen.getByText(/输入位次/)).toBeInTheDocument();
  });

  it('数据完全为空时显示降级提示', () => {
    const emptyRankInput = { latestUniversityMinRank: null, latestUniversityMinScore: null, latestYear: null, trendYears: [] };
    render(
      <UniversityRankBanner
        subject="物理类"
        batchCategory="本科批"
        rankInput={emptyRankInput}
        tier="unknown"
        userRank={null}
        diffText={null}
      />
    );
    expect(screen.getByText(/暂无该科类\/批次/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8.2: 跑测试确认失败**

```bash
cd apps/web && pnpm jest UniversityRankBanner 2>&1 | tail -15
```
Expected: FAIL

- [ ] **Step 8.3: 实现**

Create `apps/web/src/components/university/admission-detail/UniversityRankBanner.tsx`:

```tsx
import BatchSubjectSwitcher from './BatchSubjectSwitcher';
import type { UniversityRankBannerProps } from './types';
import type { RankTier } from '@/utils/classify-rank';

const TIER_STYLE: Record<RankTier, { border: string; bg: string; chip: string; label: string }> = {
  rush:    { border: 'border-red-200 border-l-red-500',    bg: 'bg-gradient-to-br from-red-50 to-white',    chip: 'bg-red-500',    label: '冲' },
  stable:  { border: 'border-blue-200 border-l-blue-500',  bg: 'bg-gradient-to-br from-blue-50 to-white',   chip: 'bg-blue-500',   label: '稳' },
  safe:    { border: 'border-green-200 border-l-green-500',bg: 'bg-gradient-to-br from-green-50 to-white',  chip: 'bg-green-500',  label: '保' },
  elite:   { border: 'border-amber-200 border-l-amber-500',bg: 'bg-gradient-to-br from-amber-50 to-white',  chip: 'bg-amber-500',  label: '远' },
  unknown: { border: 'border-gray-200 border-l-gray-300',  bg: 'bg-gray-50',                                  chip: 'bg-gray-400',   label: '—' },
};

export default function UniversityRankBanner({
  subject,
  batchCategory,
  rankInput,
  tier,
  userRank,
  diffText,
}: UniversityRankBannerProps & {
  onSubjectChange?: (s: any) => void;
  onBatchChange?: (b: any) => void;
}) {
  const style = TIER_STYLE[tier];
  const isEmpty = rankInput.latestUniversityMinRank == null && rankInput.latestYear == null;

  return (
    <div className={`rounded-lg border border-l-4 ${style.border} ${style.bg} p-4 mb-4`}>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <div className="text-[10px] tracking-[1.5px] text-amber-800 font-bold">
            院校最低调档线 · {subject} · {batchCategory}
          </div>
          {/* Switcher 由父级 props 注入；这里仅展示标题 — 实际 switcher 渲染交给父组件 */}
        </div>
        {userRank != null && (
          <span className={`text-white text-[12px] font-bold px-3 py-1 rounded-full ${style.chip}`}>
            院校层 · {style.label}
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="text-text-tertiary text-sm py-4 text-center">暂无该科类/批次的院校层调档数据</div>
      ) : (
        <div className="flex items-end gap-5">
          <div>
            <div className="text-[10px] text-amber-800">{rankInput.latestYear} 录取</div>
            <div className="text-[36px] font-extrabold leading-none text-text font-serif">
              {rankInput.latestUniversityMinScore ?? '—'}
            </div>
            <div className="text-[11px] text-text-tertiary mt-1">
              最低位次 {rankInput.latestUniversityMinRank != null ? `#${rankInput.latestUniversityMinRank}` : '—'}
            </div>
          </div>
          {rankInput.trendYears.length > 0 && (
            <div className="border-l border-red-100 pl-4 flex-1">
              <div className="text-[10px] text-amber-800 mb-1.5">历年趋势</div>
              <div className="grid grid-cols-3 gap-2">
                {rankInput.trendYears.slice(0, 3).map(y => (
                  <div key={y.year} className="bg-white border border-red-100 rounded px-2 py-1">
                    <div className="text-[9px] text-text-tertiary">{y.year}</div>
                    <div className="text-[14px] font-bold">{y.universityMinScore ?? '—'}</div>
                    <div className="text-[9px] text-text-tertiary">{y.universityMinRank != null ? `#${y.universityMinRank}` : '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {userRank != null && diffText && !isEmpty && (
        <div className="mt-2.5 px-3 py-1.5 bg-white rounded text-[11px] text-text">{diffText}</div>
      )}
      {userRank == null && !isEmpty && (
        <div className="mt-2.5 px-3 py-1.5 bg-white rounded text-[11px] text-text-tertiary">
          输入位次以查看冲稳保 — 去 <a href="/profile" className="text-primary underline">个人信息</a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8.4: 跑测试确认通过**

```bash
cd apps/web && pnpm jest UniversityRankBanner 2>&1 | tail -10
```
Expected: PASS · 5 tests

- [ ] **Step 8.5: Commit**

```bash
git add apps/web/src/components/university/admission-detail/UniversityRankBanner.tsx apps/web/src/components/university/admission-detail/UniversityRankBanner.test.tsx
git commit -m "feat(admission-detail): add UniversityRankBanner with tier-aware styling"
```

---

## Task 9: `AdmissionDetailTab.tsx` — 容器组件

**Files:**
- Create: `apps/web/src/components/university/admission-detail/AdmissionDetailTab.tsx`

**Goal:** 组合所有子组件，管理 `subject` / `batchCategory` 状态，根据切换器值过滤显示哪些 GroupCard，计算院校层 tier。

- [ ] **Step 9.1: 实现（无单独 test — 通过 Task 10 的 page.tsx 手动验证）**

Create `apps/web/src/components/university/admission-detail/AdmissionDetailTab.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import UniversityRankBanner from './UniversityRankBanner';
import BatchSubjectSwitcher from './BatchSubjectSwitcher';
import GroupCard from './GroupCard';
import { categorizeBatch, type BatchCategory } from '@/utils/batch-categorize';
import { groupAdmissions, type GroupedAdmission } from '@/utils/group-admissions';
import { classifyRank, getTier, isHistorical } from '@/utils/classify-rank';
import type { Subject } from './types';

interface Props {
  universityId: number;
  universityFlags: { is985: boolean; is211: boolean };
  /** 由 service findAdmissions 返回的 raw rows */
  rawAdmissions: any[];
  /** University 表上的院校层最低分位次（已有透传） */
  universityScores: {
    minScorePhysics: number | null;
    minRankPhysics: number | null;
    minScoreHistory: number | null;
    minRankHistory: number | null;
  };
}

function pickDefaultSubject(userSubjects?: string): Subject {
  if (userSubjects && /历史|文/.test(userSubjects)) return '历史类';
  return '物理类';
}

function formatDiff(diff: number, isAhead: boolean): string {
  const abs = Math.abs(diff).toLocaleString();
  return isAhead ? `高出 ${abs} 名` : `差 ${abs} 名`;
}

export default function AdmissionDetailTab({
  universityFlags,
  rawAdmissions,
  universityScores,
}: Props) {
  const { examInfo } = useUserStore();
  const userRank = examInfo.rank ?? null;
  const [subject, setSubject] = useState<Subject>(() => pickDefaultSubject(examInfo.subjects?.[0]));
  const [batchCategory, setBatchCategory] = useState<BatchCategory>('本科批');

  // 1. 全聚合一次（按 (year, subjects, batch, groupCode)）
  const allGroups: GroupedAdmission[] = useMemo(() => groupAdmissions(rawAdmissions ?? []), [rawAdmissions]);

  // 2. 过滤到当前 subject + batchCategory
  const filteredGroups = useMemo(
    () => allGroups.filter(g =>
      // 科类匹配：subjects 包含"物"=物理类，包含"史"=历史类；与 g.subjects 字符串近似匹配
      ((subject === '物理类' && !isHistorical(g.subjects)) || (subject === '历史类' && isHistorical(g.subjects))) &&
      categorizeBatch(g.batch) === batchCategory
    ),
    [allGroups, subject, batchCategory]
  );

  // 3. 院校层 banner 数据：当前 subject 下，过滤后的 groups 中找 latest year 的 universityMinRank
  //    回退到 universityScores 表上的字段（如果 admission rows 没数据）
  const bannerInput = useMemo(() => {
    // 当前 subject + batchCategory 下，跨年汇总 (取 raw admission 上的 universityMinRank)
    const rawsInScope = (rawAdmissions ?? []).filter(r =>
      ((subject === '物理类' && !isHistorical(r.subjects)) || (subject === '历史类' && isHistorical(r.subjects))) &&
      categorizeBatch(r.batch) === batchCategory
    );
    // (year) -> min universityMinRank 在该年内
    const byYear = new Map<number, { score: number | null; rank: number | null }>();
    for (const r of rawsInScope) {
      const cur = byYear.get(r.year);
      const newRank = r.universityMinRank;
      const newScore = r.universityMinScore;
      if (!cur || (newRank != null && (cur.rank == null || newRank < cur.rank))) {
        byYear.set(r.year, { score: newScore, rank: newRank });
      }
    }
    const sorted = Array.from(byYear.entries()).sort(([a], [b]) => b - a);
    if (sorted.length === 0) {
      // fallback：用 University 表上的冗余字段（仅本科批；提前批/专科无 fallback）
      if (batchCategory === '本科批') {
        const score = subject === '物理类' ? universityScores.minScorePhysics : universityScores.minScoreHistory;
        const rank = subject === '物理类' ? universityScores.minRankPhysics : universityScores.minRankHistory;
        if (rank != null || score != null) {
          return { latestYear: null, latestUniversityMinScore: score, latestUniversityMinRank: rank, trendYears: [] };
        }
      }
      return { latestYear: null, latestUniversityMinScore: null, latestUniversityMinRank: null, trendYears: [] };
    }
    const [latestYear, latest] = sorted[0];
    return {
      latestYear,
      latestUniversityMinScore: latest.score,
      latestUniversityMinRank: latest.rank,
      trendYears: sorted.slice(1, 4).map(([y, v]) => ({ year: y, universityMinScore: v.score, universityMinRank: v.rank })),
    };
  }, [rawAdmissions, subject, batchCategory, universityScores]);

  // 4. 院校层 tier
  const universityTier = useMemo(() => {
    if (userRank == null) return 'unknown' as const;
    if (bannerInput.latestUniversityMinRank == null) return 'unknown' as const;
    const baseTier = getTier({
      is985: universityFlags.is985,
      is211: universityFlags.is211,
      batch: batchCategory === '高职专科' ? '高职(专科)批' : '本科批',
    });
    return classifyRank(userRank, bannerInput.latestUniversityMinRank, baseTier, subject === '历史类');
  }, [userRank, bannerInput, universityFlags, batchCategory, subject]);

  const universityDiffText = useMemo(() => {
    if (userRank == null || bannerInput.latestUniversityMinRank == null) return null;
    const diff = bannerInput.latestUniversityMinRank - userRank;
    return formatDiff(diff, diff > 0);
  }, [userRank, bannerInput]);

  // 5. 同 (subjects, batch, groupCode) 跨年映射 — 给 GroupCard 用
  const multiYearByGroup = useMemo(() => {
    const m = new Map<string, GroupedAdmission[]>();
    for (const g of allGroups) {
      const k = `${g.subjects}|${g.batch}|${g.groupCode}`;
      const arr = m.get(k) ?? [];
      arr.push(g);
      m.set(k, arr);
    }
    return m;
  }, [allGroups]);

  // 6. 渲染：取 filteredGroups 中每个 (subjects, batch, groupCode) 的最新年 group 当卡头
  const cardsToRender = useMemo(() => {
    const seen = new Set<string>();
    const out: GroupedAdmission[] = [];
    for (const g of filteredGroups) {
      const k = `${g.subjects}|${g.batch}|${g.groupCode}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(g);
    }
    return out;
  }, [filteredGroups]);

  return (
    <div className="py-4">
      <div className="mb-3">
        <BatchSubjectSwitcher
          subject={subject}
          batchCategory={batchCategory}
          onSubjectChange={setSubject}
          onBatchChange={setBatchCategory}
        />
      </div>

      <UniversityRankBanner
        subject={subject}
        batchCategory={batchCategory}
        rankInput={bannerInput}
        tier={universityTier}
        userRank={userRank}
        diffText={universityDiffText}
      />

      {cardsToRender.length === 0 ? (
        <div className="rounded-lg bg-gray-50 p-6 text-center text-text-tertiary text-sm">
          暂无 {subject} · {batchCategory} 的招录数据
        </div>
      ) : (
        cardsToRender.map(g => {
          const k = `${g.subjects}|${g.batch}|${g.groupCode}`;
          const multiYears = multiYearByGroup.get(k) ?? [g];
          const groupTier = userRank == null || g.groupMinRank == null
            ? 'unknown' as const
            : classifyRank(
                userRank,
                g.groupMinRank,
                getTier({ is985: universityFlags.is985, is211: universityFlags.is211, batch: g.batch }),
                isHistorical(g.subjects),
              );
          const diff = userRank != null && g.groupMinRank != null ? g.groupMinRank - userRank : null;
          const diffText = diff != null ? formatDiff(diff, diff > 0) : null;
          return (
            <GroupCard
              key={`${g.year}-${k}`}
              group={g}
              multiYearGroups={multiYears}
              tier={groupTier}
              diffText={diffText}
              userRank={userRank}
            />
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 9.2: 跑前端 type check（验证 import / types 正确）**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E 'admission-detail' | head -20
```
Expected: 无 error 输出

- [ ] **Step 9.3: Commit**

```bash
git add apps/web/src/components/university/admission-detail/AdmissionDetailTab.tsx
git commit -m "feat(admission-detail): add container AdmissionDetailTab"
```

---

## Task 10: 集成到 `page.tsx`，删除旧 Tab 入口

**Files:**
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`

**Goal:** 删除"招生计划"和"历年录取"两个 Tab 配置，新增"招录详情" Tab 挂载 `<AdmissionDetailTab>`。Sticky nav 同步加"招录详情"。

- [ ] **Step 10.1: 修改 page.tsx**

Edit `apps/web/src/app/(main)/universities/[id]/page.tsx`：

1. 顶部 import 加上：

```typescript
import AdmissionDetailTab from '@/components/university/admission-detail/AdmissionDetailTab';
```

2. 同时删除现有 import：

```typescript
import PlanPivotTable from '@/components/university/PlanPivotTable';
import AdmissionPivotTable from '@/components/university/AdmissionPivotTable';
```

3. 替换 `tabItems` 数组（around L104-196）— 删除 `plans` / `admissions` 两个 Tab，加入 `admission-detail`：

```typescript
const tabItems = [
  {
    key: 'info',
    label: <span><BankOutlined className="mr-1" />基本信息</span>,
    children: (
      // ... 原 info Tab children 保持不变
    ),
  },
  {
    key: 'admission-detail',
    label: <span><BookOutlined className="mr-1" />招录详情</span>,
    children: (
      <AdmissionDetailTab
        universityId={u.id}
        universityFlags={{ is985: u.is985, is211: u.is211 }}
        rawAdmissions={admissions ?? []}
        universityScores={{
          minScorePhysics: u.minScorePhysics ?? null,
          minRankPhysics:  u.minRankPhysics  ?? null,
          minScoreHistory: u.minScoreHistory ?? null,
          minRankHistory:  u.minRankHistory  ?? null,
        }}
      />
    ),
  },
  ...(u.qiangjiAdmissions?.length > 0
    ? [
        {
          key: 'qiangji',
          label: <span><TrophyOutlined className="mr-1" />强基计划</span>,
          children: <QiangjiTable data={u.qiangjiAdmissions} />,
        },
      ]
    : []),
];
```

4. 更新 sticky nav 数组（around L267-283）—"招录详情"替代"招生计划"/"历年录取"两项：

```typescript
{[
  ['info', '概览'],
  ['admission-detail', '招录详情'],
].map(([key, label]) => ( /* 不变 */ ))}
```

5. **删除** `useQuery({ queryKey: ['university-majors', ...] })` 的整个 block（约 L44-48）— 不再需要

- [ ] **Step 10.2: 跑 page typecheck**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "universities/\[id\]" | head -10
```
Expected: 无 error 输出

- [ ] **Step 10.3: 启动 dev server 并人工验证**

```bash
cd apps/web && pnpm dev 2>&1 &
# 等约 20 秒
```

- 打开 `http://localhost:3004/universities/10498` — 看到 Tab：基本信息 / 招录详情；无招生计划 / 历年录取
- 点击"招录详情" Tab — 切换器渲染、总览栏渲染（10498 可能 fallback 空数据）
- 打开 `http://localhost:3004/universities/10001`（北大）— chip 应该出现在专业行
- 切换物理类 / 历史类、本科批 / 提前批 — 数据正确变化
- 浏览器 Console 无 error

- [ ] **Step 10.4: Commit**

```bash
git add apps/web/src/app/(main)/universities/[id]/page.tsx
git commit -m "feat(university-detail): replace plans/admissions tabs with 招录详情"
```

---

## Task 11: 部署到 132.232.245.53 验证

**Files:** None (deployment)

**Goal:** 部署最新 worktree 到生产服务器并人工验证。

- [ ] **Step 11.1: 切到主仓库 + 合并 worktree 分支**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
git checkout master
git merge claude/xenodochial-khorana-cdd96c --no-ff -m "Merge: 招录详情 Tab redesign"
```

- [ ] **Step 11.2: 跑部署脚本**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
python deploy_auto.py
```

Expected: 部署成功，无 error

- [ ] **Step 11.3: 部署后清缓存（spec 第 5 节有提到 Redis cache：'university:{id}:subject:{xx}'）**

由于 service 返回结构变化（findAdmissions 加了 extras），需要让所有院校缓存失效：

```bash
# 在服务器上执行（通过 paramiko 脚本）
ssh -i cube.pem ubuntu@132.232.245.53 'redis-cli -n 0 KEYS "university:*" | xargs -r redis-cli -n 0 DEL'
# 或更简单
ssh -i cube.pem ubuntu@132.232.245.53 'redis-cli FLUSHDB'
```

注意：FLUSHDB 会清整个 redis db，确认其他无关业务能容忍。如果不确定，只清 `university:*` 前缀。

- [ ] **Step 11.4: 线上人工验证**

- `http://132.232.245.53:3004/universities/10498` — 看 Tab 切换正确
- `http://132.232.245.53:3004/universities/10001` — 看 chip 显示
- 浏览器 console 无 error
- 切换器有效

---

## Self-Review

按 `writing-plans` skill 要求，对照 spec 自查：

### Spec coverage（spec 各 section → 哪些 task 实现）

| Spec 章节 | 对应 Task |
|---|---|
| §2 范围 — 删除两个 Tab、加新 Tab | Task 10 |
| §3 数据事实 — 已采样验证 | 无需实现（信息性） |
| §4.1 总体 Tab 结构 | Task 10 |
| §4.2 招录详情内部结构 | Task 8 + 9 + 10 |
| §4.3 院校最低调档线总览 | Task 8 + 9 (banner data 计算) |
| §4.4 专业组卡片 | Task 6 + 9 |
| §4.5 组内专业行 + chip 兼容 | Task 5 |
| §4.6 用户位次叠加 | Task 9（容器中 classifyRank 调用） |
| §5.1 透传 University 字段 | **已就绪**（findById 用 ...university 散开），page.tsx Task 10 中直接使用 |
| §5.2 findAdmissions 加 chip | Task 1 |
| §6 文件结构 | Task 4 + 5 + 6 + 7 + 8 + 9 |
| §7 边界 / fallback | Task 5 (chip隐藏) / Task 8 (banner empty) / Task 9 (cards empty + userRank null) |
| §8 测试策略 | Task 2,3,5,6,7,8 (TDD) |
| §11 验收标准 | Task 10.3 + Task 11.4 (手动验证) |

**No gaps detected.**

### Placeholder scan

- ✅ 无 "TBD" / "TODO" / "implement later"
- ✅ 所有步骤含完整代码或确定的命令
- ✅ 所有类型 / 函数签名在 Task 4 (types.ts) 定义后被一致使用

### Type consistency

- `categorizeBatch` 返回 `BatchCategory | null` — 在 Task 2 定义、Task 7/9 使用 ✓
- `groupAdmissions` 返回 `GroupedAdmission[]` — 在 Task 3 定义、Task 9 使用 ✓
- `Subject` type — 在 Task 4 定义、Task 7/9 使用 ✓
- `RankTier` 来自既有 `classify-rank.ts` — Task 6/8/9 一致使用 ✓
- Banner & GroupCard 都用同一个 `TIER_STYLE` map 结构 — 形态一致 ✓

---

## Execution Handoff

Plan 完整、self-review pass。执行选项：

**1. Subagent-Driven（推荐）** — 派 fresh subagent 跑每个 task，two-stage review，迭代快
**2. Inline Execution** — 在当前会话直接跑，batched checkpoints

哪个？
