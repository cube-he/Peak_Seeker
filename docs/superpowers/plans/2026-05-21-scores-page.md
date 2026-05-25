# /scores Score-Based Search Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/scores` page so a student enters score + subject, the page converts it to a rank via the score-segment table, and shows reachable university major-groups split into rush/stable/safe tiers plus an equivalent-score cross-year table.

**Architecture:** Backend `findAggregated` is refactored to add `subjects` to the grouping key, return lightweight list items (no per-year data), and drop offset pagination in favor of a single rank-window slice; a new `findAggregatedDetail` returns the full per-year data for one combination. Frontend converts score→rank via the existing `scoreSegmentApi`, buckets results into rush/stable/safe with a pure function wrapping `classifyRank`, and renders tiered tabs, a "your position" card, and an equivalent-score table. The existing reused components `AdmissionRow` and `ExpandedAdmissionRow` are NOT modified — an outer `ExpandableAdmissionRow` wrapper composes them with a toggle.

**Tech Stack:** NestJS 10 + Prisma (`apps/server`), Next.js 14 App Router + Ant Design 5 + @tanstack/react-query + zustand (`apps/web`), shared types compiled by tsc (`packages/shared`), Jest + ts-jest for tests (server unit `.spec.ts` under `src/`, web `__tests__/*.test.tsx`, shared `.spec.ts` co-located).

---

### Task 1: Shared lightweight list-item and detail types

**Files:**
- Modify: `packages/shared/src/types/admission.ts`
- Test: `packages/shared/src/types/admission.spec.ts` (create)

The existing `AggregatedAdmissionItem` carries `yearlyData` / `currentPlan` / `supplementary`. The list endpoint now returns lightweight items without those, and a separate detail type carries the full per-year payload. We add `AggregatedAdmissionListItem` (lightweight) and `AggregatedAdmissionDetail` (full), plus `AggregatedAdmissionDetailQuery`, and repoint `AggregatedAdmissionResponse` at the lightweight item with a flat `total` (dropping the `pagination` object). The `data` field name is kept so existing frontend code does not need a rename ripple.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/types/admission.spec.ts`:

```typescript
import type {
  AggregatedAdmissionListItem,
  AggregatedAdmissionDetail,
  AggregatedAdmissionDetailQuery,
  AggregatedAdmissionResponse,
} from './admission';

describe('admission shared types', () => {
  it('AggregatedAdmissionListItem is lightweight and has no yearlyData', () => {
    const item: AggregatedAdmissionListItem = {
      university: {
        id: 1,
        name: '四川大学',
        code: 'SCU',
        province: '四川',
        city: '成都',
        type: '综合',
        runningNature: '公办',
        is985: true,
        is211: true,
        isDoubleFirstClass: true,
        logoUrl: null,
      },
      major: { id: 10, name: '软件工程', category: '工学', discipline: '计算机类', softRating: 'A' },
      majorCode: '080902',
      majorName: '软件工程',
      groupCode: '01',
      batch: '本科一批',
      subjects: '物理',
      recruitType: '普通类',
      predictedMinRank: {
        point: 12000,
        conservative: 13000,
        optimistic: 11000,
        basisYears: [2024, 2023, 2022],
        confidence: 'high',
        targetYear: 2026,
      },
    };
    // @ts-expect-error yearlyData must not exist on the lightweight item
    item.yearlyData;
    expect(item.subjects).toBe('物理');
  });

  it('AggregatedAdmissionDetail carries full yearly data', () => {
    const detail: AggregatedAdmissionDetail = {
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      subjects: '物理',
      yearlyData: [
        {
          year: 2024,
          majorMinScore: 600,
          majorMinRank: 12000,
          majorAvgScore: 610,
          majorAvgRank: 10000,
          majorAdmissionCount: 30,
          groupMinScore: 598,
          groupMinRank: 12500,
          groupAdmissionCount: 90,
        },
      ],
      currentPlan: {
        planCount: 32,
        tuition: 4900,
        duration: '四年',
        subjectRequirements: '物理必选',
        disciplineEval: 'A',
        majorRanking: '5',
        majorHonor: '国家级一流专业',
        localMasterPoint: '软件工程硕士点',
        localDoctoralPoint: null,
        isNew: false,
        isSinoForeign: false,
        planNotes: null,
      },
      supplementary: { totalRounds: 0, totalPlanCount: 0, supplementaryRate: null },
    };
    expect(detail.yearlyData).toHaveLength(1);
  });

  it('AggregatedAdmissionResponse.data is a list of lightweight items with a flat total', () => {
    const resp: AggregatedAdmissionResponse = { data: [], total: 0 };
    const detailQuery: AggregatedAdmissionDetailQuery = {
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    };
    expect(resp.data).toEqual([]);
    expect(resp.total).toBe(0);
    expect(detailQuery.subjects).toBe('物理');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @volunteer-helper/shared exec jest src/types/admission.spec.ts`
Expected: FAIL — `AggregatedAdmissionListItem`, `AggregatedAdmissionDetail`, `AggregatedAdmissionDetailQuery` are not exported from `./admission`, and `AggregatedAdmissionResponse` has no flat `total` (it has `pagination`).

- [ ] **Step 3: Write minimal implementation**

In `packages/shared/src/types/admission.ts`, append the two new interfaces and the detail query after the existing `AggregatedAdmissionItem`. Reuse the already-defined `UniversitySummary`, `MajorSummary`, `YearlyAdmissionData`, `CurrentEnrollmentPlan`, `SupplementaryInfo`, `PredictedMinRank`:

```typescript
/**
 * Lightweight aggregated admission list item.
 * Returned by GET /admissions/aggregated. Deliberately omits yearlyData /
 * currentPlan / supplementary — those are fetched per-row via the detail endpoint.
 */
export interface AggregatedAdmissionListItem {
  university: UniversitySummary;
  major: MajorSummary;
  majorCode: string;
  majorName: string;
  groupCode: string;
  batch: string;
  subjects: string;
  recruitType: string;
  predictedMinRank: PredictedMinRank | null;
}

/**
 * Full detail for a single aggregated combination.
 * Returned by GET /admissions/aggregated/detail. Carries every available year.
 */
export interface AggregatedAdmissionDetail {
  universityId: number;
  majorCode: string;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: string;
  yearlyData: YearlyAdmissionData[];
  currentPlan: CurrentEnrollmentPlan | null;
  supplementary: SupplementaryInfo | null;
}

/** Query params for GET /admissions/aggregated/detail. */
export interface AggregatedAdmissionDetailQuery {
  universityId: number;
  majorCode: string;
  groupCode: string;
  batch: string;
  recruitType: string;
  province: string;
  subjects: string;
}
```

Then replace the existing `AggregatedAdmissionResponse` interface so `data` uses the lightweight type and `total` is flat (drop the `pagination` object):

```typescript
// 聚合查询响应（轻量列表项，不分页）
export interface AggregatedAdmissionResponse {
  data: AggregatedAdmissionListItem[];
  total: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @volunteer-helper/shared exec jest src/types/admission.spec.ts`
Expected: PASS

Then build shared so downstream packages see the new types:
Run: `pnpm --filter @volunteer-helper/shared build`
Expected: tsc completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/admission.ts packages/shared/src/types/admission.spec.ts
git commit -m "feat(shared): add lightweight aggregated list item and detail types"
```

---

### Task 2: Refactor `findAggregated` — subjects in group key, lightweight list, no pagination

**Files:**
- Modify: `apps/server/src/modules/admission/admission.service.ts`
- Test: `apps/server/src/modules/admission/admission.service.spec.ts` (create)

The grouping key in `findAggregated` is currently `[universityId, majorCode, groupCode, batch, recruitType].join(':')` — it omits `subjects`, so physics and history records for the same major collapse into one row. We add `subjects` to that key. The method also returns lightweight items: it drops `yearlyData`, `currentPlan`, and `supplementary` from each item (keeps `predictedMinRank`), and replaces offset pagination (`page`/`pageSize` slice + `pagination` object) with the full grouped list capped by a `take` ceiling, returning `{ data, total }`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/modules/admission/admission.service.spec.ts`. The mock records use the real `AdmissionRecord` field names selected in `findAggregated`'s `select` clause, with `university` and `major` as nested objects:

```typescript
import { AdmissionService } from './admission.service';

type AdmissionRecordMock = {
  universityId: number;
  majorId: number;
  year: number;
  majorCode: string;
  majorName: string;
  groupCode: string;
  batch: string;
  subjects: string;
  recruitType: string;
  majorMinScore: number | null;
  majorMinRank: number | null;
  majorAvgScore: number | null;
  majorAvgRank: number | null;
  majorAdmissionCount: number | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
  university: {
    id: number;
    name: string;
    code: string;
    province: string;
    city: string;
    type: string | null;
    runningNature: string | null;
    is985: boolean;
    is211: boolean;
    isDoubleFirstClass: boolean;
    logoUrl: string | null;
  };
  major: {
    id: number;
    name: string;
    category: string | null;
    discipline: string | null;
    softRating: string | null;
  };
};

function buildRecord(overrides: Partial<AdmissionRecordMock> = {}): AdmissionRecordMock {
  return {
    universityId: 1,
    majorId: 10,
    year: 2024,
    majorCode: '080902',
    majorName: '软件工程',
    groupCode: '01',
    batch: '本科一批',
    subjects: '物理',
    recruitType: '普通类',
    majorMinScore: 600,
    majorMinRank: 12000,
    majorAvgScore: 610,
    majorAvgRank: 10000,
    majorAdmissionCount: 30,
    groupMinScore: 598,
    groupMinRank: 12500,
    groupAdmissionCount: 90,
    university: {
      id: 1,
      name: '四川大学',
      code: 'SCU',
      province: '四川',
      city: '成都',
      type: '综合',
      runningNature: '公办',
      is985: true,
      is211: true,
      isDoubleFirstClass: true,
      logoUrl: null,
    },
    major: {
      id: 10,
      name: '软件工程',
      category: '工学',
      discipline: '计算机类',
      softRating: 'A',
    },
    ...overrides,
  };
}

function buildService(records: AdmissionRecordMock[]) {
  const mockPrisma = {
    admissionRecord: { findMany: jest.fn().mockResolvedValue(records) },
    enrollmentPlan: { findMany: jest.fn().mockResolvedValue([]) },
    supplementarySummary: { findMany: jest.fn().mockResolvedValue([]) },
    rankPrediction: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new AdmissionService(mockPrisma as never), mockPrisma };
}

describe('AdmissionService.findAggregated', () => {
  it('keeps physics and history records as separate groups', async () => {
    const { service } = buildService([
      buildRecord({ subjects: '物理', year: 2024 }),
      buildRecord({ subjects: '物理', year: 2023 }),
      buildRecord({ subjects: '历史', year: 2024 }),
    ]);

    const result = await service.findAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
      range: 30000,
    });

    // The where clause filters to subjects=物理, so the prisma mock would in
    // reality return only physics rows; here all three are returned, and the
    // grouping key (now including subjects) must split 物理 from 历史.
    const subjectsSeen = new Set(result.data.map((d) => d.subjects));
    expect(subjectsSeen.has('物理')).toBe(true);
    expect(subjectsSeen.has('历史')).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('returns lightweight items without yearlyData / currentPlan / supplementary', async () => {
    const { service } = buildService([buildRecord()]);

    const result = await service.findAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
      range: 30000,
    });

    const item = result.data[0] as Record<string, unknown>;
    expect(item.yearlyData).toBeUndefined();
    expect(item.currentPlan).toBeUndefined();
    expect(item.supplementary).toBeUndefined();
    expect(item.majorCode).toBe('080902');
    expect(item.groupCode).toBe('01');
    expect(item).toHaveProperty('predictedMinRank');
    expect((item.university as Record<string, unknown>).id).toBe(1);
  });

  it('does not apply offset pagination — returns the whole window with a flat total', async () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      buildRecord({ universityId: i + 1, university: { ...buildRecord().university, id: i + 1 } }),
    );
    const { service } = buildService(records);

    const result = await service.findAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
      range: 30000,
    });

    expect(result.data).toHaveLength(25);
    expect(result.total).toBe(25);
    expect((result as Record<string, unknown>).pagination).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/server`): `npx jest admission.service.spec`
Expected: FAIL — current `findAggregated` returns items containing `yearlyData`/`currentPlan`/`supplementary` and a `pagination` object instead of a flat `total`, and merges physics/history into one group.

- [ ] **Step 3: Write minimal implementation**

In `apps/server/src/modules/admission/admission.service.ts`, replace the entire `findAggregated` method. Keep `findByScore`, `findByRank`, `getStatistics`, `getTargetYear`, `lookupPredictionsByKeys`, `getBestScore`, `getBestRank`, and the module-level `getTargetYear()` helper untouched.

Add the type import at the top (alongside the existing `import type { FindAggregatedDto }` line):

```typescript
import type {
  AggregatedAdmissionResponse,
  AggregatedAdmissionListItem,
} from '@volunteer-helper/shared';
```

Replace `findAggregated` with:

```typescript
async findAggregated(dto: FindAggregatedDto): Promise<AggregatedAdmissionResponse> {
  const {
    score,
    rank,
    province,
    range,
    batch,
    subjects,
    recruitType,
    is985,
    is211,
    isDoubleFirstClass,
  } = dto;

  if (score == null && rank == null) {
    throw new BadRequestException('score or rank is required');
  }

  const scoreRange = range ?? 20;
  const rankRange = range ?? 30000;

  // 构建 where 条件
  const where: any = { province };
  if (batch) where.batch = batch;
  if (subjects) where.subjects = subjects;
  if (recruitType) where.recruitType = recruitType;

  // 分数/位次范围过滤（OR: majorMin 或 groupMin 命中即可）
  if (score) {
    where.OR = [
      { majorMinScore: { gte: score - scoreRange, lte: score + scoreRange } },
      { groupMinScore: { gte: score - scoreRange, lte: score + scoreRange } },
    ];
  } else if (rank) {
    where.OR = [
      { majorMinRank: { gte: rank - rankRange, lte: rank + rankRange } },
      { groupMinRank: { gte: rank - rankRange, lte: rank + rankRange } },
    ];
  }

  // 院校特征过滤
  if (is985 || is211 || isDoubleFirstClass) {
    where.university = {};
    if (is985) where.university.is985 = true;
    if (is211) where.university.is211 = true;
    if (isDoubleFirstClass) where.university.isDoubleFirstClass = true;
  }

  const records = await this.prisma.admissionRecord.findMany({
    where,
    select: {
      universityId: true,
      majorId: true,
      year: true,
      majorCode: true,
      majorName: true,
      groupCode: true,
      batch: true,
      subjects: true,
      recruitType: true,
      majorMinScore: true,
      majorMinRank: true,
      majorAvgScore: true,
      majorAvgRank: true,
      majorAdmissionCount: true,
      groupMinScore: true,
      groupMinRank: true,
      groupAdmissionCount: true,
      university: {
        select: {
          id: true,
          name: true,
          code: true,
          province: true,
          city: true,
          type: true,
          runningNature: true,
          is985: true,
          is211: true,
          isDoubleFirstClass: true,
          logoUrl: true,
        },
      },
      major: {
        select: {
          id: true,
          name: true,
          category: true,
          discipline: true,
          softRating: true,
        },
      },
    },
    orderBy: [{ universityId: 'asc' }, { majorCode: 'asc' }, { year: 'desc' }],
    take: 10000,
  });

  // 按 (universityId, majorCode, groupCode, batch, recruitType, subjects) 分组。
  // subjects 加入分组键，避免物理/历史记录被并成一行。
  const groups = new Map<string, {
    university: any;
    major: any;
    majorCode: string;
    majorName: string;
    groupCode: string;
    batch: string;
    subjects: string;
    recruitType: string;
    yearlyData: { majorMinScore: number | null; majorMinRank: number | null; groupMinScore: number | null; groupMinRank: number | null }[];
  }>();

  for (const record of records) {
    const key = [
      record.universityId,
      record.majorCode,
      record.groupCode,
      record.batch,
      record.recruitType,
      record.subjects,
    ].join(':');

    if (!groups.has(key)) {
      groups.set(key, {
        university: record.university,
        major: record.major,
        majorCode: record.majorCode,
        majorName: record.majorName,
        groupCode: record.groupCode,
        batch: record.batch,
        subjects: record.subjects,
        recruitType: record.recruitType,
        yearlyData: [],
      });
    }

    groups.get(key)!.yearlyData.push({
      majorMinScore: record.majorMinScore,
      majorMinRank: record.majorMinRank,
      groupMinScore: record.groupMinScore,
      groupMinRank: record.groupMinRank,
    });
  }

  // 按"最近年份最佳可用分数/位次"排序（取消分页，整段返回）
  const allGroups = Array.from(groups.values());
  allGroups.sort((a, b) => {
    if (score != null) {
      const aScore = this.getBestScore(a.yearlyData);
      const bScore = this.getBestScore(b.yearlyData);
      return (bScore ?? 0) - (aScore ?? 0); // 按分数降序
    }
    const aRank = this.getBestRank(a.yearlyData);
    const bRank = this.getBestRank(b.yearlyData);
    return (aRank ?? Infinity) - (bRank ?? Infinity); // 按位次升序
  });

  const limited = allGroups.slice(0, 500);

  // 注入 predictedMinRank — 同一专业组的所有专业共享一条预测。
  const targetYear = getTargetYear();
  const preds = limited.length
    ? await this.prisma.rankPrediction.findMany({
        where: {
          targetYear,
          OR: limited.map((g) => ({
            universityId: g.university.id,
            groupCode: g.groupCode,
            batch: g.batch,
            recruitType: g.recruitType,
            subjects: g.subjects,
          })),
        },
      })
    : [];

  const predMap = new Map<string, (typeof preds)[number]>();
  for (const p of preds) {
    const k = [p.universityId, p.groupCode, p.batch, p.recruitType, p.subjects].join('|');
    predMap.set(k, p);
  }

  const data: AggregatedAdmissionListItem[] = limited.map((g) => {
    const k = [g.university.id, g.groupCode, g.batch, g.recruitType, g.subjects].join('|');
    const pred = predMap.get(k);
    return {
      university: g.university,
      major: g.major,
      majorCode: g.majorCode,
      majorName: g.majorName,
      groupCode: g.groupCode,
      batch: g.batch,
      subjects: g.subjects,
      recruitType: g.recruitType,
      predictedMinRank: pred
        ? {
            point: pred.pointRank!,
            conservative: pred.conservativeRank!,
            optimistic: pred.optimisticRank!,
            basisYears: pred.basisYears as number[],
            confidence: pred.confidence as 'high' | 'medium' | 'low',
            targetYear: pred.targetYear,
          }
        : null,
    };
  });

  return { data, total: data.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/server`): `npx jest admission.service.spec`
Expected: PASS — three `findAggregated` cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/admission/admission.service.ts apps/server/src/modules/admission/admission.service.spec.ts
git commit -m "refactor(admission): add subjects to aggregated group key, return lightweight items, drop pagination"
```

---

### Task 3: Add `findAggregatedDetail` service method + detail DTO

**Files:**
- Create: `apps/server/src/modules/admission/dto/aggregated-detail.dto.ts`
- Modify: `apps/server/src/modules/admission/admission.service.ts`
- Test: `apps/server/src/modules/admission/admission.service.spec.ts`

`findAggregatedDetail` looks up a single combination by all key fields and returns every available year of `yearlyData` (full `YearlyAdmissionData` shape) plus `currentPlan` (from `enrollmentPlan`) and `supplementary` (from `supplementarySummary`, keyed by university+batch). Because it is an independent full query, there is no "only matched years" gap.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/src/modules/admission/admission.service.spec.ts`:

```typescript
describe('AdmissionService.findAggregatedDetail', () => {
  function buildYearRecord(year: number, majorMinRank: number) {
    return {
      universityId: 1,
      majorId: 10,
      year,
      majorCode: '080902',
      majorName: '软件工程',
      groupCode: '01',
      batch: '本科一批',
      subjects: '物理',
      recruitType: '普通类',
      majorMinScore: 600 + (2024 - year),
      majorMinRank,
      majorAvgScore: 610,
      majorAvgRank: 10000,
      majorAdmissionCount: 30,
      groupMinScore: 598,
      groupMinRank: majorMinRank + 500,
      groupAdmissionCount: 90,
    };
  }

  it('returns every available year, currentPlan and supplementary', async () => {
    const records = [
      buildYearRecord(2024, 12000),
      buildYearRecord(2023, 13000),
      buildYearRecord(2022, 14000),
    ];
    const mockPrisma = {
      admissionRecord: { findMany: jest.fn().mockResolvedValue(records) },
      enrollmentPlan: {
        findFirst: jest.fn().mockResolvedValue({
          planCount: 32,
          tuition: 4900,
          duration: '四年',
          subjectRequirements: '物理必选',
          disciplineEval: 'A',
          majorRanking: '5',
          majorHonor: '国家级一流专业',
          localMasterPoint: '软件工程硕士点',
          localDoctoralPoint: null,
          isNew: false,
          isSinoForeign: false,
          planNotes: null,
        }),
      },
      supplementarySummary: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AdmissionService(mockPrisma as never);

    const detail = await service.findAggregatedDetail({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    });

    expect(detail.yearlyData.map((y) => y.year)).toEqual([2024, 2023, 2022]);
    expect(detail.yearlyData[0].majorMinRank).toBe(12000);
    expect(detail.yearlyData[0].groupMinRank).toBe(12500);
    expect(detail.currentPlan?.planCount).toBe(32);
    expect(detail.currentPlan?.disciplineEval).toBe('A');
    expect(detail.supplementary).toBeNull();
    expect(mockPrisma.admissionRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          universityId: 1,
          majorCode: '080902',
          groupCode: '01',
          batch: '本科一批',
          recruitType: '普通类',
          province: '四川',
          subjects: '物理',
        }),
      }),
    );
  });

  it('maps supplementarySummary into the SupplementaryInfo shape', async () => {
    const mockPrisma = {
      admissionRecord: { findMany: jest.fn().mockResolvedValue([buildYearRecord(2024, 12000)]) },
      enrollmentPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      supplementarySummary: {
        findFirst: jest.fn().mockResolvedValue({
          totalRounds: 2,
          totalPlanCount: 15,
          supplementaryRate: 3.5,
        }),
      },
    };
    const service = new AdmissionService(mockPrisma as never);

    const detail = await service.findAggregatedDetail({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    });

    expect(detail.currentPlan).toBeNull();
    expect(detail.supplementary).toEqual({
      totalRounds: 2,
      totalPlanCount: 15,
      supplementaryRate: 3.5,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/server`): `npx jest admission.service.spec`
Expected: FAIL — `service.findAggregatedDetail is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/modules/admission/dto/aggregated-detail.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Min } from 'class-validator';

export class AggregatedDetailDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  universityId!: number;

  @IsString()
  majorCode!: string;

  @IsString()
  groupCode!: string;

  @IsString()
  batch!: string;

  @IsString()
  recruitType!: string;

  @IsString()
  province!: string;

  @IsIn(['物理', '历史'])
  subjects!: string;
}
```

In `apps/server/src/modules/admission/admission.service.ts`, extend the shared type import to add the detail types:

```typescript
import type {
  AggregatedAdmissionResponse,
  AggregatedAdmissionListItem,
  AggregatedAdmissionDetail,
  YearlyAdmissionData,
  CurrentEnrollmentPlan,
  SupplementaryInfo,
} from '@volunteer-helper/shared';
```

Add `findAggregatedDetail` to the `AdmissionService` class (place it after `findAggregated`):

```typescript
async findAggregatedDetail(query: {
  universityId: number;
  majorCode: string;
  groupCode: string;
  batch: string;
  recruitType: string;
  province: string;
  subjects: string;
}): Promise<AggregatedAdmissionDetail> {
  const { universityId, majorCode, groupCode, batch, recruitType, province, subjects } = query;

  const records = await this.prisma.admissionRecord.findMany({
    where: { universityId, majorCode, groupCode, batch, recruitType, province, subjects },
    select: {
      year: true,
      majorMinScore: true,
      majorMinRank: true,
      majorAvgScore: true,
      majorAvgRank: true,
      majorAdmissionCount: true,
      groupMinScore: true,
      groupMinRank: true,
      groupAdmissionCount: true,
    },
    orderBy: { year: 'desc' },
  });

  const yearlyData: YearlyAdmissionData[] = records.map((r) => ({
    year: r.year,
    majorMinScore: r.majorMinScore,
    majorMinRank: r.majorMinRank,
    majorAvgScore: r.majorAvgScore,
    majorAvgRank: r.majorAvgRank,
    majorAdmissionCount: r.majorAdmissionCount,
    groupMinScore: r.groupMinScore,
    groupMinRank: r.groupMinRank,
    groupAdmissionCount: r.groupAdmissionCount,
  }));

  // 当年招生计划：取该组合最新年份一条
  const planRow = await this.prisma.enrollmentPlan.findFirst({
    where: { universityId, majorCode, groupCode, batch, recruitType, province, subjects },
    orderBy: { year: 'desc' },
    select: {
      planCount: true,
      tuition: true,
      duration: true,
      subjectRequirements: true,
      disciplineEval: true,
      majorRanking: true,
      majorHonor: true,
      localMasterPoint: true,
      localDoctoralPoint: true,
      isNew: true,
      isSinoForeign: true,
      planNotes: true,
    },
  });
  const currentPlan: CurrentEnrollmentPlan | null = planRow ?? null;

  // 征集志愿摘要：按 (university, batch) 维度取最新年份一条
  const suppRow = await this.prisma.supplementarySummary.findFirst({
    where: { universityId, province, batch },
    orderBy: { year: 'desc' },
    select: {
      totalRounds: true,
      totalPlanCount: true,
      supplementaryRate: true,
    },
  });
  const supplementary: SupplementaryInfo | null = suppRow
    ? {
        totalRounds: suppRow.totalRounds,
        totalPlanCount: suppRow.totalPlanCount,
        supplementaryRate:
          suppRow.supplementaryRate != null ? Number(suppRow.supplementaryRate) : null,
      }
    : null;

  return {
    universityId,
    majorCode,
    groupCode,
    batch,
    recruitType,
    subjects,
    yearlyData,
    currentPlan,
    supplementary,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/server`): `npx jest admission.service.spec`
Expected: PASS — all `findAggregated` and `findAggregatedDetail` cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/admission/dto/aggregated-detail.dto.ts apps/server/src/modules/admission/admission.service.ts apps/server/src/modules/admission/admission.service.spec.ts
git commit -m "feat(admission): add findAggregatedDetail service method and detail DTO"
```

---

### Task 4: Controller — `aggregated/detail` route + e2e update

**Files:**
- Modify: `apps/server/src/modules/admission/admission.controller.ts`
- Modify: `apps/server/test/admission.e2e-spec.ts`

The `GET /admissions/aggregated` handler is unchanged (its return is already lightweight after Task 2). A new `GET /admissions/aggregated/detail` handler delegates to `findAggregatedDetail`. The e2e spec (a real-database integration test guarded by `hasDatabase`) is updated: the aggregated case now asserts the lightweight shape (no `yearlyData`), and a new describe block covers the detail route.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `apps/server/test/admission.e2e-spec.ts`:

```typescript
/**
 * Admission Aggregated Endpoints (e2e)
 *
 * Verifies GET /admissions/aggregated returns lightweight items with a
 * `predictedMinRank` field, and GET /admissions/aggregated/detail returns the
 * full per-year payload for one combination.
 *
 * Skipped if DATABASE_URL is not set.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hasDatabase, disconnectTestPrisma } from './setup';

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb('Admission aggregated endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrisma();
  });

  it('GET /admissions/aggregated returns lightweight items with predictedMinRank', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated')
      .query({ province: '四川', rank: 12000, subjects: '物理', range: 30000 })
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.pagination).toBeUndefined();

    for (const item of res.body.data) {
      // lightweight: per-year payload must not be present
      expect(item.yearlyData).toBeUndefined();
      expect(item.currentPlan).toBeUndefined();
      expect(item.supplementary).toBeUndefined();
      expect(item).toHaveProperty('predictedMinRank');
      expect(item.subjects).toBe('物理');
      const p = item.predictedMinRank;
      if (p !== null) {
        expect(typeof p.point).toBe('number');
        expect(typeof p.conservative).toBe('number');
        expect(typeof p.optimistic).toBe('number');
        expect(Array.isArray(p.basisYears)).toBe(true);
        expect(['high', 'medium', 'low']).toContain(p.confidence);
        expect(typeof p.targetYear).toBe('number');
      }
    }
  });

  it('GET /admissions/aggregated/detail returns full yearly data for one combination', async () => {
    // First fetch a real combination from the aggregated list.
    const list = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated')
      .query({ province: '四川', rank: 12000, subjects: '物理', range: 30000 })
      .expect(200);

    const items = list.body.data || [];
    if (items.length === 0) {
      console.warn('[admission e2e] No items for province=四川 rank=12000; skipping detail assertion');
      return;
    }
    const sample = items[0];

    const res = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated/detail')
      .query({
        universityId: sample.university.id,
        majorCode: sample.majorCode,
        groupCode: sample.groupCode,
        batch: sample.batch,
        recruitType: sample.recruitType,
        province: '四川',
        subjects: '物理',
      })
      .expect(200);

    expect(Array.isArray(res.body.yearlyData)).toBe(true);
    expect(res.body).toHaveProperty('currentPlan');
    expect(res.body).toHaveProperty('supplementary');
    for (const y of res.body.yearlyData) {
      expect(typeof y.year).toBe('number');
      expect(y).toHaveProperty('majorMinRank');
      expect(y).toHaveProperty('groupMinRank');
    }
  });

  it('GET /admissions/aggregated/detail rejects a missing subjects param', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated/detail')
      .query({
        universityId: 1,
        majorCode: '080902',
        groupCode: '01',
        batch: '本科一批',
        recruitType: '普通类',
        province: '四川',
      })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/server`): `npx jest --config ./test/jest-e2e.json admission.e2e-spec`
Expected: FAIL — the `/api/v1/admissions/aggregated/detail` route does not exist (404), so the detail and missing-subjects cases fail. If `DATABASE_URL` is unset, the suite is skipped — set `DATABASE_URL` to run it.

- [ ] **Step 3: Write minimal implementation**

In `apps/server/src/modules/admission/admission.controller.ts`, add the import for the new DTO and add the detail handler. Keep all existing handlers (`by-score`, `by-rank`, `statistics`, `aggregated`, `lookup-predictions`) untouched. The full file:

```typescript
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdmissionService } from './admission.service';
import { FindAggregatedDto } from './dto/find-aggregated.dto';
import { AggregatedDetailDto } from './dto/aggregated-detail.dto';
import { LookupPredictionsDto } from './dto/lookup-predictions.dto';

@ApiTags('录取数据')
@Controller('admissions')
export class AdmissionController {
  constructor(private admissionService: AdmissionService) {}

  @Get('by-score')
  @ApiOperation({ summary: '按分数查询录取数据' })
  @ApiQuery({ name: 'score', type: Number, required: true })
  @ApiQuery({ name: 'province', type: String, required: true })
  @ApiQuery({ name: 'year', type: Number, required: false })
  @ApiQuery({ name: 'range', type: Number, required: false })
  async findByScore(
    @Query('score') score: number,
    @Query('province') province: string,
    @Query('year') year?: number,
    @Query('range') range?: number,
  ) {
    return this.admissionService.findByScore({ score, province, year, range });
  }

  @Get('by-rank')
  @ApiOperation({ summary: '按位次查询录取数据' })
  @ApiQuery({ name: 'rank', type: Number, required: true })
  @ApiQuery({ name: 'province', type: String, required: true })
  @ApiQuery({ name: 'year', type: Number, required: false })
  @ApiQuery({ name: 'range', type: Number, required: false })
  async findByRank(
    @Query('rank') rank: number,
    @Query('province') province: string,
    @Query('year') year?: number,
    @Query('range') range?: number,
  ) {
    return this.admissionService.findByRank({ rank, province, year, range });
  }

  @Get('statistics')
  @ApiOperation({ summary: '获取录取统计数据' })
  @ApiQuery({ name: 'province', type: String, required: true })
  @ApiQuery({ name: 'year', type: Number, required: false })
  async getStatistics(
    @Query('province') province: string,
    @Query('year') year?: number,
  ) {
    return this.admissionService.getStatistics(province, year);
  }

  @Get('aggregated')
  @ApiOperation({ summary: '聚合查询录取数据（轻量列表项）' })
  async findAggregated(@Query() dto: FindAggregatedDto) {
    return this.admissionService.findAggregated(dto);
  }

  @Get('aggregated/detail')
  @ApiOperation({ summary: '聚合录取结果详情（单组合全年份+招生计划+征集志愿）' })
  async findAggregatedDetail(@Query() dto: AggregatedDetailDto) {
    return this.admissionService.findAggregatedDetail(dto);
  }

  @Post('lookup-predictions')
  @ApiOperation({ summary: '批量查询 RankPrediction 按自然键' })
  async lookupPredictions(@Body() dto: LookupPredictionsDto) {
    const map = await this.admissionService.lookupPredictionsByKeys(dto.keys, dto.targetYear);
    const predictions = dto.keys.map((k) => {
      const compositeKey = [k.universityId, k.groupCode, k.batch, k.recruitType, k.subjects].join('|');
      return map.get(compositeKey) ?? null;
    });
    return { predictions };
  }
}
```

> Route-ordering note: `@Get('aggregated/detail')` is a static path, so its position relative to `@Get('aggregated')` does not matter — Nest matches `aggregated/detail` exactly before falling back. No `:param` route is involved.

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/server`): `npx jest --config ./test/jest-e2e.json admission.e2e-spec`
Expected: PASS — aggregated lightweight, detail full-year, and missing-subjects 400 cases all green (with `DATABASE_URL` set).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/admission/admission.controller.ts apps/server/test/admission.e2e-spec.ts
git commit -m "feat(admission): add aggregated/detail route and update e2e for lightweight response"
```

---

### Task 5: Frontend `admission` service — typed `getAggregated` + new `getAggregatedDetail`

**Files:**
- Modify: `apps/web/src/services/admission.ts`
- Test: `apps/web/src/services/__tests__/admission.test.ts` (create)

`getAggregated` is retyped to `Promise<AggregatedAdmissionResponse>` (lightweight items, flat `total`). A new `getAggregatedDetail(query: AggregatedAdmissionDetailQuery)` calls `GET /admissions/aggregated/detail`. The HTTP client is the existing `import api from './api'` axios instance whose response interceptor already unwraps `.data`, so service methods return the axios call result directly with no `.data` access.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/services/__tests__/admission.test.ts`. The mock follows the existing `university.test.ts` pattern — mock `../api`'s default export:

```typescript
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: mockGet, post: mockPost },
}));

import { admissionService } from '../admission';

describe('admissionService.getAggregated', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('sends rank/province/subjects and returns the lightweight response', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          university: {
            id: 1,
            name: '四川大学',
            code: 'SCU',
            province: '四川',
            city: '成都',
            type: '综合',
            runningNature: '公办',
            is985: true,
            is211: true,
            isDoubleFirstClass: true,
            logoUrl: null,
          },
          major: { id: 10, name: '软件工程', category: '工学', discipline: '计算机类', softRating: 'A' },
          majorCode: '080902',
          majorName: '软件工程',
          groupCode: '01',
          batch: '本科一批',
          subjects: '物理',
          recruitType: '普通类',
          predictedMinRank: {
            point: 12000,
            conservative: 13000,
            optimistic: 11000,
            basisYears: [2024, 2023, 2022],
            confidence: 'high',
            targetYear: 2026,
          },
        },
      ],
      total: 1,
    });

    const result = await admissionService.getAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
    });

    expect(mockGet).toHaveBeenCalledWith('/admissions/aggregated', {
      params: { rank: 12000, province: '四川', subjects: '物理' },
    });
    expect(result.data[0].subjects).toBe('物理');
    expect(result.total).toBe(1);
  });
});

describe('admissionService.getAggregatedDetail', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('calls the detail endpoint with all key params', async () => {
    mockGet.mockResolvedValue({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      subjects: '物理',
      yearlyData: [],
      currentPlan: null,
      supplementary: null,
    });

    const result = await admissionService.getAggregatedDetail({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    });

    expect(mockGet).toHaveBeenCalledWith('/admissions/aggregated/detail', {
      params: {
        universityId: 1,
        majorCode: '080902',
        groupCode: '01',
        batch: '本科一批',
        recruitType: '普通类',
        province: '四川',
        subjects: '物理',
      },
    });
    expect(result.universityId).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest admission.test`
Expected: FAIL — `admissionService.getAggregatedDetail is not a function`.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `apps/web/src/services/admission.ts`:

```typescript
import api from './api';
import type {
  AggregatedAdmissionResponse,
  AggregatedAdmissionDetail,
  AggregatedAdmissionDetailQuery,
  LookupPredictionsRequest,
  LookupPredictionsResponse,
} from '@volunteer-helper/shared';

export interface AdmissionByScoreParams {
  score: number;
  province: string;
  year?: number;
  range?: number;
}

export interface AdmissionByRankParams {
  rank: number;
  province: string;
  year?: number;
  range?: number;
}

export interface GetAggregatedParams {
  rank: number;
  province: string;
  subjects: string;
  range?: number;
}

export const admissionService = {
  getByScore(params: AdmissionByScoreParams): Promise<any> {
    return api.get('/admissions/by-score', { params }) as any;
  },

  getByRank(params: AdmissionByRankParams): Promise<any> {
    return api.get('/admissions/by-rank', { params }) as any;
  },

  getStatistics(province: string, year?: number): Promise<any> {
    return api.get('/admissions/statistics', { params: { province, year } }) as any;
  },

  getAggregated(params: GetAggregatedParams): Promise<AggregatedAdmissionResponse> {
    return api.get('/admissions/aggregated', { params }) as any;
  },

  getAggregatedDetail(
    query: AggregatedAdmissionDetailQuery,
  ): Promise<AggregatedAdmissionDetail> {
    return api.get('/admissions/aggregated/detail', { params: query }) as any;
  },

  lookupPredictions(req: LookupPredictionsRequest): Promise<LookupPredictionsResponse> {
    return api.post('/admissions/lookup-predictions', req) as any;
  },
};
```

> The axios response interceptor in `apps/web/src/services/api.ts` returns `response.data`, so `api.get(...)` resolves directly to the payload — service methods return it as-is, no `.data` unwrap. This matches the existing `getStatistics`/`lookupPredictions` style.

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest admission.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/admission.ts apps/web/src/services/__tests__/admission.test.ts
git commit -m "feat(web): retype getAggregated and add getAggregatedDetail service call"
```

---

### Task 6: Rush/stable/safe bucketing pure function

**Files:**
- Create: `apps/web/src/utils/bucket-admissions.ts`
- Test: `apps/web/src/utils/__tests__/bucket-admissions.test.ts` (create)

A pure function `bucketAdmissions(items, userRank)` wraps `classifyRank`: for each lightweight item it computes `tier` via `getTier`, `historical` via `isHistorical`, calls `classifyRank`, and routes `rush`→rush, `stable`→stable, `safe`→safe. `elite` and `unknown` are excluded from buckets; `unknown` is counted separately so the position card can show "数据不足 N 所".

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/__tests__/bucket-admissions.test.ts`:

```typescript
import { bucketAdmissions } from '../bucket-admissions';
import * as classify from '../classify-rank';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';

function makeItem(id: number, predictedPoint: number | null): AggregatedAdmissionListItem {
  return {
    university: {
      id,
      name: '校' + id,
      code: 'C' + id,
      province: '四川',
      city: '成都',
      type: '综合',
      runningNature: '公办',
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      logoUrl: null,
    },
    major: { id, name: '专业' + id, category: '工学', discipline: '计算机类', softRating: null },
    majorCode: 'M' + id,
    majorName: '专业' + id,
    groupCode: 'G' + id,
    batch: '本科一批',
    subjects: '物理',
    recruitType: '普通类',
    predictedMinRank:
      predictedPoint === null
        ? null
        : {
            point: predictedPoint,
            conservative: predictedPoint + 500,
            optimistic: predictedPoint - 500,
            basisYears: [2024, 2023],
            confidence: 'high',
            targetYear: 2026,
          },
  };
}

describe('bucketAdmissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes rush/stable/safe into their buckets and excludes elite/unknown', () => {
    const items = [
      makeItem(1, 10000),
      makeItem(2, 12000),
      makeItem(3, 20000),
      makeItem(4, 90000),
      makeItem(5, null),
    ];
    jest
      .spyOn(classify, 'classifyRank')
      .mockImplementation((_userRank, predictedRank) => {
        if (predictedRank === null) return 'unknown';
        if (predictedRank === 10000) return 'rush';
        if (predictedRank === 12000) return 'stable';
        if (predictedRank === 20000) return 'safe';
        return 'elite';
      });

    const result = bucketAdmissions(items, 12000);

    expect(result.rush.map((i) => i.university.id)).toEqual([1]);
    expect(result.stable.map((i) => i.university.id)).toEqual([2]);
    expect(result.safe.map((i) => i.university.id)).toEqual([3]);
    expect(result.unknownCount).toBe(1);
  });

  it('passes computed tier and historical flag into classifyRank', () => {
    const spy = jest.spyOn(classify, 'classifyRank').mockReturnValue('stable');

    bucketAdmissions([makeItem(1, 12000)], 12000);

    expect(spy).toHaveBeenCalledWith(
      12000,
      12000,
      classify.getTier({ is985: false, is211: false, batch: '本科一批' }),
      classify.isHistorical('物理'),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest bucket-admissions.test`
Expected: FAIL — `Cannot find module '../bucket-admissions'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/utils/bucket-admissions.ts`:

```typescript
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';
import { classifyRank, getTier, isHistorical } from './classify-rank';

export interface BucketedAdmissions {
  rush: AggregatedAdmissionListItem[];
  stable: AggregatedAdmissionListItem[];
  safe: AggregatedAdmissionListItem[];
  /** Count of items whose prediction was insufficient (classifyRank === 'unknown'). */
  unknownCount: number;
}

/**
 * Split lightweight admission items into rush/stable/safe buckets.
 * elite (over-safe bottom picks) and unknown (insufficient prediction data)
 * are deliberately excluded from the tabs; unknown is counted for the position card.
 */
export function bucketAdmissions(
  items: AggregatedAdmissionListItem[],
  userRank: number,
): BucketedAdmissions {
  const result: BucketedAdmissions = {
    rush: [],
    stable: [],
    safe: [],
    unknownCount: 0,
  };

  for (const item of items) {
    const tier = getTier({
      is985: item.university.is985,
      is211: item.university.is211,
      batch: item.batch,
    });
    const historical = isHistorical(item.subjects);
    // classifyRank's predictedRank param accepts number | null.
    const predictedRank = item.predictedMinRank ? item.predictedMinRank.point : null;
    const verdict = classifyRank(userRank, predictedRank, tier, historical);

    if (verdict === 'rush') {
      result.rush.push(item);
    } else if (verdict === 'stable') {
      result.stable.push(item);
    } else if (verdict === 'safe') {
      result.safe.push(item);
    } else if (verdict === 'unknown') {
      result.unknownCount += 1;
    }
    // 'elite' is intentionally dropped.
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest bucket-admissions.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/bucket-admissions.ts apps/web/src/utils/__tests__/bucket-admissions.test.ts
git commit -m "feat(web): add bucketAdmissions pure function for rush/stable/safe split"
```

---

> **Frontend component test environment (applies to Tasks 7–12):** jsdom does not implement `window.matchMedia`, which Ant Design responsive components (`Grid`'s `Row`/`Col`, `Table`, `Descriptions`) call on render. The repo has no global jest setup for it — existing tests stub per-file. Every `.test.tsx` file below that renders Ant Design components MUST define this stub before its `describe` block:
>
> ```typescript
> Object.defineProperty(window, 'matchMedia', {
>   writable: true,
>   value: jest.fn().mockImplementation((query: string) => ({
>     matches: false, media: query, onchange: null,
>     addListener: jest.fn(), removeListener: jest.fn(),
>     addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
>   })),
> });
> ```
>
> Definitely required for Task 8 (`Row`/`Col`) and Tasks 11–12 (`Table`). If any RED run errors with `window.matchMedia is not a function`, add this stub to that test file — it is an environment gap, not the intended assertion failure.

### Task 7: Query form component (subject + score)

**Files:**
- Create: `apps/web/src/app/(main)/scores/ScoreQueryForm.tsx`
- Test: `apps/web/src/app/(main)/scores/__tests__/ScoreQueryForm.test.tsx` (create)

A form with a subject select (物理/历史) and a large score input. Province is fixed to 四川 and shown read-only. No mode cards, no range input. On submit it calls `onSubmit({ subjects, score })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(main)/scores/__tests__/ScoreQueryForm.test.tsx`:

```typescript
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { ScoreQueryForm } from '../ScoreQueryForm';

describe('ScoreQueryForm', () => {
  it('shows province as a fixed 四川 read-only field', () => {
    render(<ScoreQueryForm onSubmit={jest.fn()} loading={false} />);
    expect(screen.getByText('四川')).toBeInTheDocument();
  });

  it('submits subjects and score when the query button is clicked', () => {
    const onSubmit = jest.fn();
    render(
      <ScoreQueryForm
        onSubmit={onSubmit}
        loading={false}
        defaultSubjects="物理"
        defaultScore={600}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(onSubmit).toHaveBeenCalledWith({ subjects: '物理', score: 600 });
  });

  it('does not render a range input or mode cards', () => {
    render(<ScoreQueryForm onSubmit={jest.fn()} loading={false} />);
    expect(screen.queryByText('浮动范围')).not.toBeInTheDocument();
    expect(screen.queryByText('按位次查')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest ScoreQueryForm.test`
Expected: FAIL — `Cannot find module '../ScoreQueryForm'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/(main)/scores/ScoreQueryForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button, Card, Form, InputNumber, Select, Typography } from 'antd';

const { Text } = Typography;

export interface ScoreQueryValues {
  subjects: string;
  score: number;
}

interface ScoreQueryFormProps {
  onSubmit: (values: ScoreQueryValues) => void;
  loading: boolean;
  defaultSubjects?: string;
  defaultScore?: number | null;
}

const SUBJECT_OPTIONS = [
  { label: '物理', value: '物理' },
  { label: '历史', value: '历史' },
];

export function ScoreQueryForm({
  onSubmit,
  loading,
  defaultSubjects = '物理',
  defaultScore,
}: ScoreQueryFormProps) {
  const [subjects, setSubjects] = useState<string>(defaultSubjects);
  const [score, setScore] = useState<number | null>(defaultScore ?? null);

  const handleSubmit = () => {
    if (score === null) {
      return;
    }
    onSubmit({ subjects, score });
  };

  return (
    <Card title="按分数查">
      <Form layout="vertical">
        <Form.Item label="省份">
          <Text strong>四川</Text>
        </Form.Item>
        <Form.Item label="选科" required>
          <Select
            value={subjects}
            options={SUBJECT_OPTIONS}
            onChange={setSubjects}
            style={{ width: 160 }}
          />
        </Form.Item>
        <Form.Item label="总分" required>
          <InputNumber
            value={score}
            onChange={(value) => setScore(value)}
            min={0}
            max={750}
            size="large"
            style={{ width: 200 }}
            placeholder="输入总分"
          />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={score === null}
          >
            查询
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest ScoreQueryForm.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/scores/ScoreQueryForm.tsx" "apps/web/src/app/(main)/scores/__tests__/ScoreQueryForm.test.tsx"
git commit -m "feat(web): add ScoreQueryForm with subject select and score input"
```

---

### Task 8: "Your position" card component

**Files:**
- Create: `apps/web/src/app/(main)/scores/PositionCard.tsx`
- Test: `apps/web/src/app/(main)/scores/__tests__/PositionCard.test.tsx` (create)

A card showing the converted rank (large), the provincial percentile (前 X%), and the hit count for each of rush/stable/safe. It notes the conversion basis (2025 一分一段表) and, when `unknownCount > 0`, appends "另有 N 所数据不足".

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(main)/scores/__tests__/PositionCard.test.tsx`:

```typescript
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { PositionCard } from '../PositionCard';

describe('PositionCard', () => {
  it('shows the converted rank, percentile and tier counts', () => {
    render(
      <PositionCard
        rank={12000}
        percentile={3.5}
        rushCount={4}
        stableCount={9}
        safeCount={6}
        unknownCount={0}
      />,
    );
    expect(screen.getByText('12000')).toBeInTheDocument();
    expect(screen.getByText(/前 3.5%/)).toBeInTheDocument();
    expect(screen.getByText(/2025/)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('appends a data-insufficient note when unknownCount > 0', () => {
    render(
      <PositionCard
        rank={12000}
        percentile={3.5}
        rushCount={4}
        stableCount={9}
        safeCount={6}
        unknownCount={7}
      />,
    );
    expect(screen.getByText(/另有 7 所数据不足/)).toBeInTheDocument();
  });

  it('omits the note when unknownCount is 0', () => {
    render(
      <PositionCard
        rank={12000}
        percentile={3.5}
        rushCount={4}
        stableCount={9}
        safeCount={6}
        unknownCount={0}
      />,
    );
    expect(screen.queryByText(/数据不足/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest PositionCard.test`
Expected: FAIL — `Cannot find module '../PositionCard'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/(main)/scores/PositionCard.tsx`:

```typescript
'use client';

import { Card, Col, Row, Statistic, Typography } from 'antd';

const { Text } = Typography;

interface PositionCardProps {
  rank: number;
  percentile: number;
  rushCount: number;
  stableCount: number;
  safeCount: number;
  unknownCount: number;
}

export function PositionCard({
  rank,
  percentile,
  rushCount,
  stableCount,
  safeCount,
  unknownCount,
}: PositionCardProps) {
  return (
    <Card title="你的定位">
      <Row gutter={16}>
        <Col span={8}>
          <Statistic title="换算位次" value={rank} groupSeparator="" />
        </Col>
        <Col span={8}>
          <Statistic title="省排名" value={`前 ${percentile}%`} />
        </Col>
        <Col span={8}>
          <Statistic title="可冲" value={rushCount} />
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Statistic title="较稳" value={stableCount} />
        </Col>
        <Col span={8}>
          <Statistic title="保底" value={safeCount} />
        </Col>
      </Row>
      <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
        基于 2025 一分一段表换算
        {unknownCount > 0 ? `，另有 ${unknownCount} 所数据不足` : ''}
      </Text>
    </Card>
  );
}
```

> `Statistic` defaults to a thousands separator; `groupSeparator=""` on the rank keeps the test's `getByText('12000')` exact-match valid.

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest PositionCard.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/scores/PositionCard.tsx" "apps/web/src/app/(main)/scores/__tests__/PositionCard.test.tsx"
git commit -m "feat(web): add PositionCard showing converted rank and tier counts"
```

---

### Task 9: Expandable admission row wrapper

**Files:**
- Create: `apps/web/src/app/(main)/scores/ExpandableAdmissionRow.tsx`
- Test: `apps/web/src/app/(main)/scores/__tests__/ExpandableAdmissionRow.test.tsx` (create)

`AdmissionRow` (`apps/web/src/components/admission/AdmissionRow.tsx`) is reused as-is and has NO expand button — its props are `{ data: AdmissionRowData; userRank: number | null }`. `ExpandedAdmissionRow` (`apps/web/src/app/(main)/scores/ExpandedAdmissionRow.tsx`) is also reused as-is — its props are `{ yearlyData; currentPlan; supplementary }`. Neither file is modified. This new wrapper renders an `AdmissionRow`, an expand/collapse toggle button, and — when expanded — fetches detail via `admissionService.getAggregatedDetail` and renders `ExpandedAdmissionRow` by spreading the detail's `yearlyData`/`currentPlan`/`supplementary`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(main)/scores/__tests__/ExpandableAdmissionRow.test.tsx`:

```typescript
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpandableAdmissionRow } from '../ExpandableAdmissionRow';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';
import { admissionService } from '@/services/admission';

jest.mock('@/services/admission', () => ({
  admissionService: { getAggregatedDetail: jest.fn() },
}));

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

function makeItem(id: number): AggregatedAdmissionListItem {
  return {
    university: {
      id,
      name: '校' + id,
      code: 'C' + id,
      province: '四川',
      city: '成都',
      type: '综合',
      runningNature: '公办',
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      logoUrl: null,
    },
    major: { id, name: '专业' + id, category: '工学', discipline: '计算机类', softRating: null },
    majorCode: 'M' + id,
    majorName: '专业' + id,
    groupCode: 'G' + id,
    batch: '本科一批',
    subjects: '物理',
    recruitType: '普通类',
    predictedMinRank: {
      point: 12000,
      conservative: 12500,
      optimistic: 11500,
      basisYears: [2024, 2023],
      confidence: 'high',
      targetYear: 2026,
    },
  };
}

describe('ExpandableAdmissionRow', () => {
  beforeEach(() => {
    (admissionService.getAggregatedDetail as jest.Mock).mockReset();
  });

  it('renders an expand toggle and is collapsed by default', () => {
    render(<ExpandableAdmissionRow item={makeItem(1)} userRank={12000} />);
    expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument();
    expect(screen.queryByText('历年录取数据')).not.toBeInTheDocument();
  });

  it('fetches detail and renders the expanded row when toggled open', async () => {
    (admissionService.getAggregatedDetail as jest.Mock).mockResolvedValue({
      universityId: 1,
      majorCode: 'M1',
      groupCode: 'G1',
      batch: '本科一批',
      recruitType: '普通类',
      subjects: '物理',
      yearlyData: [
        {
          year: 2024,
          majorMinScore: 600,
          majorMinRank: 12000,
          majorAvgScore: 610,
          majorAvgRank: 10000,
          majorAdmissionCount: 30,
          groupMinScore: 598,
          groupMinRank: 12500,
          groupAdmissionCount: 90,
        },
      ],
      currentPlan: null,
      supplementary: null,
    });

    render(<ExpandableAdmissionRow item={makeItem(1)} userRank={12000} />);

    fireEvent.click(screen.getByRole('button', { name: '展开' }));

    await waitFor(() => {
      expect(admissionService.getAggregatedDetail).toHaveBeenCalledWith({
        universityId: 1,
        majorCode: 'M1',
        groupCode: 'G1',
        batch: '本科一批',
        recruitType: '普通类',
        province: '四川',
        subjects: '物理',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('历年录取数据')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest ExpandableAdmissionRow.test`
Expected: FAIL — `Cannot find module '../ExpandableAdmissionRow'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/(main)/scores/ExpandableAdmissionRow.tsx`. It builds `AdmissionRow`'s `data` prop from the lightweight item, passes `userRank` through, and on first expand fetches the detail. `AdmissionRow` and `ExpandedAdmissionRow` are imported by their real export styles — `AdmissionRow` is a default export, `ExpandedAdmissionRow` is a default export:

```typescript
'use client';

import { useState } from 'react';
import { Button, Spin } from 'antd';
import type { AggregatedAdmissionListItem, AggregatedAdmissionDetail } from '@volunteer-helper/shared';
import AdmissionRow from '@/components/admission/AdmissionRow';
import { admissionService } from '@/services/admission';
import ExpandedAdmissionRow from './ExpandedAdmissionRow';

interface ExpandableAdmissionRowProps {
  item: AggregatedAdmissionListItem;
  userRank: number | null;
}

export function ExpandableAdmissionRow({ item, userRank }: ExpandableAdmissionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AggregatedAdmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail !== null) {
      return;
    }
    setLoading(true);
    try {
      const result = await admissionService.getAggregatedDetail({
        universityId: item.university.id,
        majorCode: item.majorCode,
        groupCode: item.groupCode,
        batch: item.batch,
        recruitType: item.recruitType,
        province: item.university.province,
        subjects: item.subjects,
      });
      setDetail(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div className="flex-1">
          <AdmissionRow
            data={{
              university: {
                id: item.university.id,
                name: item.university.name,
                logoUrl: item.university.logoUrl,
                is985: item.university.is985,
                is211: item.university.is211,
                isDoubleFirstClass: item.university.isDoubleFirstClass,
              },
              major: item.major ? { id: item.major.id, name: item.major.name } : null,
              majorName: item.majorName,
              groupCode: item.groupCode,
              batch: item.batch,
              recruitType: item.recruitType,
              subjects: item.subjects,
              predictedMinRank: item.predictedMinRank,
            }}
            userRank={userRank}
          />
        </div>
        <Button size="small" onClick={handleToggle}>
          {expanded ? '收起' : '展开'}
        </Button>
      </div>
      {expanded ? (
        loading ? (
          <div className="py-4 text-center">
            <Spin />
          </div>
        ) : detail ? (
          <ExpandedAdmissionRow
            yearlyData={detail.yearlyData}
            currentPlan={detail.currentPlan}
            supplementary={detail.supplementary}
          />
        ) : null
      ) : null}
    </div>
  );
}
```

> `AdmissionRow`'s `data` prop type is `AdmissionRowData` (defined in `AdmissionRow.tsx`): `university` is a 6-field subset, `major` is `{ id; name } | null`, and `predictedMinRank` is `{ point: number } | null` — the full `PredictedMinRank` object is structurally assignable. `ExpandedAdmissionRow`'s props are `{ yearlyData; currentPlan; supplementary }` exactly as spread here. Neither component file is modified.

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest ExpandableAdmissionRow.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/scores/ExpandableAdmissionRow.tsx" "apps/web/src/app/(main)/scores/__tests__/ExpandableAdmissionRow.test.tsx"
git commit -m "feat(web): add ExpandableAdmissionRow wrapping AdmissionRow with detail fetch"
```

---

### Task 10: Rush/stable/safe tabbed result component

**Files:**
- Create: `apps/web/src/app/(main)/scores/TieredResults.tsx`
- Test: `apps/web/src/app/(main)/scores/__tests__/TieredResults.test.tsx` (create)

Three tabs (冲/稳/保, default 稳). Each tab renders an `ExpandableAdmissionRow` list with incremental "加载更多" (data already client-side, no fetch). Empty tiers show an empty state.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(main)/scores/__tests__/TieredResults.test.tsx`:

```typescript
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { TieredResults } from '../TieredResults';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';

jest.mock('@/services/admission', () => ({
  admissionService: { getAggregatedDetail: jest.fn() },
}));

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

function makeItem(id: number): AggregatedAdmissionListItem {
  return {
    university: {
      id,
      name: '校' + id,
      code: 'C' + id,
      province: '四川',
      city: '成都',
      type: '综合',
      runningNature: '公办',
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      logoUrl: null,
    },
    major: { id, name: '专业' + id, category: '工学', discipline: '计算机类', softRating: null },
    majorCode: 'M' + id,
    majorName: '专业' + id,
    groupCode: 'G' + id,
    batch: '本科一批',
    subjects: '物理',
    recruitType: '普通类',
    predictedMinRank: {
      point: 12000,
      conservative: 12500,
      optimistic: 11500,
      basisYears: [2024, 2023],
      confidence: 'high',
      targetYear: 2026,
    },
  };
}

describe('TieredResults', () => {
  it('defaults to the stable tab', () => {
    render(
      <TieredResults
        userRank={12000}
        buckets={{
          rush: [makeItem(1)],
          stable: [makeItem(2)],
          safe: [makeItem(3)],
        }}
      />,
    );
    expect(screen.getByText('校2')).toBeInTheDocument();
  });

  it('shows an empty state for a tier with no results', () => {
    render(
      <TieredResults
        userRank={12000}
        buckets={{ rush: [], stable: [makeItem(2)], safe: [] }}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /冲/ }));
    expect(screen.getByText('暂无可冲院校')).toBeInTheDocument();
  });

  it('shows a 加载更多 button when a tier has more than one page of items', () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => makeItem(i + 1));
    render(
      <TieredResults
        userRank={12000}
        buckets={{ rush: [], stable: manyItems, safe: [] }}
      />,
    );
    expect(screen.getByRole('button', { name: '加载更多' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest TieredResults.test`
Expected: FAIL — `Cannot find module '../TieredResults'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/(main)/scores/TieredResults.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button, Empty, Tabs } from 'antd';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';
import { ExpandableAdmissionRow } from './ExpandableAdmissionRow';

const PAGE_SIZE = 10;

export interface TieredBuckets {
  rush: AggregatedAdmissionListItem[];
  stable: AggregatedAdmissionListItem[];
  safe: AggregatedAdmissionListItem[];
}

interface TieredResultsProps {
  userRank: number;
  buckets: TieredBuckets;
}

interface TierPanelProps {
  userRank: number;
  items: AggregatedAdmissionListItem[];
  emptyText: string;
}

function itemKey(item: AggregatedAdmissionListItem): string {
  return [
    item.university.id,
    item.majorCode,
    item.groupCode,
    item.batch,
    item.recruitType,
    item.subjects,
  ].join(':');
}

function TierPanel({ userRank, items, emptyText }: TierPanelProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (items.length === 0) {
    return <Empty description={emptyText} />;
  }

  return (
    <div>
      {items.slice(0, visible).map((item) => (
        <ExpandableAdmissionRow key={itemKey(item)} item={item} userRank={userRank} />
      ))}
      {visible < items.length ? (
        <Button block onClick={() => setVisible((current) => current + PAGE_SIZE)}>
          加载更多
        </Button>
      ) : null}
    </div>
  );
}

export function TieredResults({ userRank, buckets }: TieredResultsProps) {
  return (
    <Tabs
      defaultActiveKey="stable"
      items={[
        {
          key: 'rush',
          label: `冲 (${buckets.rush.length})`,
          children: (
            <TierPanel userRank={userRank} items={buckets.rush} emptyText="暂无可冲院校" />
          ),
        },
        {
          key: 'stable',
          label: `稳 (${buckets.stable.length})`,
          children: (
            <TierPanel userRank={userRank} items={buckets.stable} emptyText="暂无较稳院校" />
          ),
        },
        {
          key: 'safe',
          label: `保 (${buckets.safe.length})`,
          children: (
            <TierPanel userRank={userRank} items={buckets.safe} emptyText="暂无保底院校" />
          ),
        },
      ]}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest TieredResults.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/scores/TieredResults.tsx" "apps/web/src/app/(main)/scores/__tests__/TieredResults.test.tsx"
git commit -m "feat(web): add TieredResults rush/stable/safe tabbed result component"
```

---

### Task 11: Equivalent-score cross-year table component

**Files:**
- Create: `apps/web/src/app/(main)/scores/EquivalentScoreTable.tsx`
- Test: `apps/web/src/app/(main)/scores/__tests__/EquivalentScoreTable.test.tsx` (create)

A table that, given the converted rank, calls `scoreSegmentApi.equivalent({ baseYear: 2025, examType: subjects, rank })` and renders one row per year. `scoreSegmentApi.equivalent` returns `EquivalentResult` = `{ base: LookupResult; equivalents: LookupResult[] }` — the cross-year rows are under `.equivalents`, each a `LookupResult` = `{ year; examType; score; rank; percentile }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(main)/scores/__tests__/EquivalentScoreTable.test.tsx`:

```typescript
/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { EquivalentScoreTable } from '../EquivalentScoreTable';
import { scoreSegmentApi } from '@/services/score-segment';

jest.mock('@/services/score-segment', () => ({
  scoreSegmentApi: { equivalent: jest.fn() },
}));

describe('EquivalentScoreTable', () => {
  beforeEach(() => {
    (scoreSegmentApi.equivalent as jest.Mock).mockReset();
  });

  it('renders one row per equivalent year from the .equivalents array', async () => {
    (scoreSegmentApi.equivalent as jest.Mock).mockResolvedValue({
      base: { year: 2025, examType: '物理', score: 600, rank: 12000, percentile: 3.5 },
      equivalents: [
        { year: 2024, examType: '物理', score: 598, rank: 12100, percentile: 3.6 },
        { year: 2023, examType: '物理', score: 602, rank: 11900, percentile: 3.4 },
        { year: 2022, examType: '物理', score: 605, rank: 11700, percentile: 3.3 },
      ],
    });

    render(<EquivalentScoreTable rank={12000} subjects="物理" />);

    await waitFor(() => {
      expect(screen.getByText('2024')).toBeInTheDocument();
    });
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
  });

  it('calls equivalent with baseYear 2025 and the subject as examType', async () => {
    (scoreSegmentApi.equivalent as jest.Mock).mockResolvedValue({
      base: { year: 2025, examType: '历史', score: 550, rank: 12000, percentile: 8.0 },
      equivalents: [],
    });

    render(<EquivalentScoreTable rank={12000} subjects="历史" />);

    await waitFor(() => {
      expect(scoreSegmentApi.equivalent).toHaveBeenCalledWith({
        baseYear: 2025,
        examType: '历史',
        rank: 12000,
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest EquivalentScoreTable.test`
Expected: FAIL — `Cannot find module '../EquivalentScoreTable'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/(main)/scores/EquivalentScoreTable.tsx`. `subjects` is a `string` from the form; `scoreSegmentApi.equivalent` types `examType` as `ExamType` (`'物理' | '历史' | '理科' | '文科'`) — cast at the call boundary since the form only ever produces `物理`/`历史`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest EquivalentScoreTable.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/scores/EquivalentScoreTable.tsx" "apps/web/src/app/(main)/scores/__tests__/EquivalentScoreTable.test.tsx"
git commit -m "feat(web): add EquivalentScoreTable cross-year equivalent-score component"
```

---

### Task 12: Assemble `scores/page.tsx` — score→rank flow, remove legacy UI

**Files:**
- Modify: `apps/web/src/app/(main)/scores/page.tsx`
- Test: `apps/web/src/app/(main)/scores/__tests__/page.test.tsx` (create)

The page wires it together: `ScoreQueryForm` submit → `scoreSegmentApi.lookup({ year: 2025, examType: subjects, score })` → `{ rank, percentile }` → `admissionService.getAggregated({ rank, province: '四川', subjects })` → `bucketAdmissions` → render `PositionCard`, `TieredResults`, `EquivalentScoreTable`. Legacy mode cards, range input, the 4 statistic cards, the pagination, and the bottom "同位次跨年对比" placeholder section are removed. The page stays wrapped in `MainLayout`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(main)/scores/__tests__/page.test.tsx`. `useUserStore`'s `examInfo` has `{ score, rank, province, subjects: string[], examYear }`:

```typescript
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScoresPage from '../page';
import { scoreSegmentApi } from '@/services/score-segment';
import { admissionService } from '@/services/admission';

jest.mock('@/services/score-segment', () => ({
  scoreSegmentApi: { lookup: jest.fn(), equivalent: jest.fn() },
}));
jest.mock('@/services/admission', () => ({
  admissionService: { getAggregated: jest.fn(), getAggregatedDetail: jest.fn() },
}));
jest.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    examInfo: { score: 600, rank: 12000, province: '四川', subjects: ['物理'], examYear: 2025 },
  }),
}));
jest.mock('@/components/layout/MainLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

describe('ScoresPage', () => {
  beforeEach(() => {
    (scoreSegmentApi.lookup as jest.Mock).mockReset();
    (scoreSegmentApi.equivalent as jest.Mock).mockReset();
    (admissionService.getAggregated as jest.Mock).mockReset();
    (scoreSegmentApi.equivalent as jest.Mock).mockResolvedValue({
      base: { year: 2025, examType: '物理', score: 600, rank: 12000, percentile: 3.5 },
      equivalents: [],
    });
  });

  it('does not render the legacy mode cards, range input or statistic cards', () => {
    render(<ScoresPage />);
    expect(screen.queryByText('按位次查')).not.toBeInTheDocument();
    expect(screen.queryByText('浮动范围')).not.toBeInTheDocument();
    expect(screen.queryByText('同位次跨年对比')).not.toBeInTheDocument();
  });

  it('converts score to rank then loads and buckets admissions on query', async () => {
    (scoreSegmentApi.lookup as jest.Mock).mockResolvedValue({
      year: 2025,
      examType: '物理',
      score: 600,
      rank: 12000,
      percentile: 3.5,
    });
    (admissionService.getAggregated as jest.Mock).mockResolvedValue({ data: [], total: 0 });

    render(<ScoresPage />);

    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(scoreSegmentApi.lookup).toHaveBeenCalledWith({
        year: 2025,
        examType: '物理',
        score: 600,
      });
    });
    await waitFor(() => {
      expect(admissionService.getAggregated).toHaveBeenCalledWith({
        rank: 12000,
        province: '四川',
        subjects: '物理',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('你的定位')).toBeInTheDocument();
    });
  });

  it('shows a conversion-failed message when lookup rejects', async () => {
    (scoreSegmentApi.lookup as jest.Mock).mockRejectedValue(new Error('out of range'));

    render(<ScoresPage />);

    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(screen.getByText(/换算失败/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx jest "scores/__tests__/page.test"`
Expected: FAIL — the current `page.tsx` still renders the legacy mode cards / "浮动范围" / "同位次跨年对比" section and has no score→rank flow, so the legacy-absent and conversion-flow assertions fail.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `apps/web/src/app/(main)/scores/page.tsx`. `examInfo.subjects` is a `string[]` — pick `[0]` as the default selected subject; `examType` for `scoreSegmentApi.lookup` is typed `ExamType`, cast since the form only yields `物理`/`历史`:

```typescript
'use client';

import { useState } from 'react';
import { Alert, Space } from 'antd';
import MainLayout from '@/components/layout/MainLayout';
import { useUserStore } from '@/stores/userStore';
import { scoreSegmentApi, type ExamType } from '@/services/score-segment';
import { admissionService } from '@/services/admission';
import { bucketAdmissions } from '@/utils/bucket-admissions';
import { ScoreQueryForm, type ScoreQueryValues } from './ScoreQueryForm';
import { PositionCard } from './PositionCard';
import { TieredResults, type TieredBuckets } from './TieredResults';
import { EquivalentScoreTable } from './EquivalentScoreTable';

const LOOKUP_YEAR = 2025;
const PROVINCE = '四川';

interface PositionState {
  rank: number;
  percentile: number;
  subjects: string;
  buckets: TieredBuckets;
  unknownCount: number;
}

export default function ScoresPage() {
  const { examInfo } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionState | null>(null);

  const defaultSubjects = examInfo.subjects[0] ?? '物理';

  const handleQuery = async (values: ScoreQueryValues) => {
    setLoading(true);
    setError(null);
    try {
      const lookup = await scoreSegmentApi.lookup({
        year: LOOKUP_YEAR,
        examType: values.subjects as ExamType,
        score: values.score,
      });
      const aggregated = await admissionService.getAggregated({
        rank: lookup.rank,
        province: PROVINCE,
        subjects: values.subjects,
      });
      const bucketed = bucketAdmissions(aggregated.data, lookup.rank);
      setPosition({
        rank: lookup.rank,
        percentile: lookup.percentile,
        subjects: values.subjects,
        buckets: {
          rush: bucketed.rush,
          stable: bucketed.stable,
          safe: bucketed.safe,
        },
        unknownCount: bucketed.unknownCount,
      });
    } catch {
      setPosition(null);
      setError('换算失败：请检查分数是否在一分一段表范围内');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ScoreQueryForm
          onSubmit={handleQuery}
          loading={loading}
          defaultSubjects={defaultSubjects}
          defaultScore={examInfo.score}
        />

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {position ? (
          <>
            <PositionCard
              rank={position.rank}
              percentile={position.percentile}
              rushCount={position.buckets.rush.length}
              stableCount={position.buckets.stable.length}
              safeCount={position.buckets.safe.length}
              unknownCount={position.unknownCount}
            />
            <TieredResults userRank={position.rank} buckets={position.buckets} />
            <EquivalentScoreTable rank={position.rank} subjects={position.subjects} />
          </>
        ) : null}
      </Space>
    </MainLayout>
  );
}
```

> The deleted `page.tsx` imported `LowConfidenceBanner`, `StatCard`, `Pagination`, `useQuery`, `ADMISSION_BATCHES`, etc. The rewrite drops every one of them — only the imports listed above remain. The bottom "同位次跨年对比" placeholder section is removed (replaced by `EquivalentScoreTable`).

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx jest "scores/__tests__/page.test"`
Expected: PASS

Then run the full scores test set and a type check:
Run (from `apps/web`): `npx jest scores; npx tsc -p tsconfig.json`
Expected: all `scores` tests PASS; tsc reports no errors (`tsconfig.json` has `noEmit: true`).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/scores/page.tsx" "apps/web/src/app/(main)/scores/__tests__/page.test.tsx"
git commit -m "feat(web): rebuild scores page with score-to-rank flow and tiered results"
```

---

## Self-Review

**1. Spec coverage**

- §2 / §4.1 remove rank-search mode + ModeCard — Task 7 (form has no mode cards), Task 12 (page renders none, test asserts absence). Covered.
- §2 / §4.1 form adds subject, removes range input — Task 7. Covered.
- §3 / §2 score→rank conversion via `score-segment/lookup` — Task 12. Covered.
- §4.2 "你的定位" card — Task 8. Covered.
- §4.3 rush/stable/safe tabbed results — Task 10. Covered.
- §4.3 expandable row → full history (`ExpandedAdmissionRow` + detail fetch) — Task 9 (wrapper) + Task 10 (list). Covered.
- §4.4 equivalent-score table replacing the placeholder section — Task 11 + Task 12 (placeholder removed by full page rewrite). Covered.
- §2 / §4 remove 4 statistic cards — Task 12 (full rewrite drops `StatCard` + `getStatistics`, test asserts absence). Covered.
- §5 classifyRank bucketing mapping (rush/stable/safe; elite/unknown excluded; unknown counted) — Task 6. Covered.
- §6.1 `aggregated` lightweight + subjects in group key + no pagination — Task 2. Covered.
- §6.1 `subjects` filter — Task 2 (DTO already has `@IsIn(['物理','历史'])` `subjects?`; `findAggregated` applies it to `where`). Covered.
- §6.2 new `aggregated/detail` endpoint, all years — Task 3 (service) + Task 4 (route). Covered.
- §6.3 `admission.e2e-spec.ts` updated — Task 4. Covered.
- §8 error handling: lookup out-of-range → "换算失败" — Task 12 (error state + test). unknown → not in tabs, counted — Task 6 + Task 8. empty tier state — Task 10. Covered.
- §9 tests — every task is TDD with explicit test code. Covered.
- shared types for lightweight item + detail — Task 1. Covered.
- frontend service `getAggregated` retype + `getAggregatedDetail` — Task 5. Covered.

**2. Placeholder scan**

No "TODO" / "TBD" / "implement later" / "add error handling" / "similar to Task N" used as substitutes for content. Every code step contains complete code. The remaining `>` blocks are factual notes about real file shapes (axios interceptor unwrap, `AdmissionRow`/`ExpandedAdmissionRow` real props, `Statistic` separator, `examInfo.subjects` array, route ordering) — not assumptions or deferred work.

**3. Type consistency**

- `AggregatedAdmissionListItem` / `AggregatedAdmissionDetail` / `AggregatedAdmissionDetailQuery` / `AggregatedAdmissionResponse` — defined Task 1, used identically in Tasks 2-6, 9-12. `AggregatedAdmissionResponse` is `{ data; total }` everywhere (field name `data`, not `items`).
- `UniversitySummary` (`id: number`, all fields), `MajorSummary` (`id: number`), `PredictedMinRank` (`point/conservative/optimistic/basisYears/confidence/targetYear`), `YearlyAdmissionData` (`year/majorMin*/majorAvg*/majorAdmissionCount/groupMin*/groupAdmissionCount`), `CurrentEnrollmentPlan` (12 fields), `SupplementaryInfo` (`totalRounds/totalPlanCount/supplementaryRate`) — used with their real shapes in every mock and assertion (Tasks 1-5, 9). All `id` values are numbers.
- `findAggregated(dto): Promise<AggregatedAdmissionResponse>` and `findAggregatedDetail(query): Promise<AggregatedAdmissionDetail>` — Task 2/3 service; Task 4 controller delegates `findAggregatedDetail` a single DTO object with 7 fields; e2e in Task 4 queries the same 7 params; frontend `getAggregatedDetail` query object in Tasks 5/9 carries the same 7 fields.
- Prisma model names — `prisma.admissionRecord`, `prisma.enrollmentPlan`, `prisma.supplementarySummary`, `prisma.rankPrediction` (matching `schema.prisma` and existing `admission.service.ts` calls). `RankPrediction` fields `pointRank/conservativeRank/optimisticRank/basisYears/confidence/targetYear/subjects` used in Task 2.
- `bucketAdmissions(items, userRank)` → `BucketedAdmissions { rush, stable, safe, unknownCount }` — Task 6, consumed Task 12. `TieredBuckets` (Task 10) has only `rush/stable/safe`; Task 12 maps `BucketedAdmissions` into `TieredBuckets` + a separate `unknownCount` — consistent.
- `classifyRank(userRank, predictedRank: number | null, tier, historical)`, `getTier({is985,is211,batch})`, `isHistorical(subjects)` — real signatures from `classify-rank.ts`, used consistently in Task 6.
- `AdmissionRow` props `{ data: AdmissionRowData; userRank: number | null }` (default export) and `ExpandedAdmissionRow` props `{ yearlyData; currentPlan; supplementary }` (default export) — neither modified; Task 9 wrapper composes them with their real props.
- `ScoreQueryValues { subjects, score }` — Task 7, consumed Task 12.
- `scoreSegmentApi.lookup({ year, examType: ExamType, score? })` → `LookupResult { year; examType; score; rank; percentile }`, `.equivalent({ baseYear, examType, rank })` → `EquivalentResult { base; equivalents }` — real signatures from `score-segment.ts`, used in Tasks 11-12. The cross-year rows are read from `.equivalents`.
- HTTP client is `import api from './api'` (default export, axios, response interceptor unwraps `.data`) — Task 5 service and its mock match the existing `university.test.ts` pattern.

No mismatches found.

**Spec points intentionally left to implementation**

Spec §11 is an explicit "待实现阶段确认" list, not requirements: dynamic `range` by exam type (the plan uses ±30000 per §6.1's stated default), the lookup-year vs prediction-target-year UI note, the exact `examInfo.subjects` string format (the plan reads `subjects[0]`), and whether `unknown` results get an expandable entry (the plan only counts them per §5's table). These are left as-is — resolving them is out of plan scope.
