# Scores Page Redesign — 分数查询页重构

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the scores page to show multi-year trends, enrollment plan data, and filterable aggregated admission records grouped by university+major combination.

**Architecture:** Replace single-year flat record queries with a new `/admissions/aggregated` endpoint that queries all years, groups by (universityId, majorCode, groupCode, batch, recruitType), joins with enrollment_plans, and returns paginated aggregated results. Frontend renders a table with trend columns and expandable detail rows.

**Tech Stack:** NestJS (backend), Prisma (ORM), Next.js + Ant Design + TanStack Query (frontend), shared types in `packages/shared`.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/shared/src/constants/admission.ts` | Data-specific constants for batch/subject/recruitType filters |
| Modify | `packages/shared/src/constants/index.ts` | Export new constants |
| Modify | `packages/shared/src/types/admission.ts` | Add aggregated response types |
| Create | `apps/server/src/modules/admission/dto/find-aggregated.dto.ts` | Query validation DTO |
| Modify | `apps/server/src/modules/admission/admission.service.ts` | Add `findAggregated()` method |
| Modify | `apps/server/src/modules/admission/admission.controller.ts` | Add `GET /admissions/aggregated` |
| Modify | `apps/web/src/services/admission.ts` | Add `getAggregated()` API call |
| Create | `apps/web/src/app/(main)/scores/ExpandedAdmissionRow.tsx` | Expandable row detail component |
| Modify | `apps/web/src/app/(main)/scores/page.tsx` | Full page rewrite with filters + trend table |

---

## Task 1: Shared Types — Aggregated Admission Response

**Files:**
- Modify: `packages/shared/src/types/admission.ts`

- [ ] **Step 1: Add aggregated admission types**

Append to the existing file:

```typescript
// 单年录取数据（聚合结果中的年度数据）
export interface YearlyAdmissionData {
  year: number;
  // 专业级数据（2022-2024较完整）
  majorMinScore: number | null;
  majorMinRank: number | null;
  majorAvgScore: number | null;
  majorAvgRank: number | null;
  majorAdmissionCount: number | null;
  // 专业组级数据（2024-2025较完整）
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
}

// 当年招生计划
export interface CurrentEnrollmentPlan {
  planCount: number | null;
  tuition: number | null;
  duration: string | null;
  subjectRequirements: string | null;
  disciplineEval: string | null;
  majorRanking: string | null;
  majorHonor: string | null;
  localMasterPoint: string | null;
  localDoctoralPoint: string | null;
  isNew: boolean;
  isSinoForeign: boolean;
  planNotes: string | null;
}

// 院校摘要（聚合结果中的院校信息）
export interface UniversitySummary {
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
}

// 专业摘要
export interface MajorSummary {
  id: number;
  name: string;
  category: string | null;
  discipline: string | null;
  softRating: string | null;
}

// 聚合录取结果 — 一条 = 一个"院校+专业"组合的完整画像
export interface AggregatedAdmissionItem {
  university: UniversitySummary;
  major: MajorSummary;
  majorCode: string;
  majorName: string;
  groupCode: string;
  batch: string;
  subjects: string;
  recruitType: string;
  yearlyData: YearlyAdmissionData[];
  currentPlan: CurrentEnrollmentPlan | null;
}

// 聚合查询参数
export interface AggregatedAdmissionQuery {
  score?: number;
  rank?: number;
  province: string;
  range?: number;
  batch?: string;
  subjects?: string;
  recruitType?: string;
  is985?: boolean;
  is211?: boolean;
  isDoubleFirstClass?: boolean;
  page?: number;
  pageSize?: number;
}

// 聚合查询响应
export interface AggregatedAdmissionResponse {
  data: AggregatedAdmissionItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}
```

- [ ] **Step 2: Verify shared package builds**

Run: `cd packages/shared && pnpm build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/admission.ts
git commit -m "feat: add aggregated admission types for scores page redesign"
```

---

## Task 2: Shared Constants — Filter Options

**Files:**
- Create: `packages/shared/src/constants/admission.ts`
- Modify: `packages/shared/src/constants/index.ts`

- [ ] **Step 1: Create admission constants file**

Create `packages/shared/src/constants/admission.ts`:

```typescript
// 录取数据中实际存在的批次值（与 BATCHES 不同，这些来自实际数据）
export const ADMISSION_BATCHES = [
  { value: '本科批B段', label: '本科批B段' },
  { value: '本科批A段', label: '本科批A段' },
  { value: '本科提前批B段', label: '本科提前批B段' },
  { value: '本科提前批A段', label: '本科提前批A段' },
  { value: '本科批(高校专项)', label: '本科批(高校专项)' },
  { value: '高职(专科)批', label: '高职(专科)批' },
  { value: '高职(专科)提前批', label: '高职(专科)提前批' },
] as const;

// 科目（新高考 3+1+2 的首选科目）
export const ADMISSION_SUBJECTS = [
  { value: '物理', label: '物理类' },
  { value: '历史', label: '历史类' },
] as const;

// 招生类型（按数据量排序，分组展示）
export const RECRUIT_TYPES = [
  { value: '普通类本科', label: '普通类本科', group: '普通' },
  { value: '普通类高职(专科)', label: '普通类高职(专科)', group: '普通' },
  { value: '国家专项计划', label: '国家专项计划', group: '专项' },
  { value: '地方专项计划', label: '地方专项计划', group: '专项' },
  { value: '高校专项计划', label: '高校专项计划', group: '专项' },
  { value: '省级公费师范生', label: '省级公费师范生', group: '定向' },
  { value: '地方优师计划', label: '地方优师计划', group: '定向' },
  { value: '军事类', label: '军事类', group: '特殊' },
  { value: '公安类、司法类', label: '公安类、司法类', group: '特殊' },
] as const;
```

- [ ] **Step 2: Export from constants index**

Add to `packages/shared/src/constants/index.ts`:

```typescript
export * from './admission';
```

- [ ] **Step 3: Verify build**

Run: `cd packages/shared && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/admission.ts packages/shared/src/constants/index.ts
git commit -m "feat: add admission filter constants from actual data values"
```

---

## Task 3: Backend DTO — Query Validation

**Files:**
- Create: `apps/server/src/modules/admission/dto/find-aggregated.dto.ts`

- [ ] **Step 1: Create DTO with class-validator decorators**

```typescript
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FindAggregatedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(750)
  score?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rank?: number;

  @IsString()
  province: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  range?: number;

  @IsOptional()
  @IsString()
  batch?: string;

  @IsOptional()
  @IsIn(['物理', '历史'])
  subjects?: string;

  @IsOptional()
  @IsString()
  recruitType?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is985?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is211?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDoubleFirstClass?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/modules/admission/dto/find-aggregated.dto.ts
git commit -m "feat: add FindAggregatedDto for aggregated admission query"
```

---

## Task 4: Backend Service — Aggregated Query Logic

**Files:**
- Modify: `apps/server/src/modules/admission/admission.service.ts`

This is the core task. The method:
1. Queries all matching admission records across all years (score/rank range + filters)
2. Groups by (universityId, majorCode, groupCode, batch, recruitType) in application code
3. Paginates grouped results
4. Fetches enrollment plans only for the current page's items
5. Merges and returns

- [ ] **Step 1: Add the `findAggregated` method**

Replace the full file `apps/server/src/modules/admission/admission.service.ts` with:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { FindAggregatedDto } from './dto/find-aggregated.dto';

@Injectable()
export class AdmissionService {
  constructor(private prisma: PrismaService) {}

  async findByScore(query: {
    score: number;
    province: string;
    year?: number;
    range?: number;
  }) {
    const { score, province, year = new Date().getFullYear() - 1, range = 20 } = query;

    return this.prisma.admissionRecord.findMany({
      where: {
        province,
        year,
        majorMinScore: {
          gte: score - range,
          lte: score + range,
        },
      },
      include: {
        university: true,
        major: true,
      },
      orderBy: { majorMinScore: 'desc' },
      take: 100,
    });
  }

  async findByRank(query: {
    rank: number;
    province: string;
    year?: number;
    range?: number;
  }) {
    const { rank, province, year = new Date().getFullYear() - 1, range = 5000 } = query;

    return this.prisma.admissionRecord.findMany({
      where: {
        province,
        year,
        majorMinRank: {
          gte: rank - range,
          lte: rank + range,
        },
      },
      include: {
        university: true,
        major: true,
      },
      orderBy: { majorMinRank: 'asc' },
      take: 100,
    });
  }

  async getStatistics(province: string, year?: number) {
    const targetYear = year || new Date().getFullYear() - 1;

    const stats = await this.prisma.admissionRecord.aggregate({
      where: {
        province,
        year: targetYear,
      },
      _avg: {
        majorMinScore: true,
        majorMinRank: true,
      },
      _min: {
        majorMinScore: true,
        majorMinRank: true,
      },
      _max: {
        majorMinScore: true,
        majorMinRank: true,
      },
      _count: true,
    });

    return {
      year: targetYear,
      province,
      ...stats,
    };
  }

  async findAggregated(dto: FindAggregatedDto) {
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
      page = 1,
      pageSize = 20,
    } = dto;

    const scoreRange = range ?? 20;
    const rankRange = range ?? 5000;

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

    // 查询所有年份的匹配记录
    const records = await this.prisma.admissionRecord.findMany({
      where,
      include: {
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
    });

    // 按 (universityId, majorCode, groupCode, batch, recruitType) 分组
    const groups = new Map<string, {
      university: any;
      major: any;
      majorId: number;
      majorCode: string;
      majorName: string;
      groupCode: string;
      batch: string;
      subjects: string;
      recruitType: string;
      yearlyData: any[];
      currentPlan: any;
    }>();

    for (const record of records) {
      const key = [
        record.universityId,
        record.majorCode,
        record.groupCode,
        record.batch,
        record.recruitType,
      ].join(':');

      if (!groups.has(key)) {
        groups.set(key, {
          university: record.university,
          major: record.major,
          majorId: record.majorId,
          majorCode: record.majorCode,
          majorName: record.majorName,
          groupCode: record.groupCode,
          batch: record.batch,
          subjects: record.subjects,
          recruitType: record.recruitType,
          yearlyData: [],
          currentPlan: null,
        });
      }

      groups.get(key)!.yearlyData.push({
        year: record.year,
        majorMinScore: record.majorMinScore,
        majorMinRank: record.majorMinRank,
        majorAvgScore: record.majorAvgScore,
        majorAvgRank: record.majorAvgRank,
        majorAdmissionCount: record.majorAdmissionCount,
        groupMinScore: record.groupMinScore,
        groupMinRank: record.groupMinRank,
        groupAdmissionCount: record.groupAdmissionCount,
      });
    }

    // 按"最近年份最佳可用分数"排序：取每组最新年份的 majorMinScore 或 groupMinScore
    const allGroups = Array.from(groups.values());
    allGroups.sort((a, b) => {
      const aScore = this.getBestScore(a.yearlyData);
      const bScore = this.getBestScore(b.yearlyData);
      if (score) return (bScore ?? 0) - (aScore ?? 0); // 按分数降序
      return (aScore ?? Infinity) - (bScore ?? Infinity); // 按位次升序
    });

    const total = allGroups.length;
    const paginatedGroups = allGroups.slice((page - 1) * pageSize, page * pageSize);

    // 仅为当前页的项目查询招生计划
    if (paginatedGroups.length > 0) {
      const uniIds = [...new Set(paginatedGroups.map((g) => g.university.id))];
      const latestPlanYear = new Date().getFullYear(); // 当前年份的计划

      const plans = await this.prisma.enrollmentPlan.findMany({
        where: {
          province,
          year: latestPlanYear,
          universityId: { in: uniIds },
          ...(batch && { batch }),
          ...(subjects && { subjects }),
        },
        select: {
          universityId: true,
          majorCode: true,
          groupCode: true,
          batch: true,
          recruitType: true,
          majorName: true,
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

      // 用 Map 匹配招生计划到分组
      const planMap = new Map<string, any>();
      for (const plan of plans) {
        const key = [
          plan.universityId,
          plan.majorCode,
          plan.groupCode,
          plan.batch,
          plan.recruitType,
        ].join(':');
        planMap.set(key, plan);
      }

      for (const group of paginatedGroups) {
        const key = [
          group.university.id,
          group.majorCode,
          group.groupCode,
          group.batch,
          group.recruitType,
        ].join(':');
        group.currentPlan = planMap.get(key) ?? null;
      }
    }

    return {
      data: paginatedGroups,
      pagination: { page, pageSize, total },
    };
  }

  // 取最新年份的最佳可用分数（majorMinScore 优先，groupMinScore 兜底）
  private getBestScore(yearlyData: any[]): number | null {
    if (yearlyData.length === 0) return null;
    // yearlyData 已按年份降序排列
    for (const yd of yearlyData) {
      if (yd.majorMinScore != null) return yd.majorMinScore;
      if (yd.groupMinScore != null) return yd.groupMinScore;
    }
    return null;
  }
}
```

- [ ] **Step 2: Verify server compiles**

Run: `cd apps/server && pnpm build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/admission/admission.service.ts
git commit -m "feat: add findAggregated method for multi-year grouped admission query"
```

---

## Task 5: Backend Controller — New Endpoint

**Files:**
- Modify: `apps/server/src/modules/admission/admission.controller.ts`

- [ ] **Step 1: Add the aggregated endpoint**

Replace the full file:

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdmissionService } from './admission.service';
import { FindAggregatedDto } from './dto/find-aggregated.dto';

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
  @ApiOperation({ summary: '聚合查询录取数据（多年趋势+招生计划）' })
  async findAggregated(@Query() dto: FindAggregatedDto) {
    return this.admissionService.findAggregated(dto);
  }
}
```

- [ ] **Step 2: Verify server compiles**

Run: `cd apps/server && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/admission/admission.controller.ts
git commit -m "feat: add GET /admissions/aggregated endpoint"
```

---

## Task 6: Frontend Service — API Call

**Files:**
- Modify: `apps/web/src/services/admission.ts`

- [ ] **Step 1: Add aggregated query method**

Replace the full file:

```typescript
import api from './api';
import type {
  AggregatedAdmissionQuery,
  AggregatedAdmissionResponse,
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

  getAggregated(params: AggregatedAdmissionQuery): Promise<AggregatedAdmissionResponse> {
    return api.get('/admissions/aggregated', { params }) as any;
  },
};
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds (page.tsx may have issues since it's not updated yet — that's OK, only check the service file compiles)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/admission.ts
git commit -m "feat: add getAggregated API call to admission service"
```

---

## Task 7: Frontend — Expanded Row Component

**Files:**
- Create: `apps/web/src/app/(main)/scores/ExpandedAdmissionRow.tsx`

This component renders the detail view when a table row is expanded. It shows:
- Multi-year comparison table (all available metrics per year)
- Enrollment plan details (discipline eval, major ranking, honors, degree points, notes)

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { Tag } from 'antd';
import type {
  YearlyAdmissionData,
  CurrentEnrollmentPlan,
} from '@volunteer-helper/shared';

interface ExpandedAdmissionRowProps {
  yearlyData: YearlyAdmissionData[];
  currentPlan: CurrentEnrollmentPlan | null;
}

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-faint">-</span>;
  return (
    <span className="font-semibold text-text [font-variant-numeric:tabular-nums]">
      {value}
    </span>
  );
}

function RankCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-faint">-</span>;
  return (
    <span className="text-text-secondary [font-variant-numeric:tabular-nums]">
      {value.toLocaleString()}
    </span>
  );
}

export default function ExpandedAdmissionRow({
  yearlyData,
  currentPlan,
}: ExpandedAdmissionRowProps) {
  const sortedYears = [...yearlyData].sort((a, b) => b.year - a.year);

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 多年录取数据对比 */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
          历年录取数据
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-text-muted text-xs">
                <th className="text-left py-1.5 pr-4 font-medium">年份</th>
                <th className="text-right py-1.5 px-3 font-medium">专业最低分</th>
                <th className="text-right py-1.5 px-3 font-medium">专业最低位次</th>
                <th className="text-right py-1.5 px-3 font-medium">专业平均分</th>
                <th className="text-right py-1.5 px-3 font-medium">专业平均位次</th>
                <th className="text-right py-1.5 px-3 font-medium">专业录取数</th>
                <th className="text-right py-1.5 px-3 font-medium border-l border-border-subtle">组最低分</th>
                <th className="text-right py-1.5 px-3 font-medium">组最低位次</th>
                <th className="text-right py-1.5 pl-3 font-medium">组录取数</th>
              </tr>
            </thead>
            <tbody>
              {sortedYears.map((yd) => (
                <tr key={yd.year} className="border-t border-border-subtle">
                  <td className="py-1.5 pr-4 font-medium text-text">{yd.year}</td>
                  <td className="text-right py-1.5 px-3"><ScoreCell value={yd.majorMinScore} /></td>
                  <td className="text-right py-1.5 px-3"><RankCell value={yd.majorMinRank} /></td>
                  <td className="text-right py-1.5 px-3"><ScoreCell value={yd.majorAvgScore} /></td>
                  <td className="text-right py-1.5 px-3"><RankCell value={yd.majorAvgRank} /></td>
                  <td className="text-right py-1.5 px-3"><ScoreCell value={yd.majorAdmissionCount} /></td>
                  <td className="text-right py-1.5 px-3 border-l border-border-subtle"><ScoreCell value={yd.groupMinScore} /></td>
                  <td className="text-right py-1.5 px-3"><RankCell value={yd.groupMinRank} /></td>
                  <td className="text-right py-1.5 pl-3"><ScoreCell value={yd.groupAdmissionCount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 招生计划详情 */}
      {currentPlan && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
            招生计划详情（{new Date().getFullYear()}年）
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            {currentPlan.subjectRequirements && (
              <div>
                <span className="text-text-muted">选科要求：</span>
                <span className="text-text">{currentPlan.subjectRequirements}</span>
              </div>
            )}
            {currentPlan.disciplineEval && (
              <div>
                <span className="text-text-muted">学科评估：</span>
                <span className="text-text font-medium">{currentPlan.disciplineEval}</span>
              </div>
            )}
            {currentPlan.majorRanking && (
              <div>
                <span className="text-text-muted">专业排名：</span>
                <span className="text-text">第{currentPlan.majorRanking}名</span>
              </div>
            )}
            {currentPlan.majorHonor && (
              <div>
                <span className="text-text-muted">专业荣誉：</span>
                <span className="text-text">{currentPlan.majorHonor}</span>
              </div>
            )}
            {currentPlan.localMasterPoint && (
              <div className="col-span-2">
                <span className="text-text-muted">硕士点：</span>
                <span className="text-text">{currentPlan.localMasterPoint}</span>
              </div>
            )}
            {currentPlan.localDoctoralPoint && (
              <div className="col-span-2">
                <span className="text-text-muted">博士点：</span>
                <span className="text-text">{currentPlan.localDoctoralPoint}</span>
              </div>
            )}
            {currentPlan.planNotes && (
              <div className="col-span-full">
                <span className="text-text-muted">备注：</span>
                <span className="text-text-secondary text-xs">{currentPlan.planNotes}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {currentPlan.isNew && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0">新增专业</Tag>
            )}
            {currentPlan.isSinoForeign && (
              <Tag className="rounded-full border-0 bg-primary-fixed text-primary m-0">中外合作</Tag>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(main\)/scores/ExpandedAdmissionRow.tsx
git commit -m "feat: add ExpandedAdmissionRow component for detailed admission data"
```

---

## Task 8: Frontend — Scores Page Rewrite

**Files:**
- Modify: `apps/web/src/app/(main)/scores/page.tsx`

The page gets:
- Filter sidebar with batch, subjects, recruitType, university features
- Table with trend columns (近3年最低分/位次) and enrollment plan columns
- Expandable rows using ExpandedAdmissionRow
- Server-side pagination via the aggregated endpoint

- [ ] **Step 1: Rewrite the page**

Replace `apps/web/src/app/(main)/scores/page.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import {
  Form,
  InputNumber,
  Select,
  Table,
  Tag,
} from 'antd';
import {
  SearchOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import StatCard from '@/components/ui/StatCard';
import ExpandedAdmissionRow from './ExpandedAdmissionRow';
import { admissionService } from '@/services/admission';
import { useUserStore } from '@/stores/userStore';
import {
  PROVINCES,
  ADMISSION_BATCHES,
  ADMISSION_SUBJECTS,
  RECRUIT_TYPES,
} from '@volunteer-helper/shared';
import type {
  AggregatedAdmissionItem,
  AggregatedAdmissionQuery,
  YearlyAdmissionData,
} from '@volunteer-helper/shared';

const { Option } = Select;

// 取最佳可用分数：majorMinScore 优先，groupMinScore 兜底
function getBestScore(yd: YearlyAdmissionData): number | null {
  return yd.majorMinScore ?? yd.groupMinScore ?? null;
}

function getBestRank(yd: YearlyAdmissionData): number | null {
  return yd.majorMinRank ?? yd.groupMinRank ?? null;
}

// 渲染近3年趋势（数字 + 涨跌箭头）
function TrendCell({
  yearlyData,
  getValue,
  reverse = false,
}: {
  yearlyData: YearlyAdmissionData[];
  getValue: (yd: YearlyAdmissionData) => number | null;
  reverse?: boolean; // true = 数值变小是好事（位次）
}) {
  const sorted = [...yearlyData].sort((a, b) => b.year - a.year);
  const recent = sorted.slice(0, 3);

  if (recent.length === 0) return <span className="text-text-faint">-</span>;

  const values = recent.map((yd) => getValue(yd));
  const latestVal = values.find((v) => v != null);
  const prevVal = values.length >= 2 ? values.slice(1).find((v) => v != null) : null;

  if (latestVal == null) return <span className="text-text-faint">-</span>;

  let trendIcon = null;
  if (prevVal != null) {
    const diff = latestVal - prevVal;
    if (diff > 0) {
      const isGood = reverse;
      trendIcon = (
        <ArrowUpOutlined
          className={`text-xs ml-1 ${isGood ? 'text-safe' : 'text-rush'}`}
        />
      );
    } else if (diff < 0) {
      const isGood = !reverse;
      trendIcon = (
        <ArrowDownOutlined
          className={`text-xs ml-1 ${isGood ? 'text-safe' : 'text-rush'}`}
        />
      );
    } else {
      trendIcon = <MinusOutlined className="text-xs ml-1 text-text-faint" />;
    }
  }

  return (
    <div className="flex items-center justify-end">
      <span className="[font-variant-numeric:tabular-nums] text-text-secondary text-xs">
        {recent
          .map((yd) => {
            const v = getValue(yd);
            return v != null ? (v > 999 ? v.toLocaleString() : String(v)) : '-';
          })
          .join(' → ')}
      </span>
      {trendIcon}
    </div>
  );
}

// 筛选行组件（复用院校页模式）
function FilterRow({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string | undefined;
  onChange: (val: string | undefined) => void;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-xs text-text-muted w-[56px] shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
            !value
              ? 'bg-primary-fixed text-primary font-medium'
              : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
          }`}
          onClick={() => onChange(undefined)}
        >
          不限
        </button>
        {items.map((item) => (
          <button
            key={item.value}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
              value === item.value
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
            }`}
            onClick={() => onChange(value === item.value ? undefined : item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 院校特征多选过滤
function FeatureFilterRow({
  features,
  onChange,
}: {
  features: { is985?: boolean; is211?: boolean; isDoubleFirstClass?: boolean };
  onChange: (f: typeof features) => void;
}) {
  const toggleFeature = (key: keyof typeof features) => {
    onChange({ ...features, [key]: features[key] ? undefined : true });
  };
  const noneActive = !features.is985 && !features.is211 && !features.isDoubleFirstClass;
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-xs text-text-muted w-[56px] shrink-0 pt-1">层次</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
            noneActive
              ? 'bg-primary-fixed text-primary font-medium'
              : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
          }`}
          onClick={() => onChange({})}
        >
          不限
        </button>
        {[
          { key: 'is985' as const, label: '985' },
          { key: 'is211' as const, label: '211' },
          { key: 'isDoubleFirstClass' as const, label: '双一流' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors border-0 cursor-pointer ${
              features[key]
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-secondary hover:bg-primary-fixed hover:text-primary bg-transparent'
            }`}
            onClick={() => toggleFeature(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScoresPage() {
  const [form] = Form.useForm();
  const { examInfo } = useUserStore();
  const [searchMode, setSearchMode] = useState<'score' | 'rank'>('score');

  // 查询参数
  const [queryParams, setQueryParams] = useState<AggregatedAdmissionQuery | null>(null);

  // 过滤器状态
  const [filterBatch, setFilterBatch] = useState<string | undefined>();
  const [filterSubjects, setFilterSubjects] = useState<string | undefined>(
    examInfo.subjects || undefined,
  );
  const [filterRecruitType, setFilterRecruitType] = useState<string | undefined>();
  const [featureFilters, setFeatureFilters] = useState<{
    is985?: boolean;
    is211?: boolean;
    isDoubleFirstClass?: boolean;
  }>({});

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(20);

  // 构建完整查询参数
  const fullQuery: AggregatedAdmissionQuery | null = queryParams
    ? {
        ...queryParams,
        batch: filterBatch,
        subjects: filterSubjects,
        recruitType: filterRecruitType,
        ...featureFilters,
        page: currentPage,
        pageSize: currentPageSize,
      }
    : null;

  const { data: result, isLoading } = useQuery({
    queryKey: ['admission-aggregated', fullQuery],
    queryFn: () => admissionService.getAggregated(fullQuery!),
    enabled: !!fullQuery,
  });

  const { data: statistics } = useQuery({
    queryKey: ['admission-stats', examInfo.province],
    queryFn: () => admissionService.getStatistics(examInfo.province || '四川'),
    enabled: !!examInfo.province,
  });

  const handleSearch = (values: any) => {
    const params: AggregatedAdmissionQuery = {
      province: values.province,
      range: values.range,
    };
    if (searchMode === 'score') {
      params.score = values.score;
      if (!values.range) params.range = 20;
    } else {
      params.rank = values.rank;
      if (!values.range) params.range = 5000;
    }
    setQueryParams(params);
    setCurrentPage(1);
  };

  // 过滤器变更时重置分页
  const handleFilterChange = <T,>(setter: (v: T) => void) => (val: T) => {
    setter(val);
    setCurrentPage(1);
  };

  const columns = [
    {
      title: '院校',
      key: 'university',
      width: 200,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <div>
          <Link
            href={`/universities/${record.university.id}`}
            className="font-medium text-primary hover:text-primary-light hover:underline transition-colors"
          >
            {record.university.name}
          </Link>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-text-muted">
              {record.university.province}
            </span>
            {record.university.runningNature && record.university.runningNature !== '公办' && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0 text-[10px] leading-4 px-1.5">
                {record.university.runningNature}
              </Tag>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {record.university.is985 && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0 text-[10px] leading-4 px-1.5">
                985
              </Tag>
            )}
            {record.university.is211 && (
              <Tag className="rounded-full border-0 bg-primary-fixed text-primary m-0 text-[10px] leading-4 px-1.5">
                211
              </Tag>
            )}
            {record.university.isDoubleFirstClass && (
              <Tag className="rounded-full border-0 bg-safe-fixed text-safe m-0 text-[10px] leading-4 px-1.5">
                双一流
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '专业',
      key: 'major',
      width: 180,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <div>
          <Link
            href={`/majors/${record.major.id}`}
            className="text-text hover:text-primary transition-colors"
          >
            {record.majorName}
          </Link>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-text-muted">{record.major.category}</span>
            {record.major.softRating && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0 text-[10px] leading-4 px-1.5">
                {record.major.softRating}
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '批次',
      dataIndex: 'batch',
      key: 'batch',
      width: 100,
      render: (val: string) => (
        <span className="text-xs text-text-secondary">{val}</span>
      ),
    },
    {
      title: '近3年最低分',
      key: 'scoreTrend',
      width: 150,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <TrendCell yearlyData={record.yearlyData} getValue={getBestScore} />
      ),
    },
    {
      title: '近3年最低位次',
      key: 'rankTrend',
      width: 160,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <TrendCell yearlyData={record.yearlyData} getValue={getBestRank} reverse />
      ),
    },
    {
      title: '计划',
      key: 'planCount',
      width: 60,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <span className="[font-variant-numeric:tabular-nums]">
          {record.currentPlan?.planCount ?? '-'}
        </span>
      ),
    },
    {
      title: '学费',
      key: 'tuition',
      width: 70,
      render: (_: any, record: AggregatedAdmissionItem) => (
        <span className="text-xs text-text-secondary [font-variant-numeric:tabular-nums]">
          {record.currentPlan?.tuition
            ? `${(record.currentPlan.tuition / 1000).toFixed(0)}k`
            : '-'}
        </span>
      ),
    },
  ];

  return (
    <MainLayout>
      {/* 页面标题 */}
      <div className="mb-6">
        <h2 className="font-serif text-[22px] sm:text-[28px] font-semibold text-text mb-1">
          分数线查询
        </h2>
        <p className="text-[15px] text-text-tertiary">
          按分数或位次查询历年录取数据，查看多年趋势
        </p>
      </div>

      {/* 主布局: 侧边栏 + 内容 */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* 左侧侧边栏 */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-24">
          <div className="bg-surface rounded-xl p-6">
            <h3 className="text-sm font-sans font-semibold text-text mb-5">
              查询条件
            </h3>

            {/* 模式切换 */}
            <div className="flex gap-2 mb-6">
              <button
                className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-300 border-0 cursor-pointer ${
                  searchMode === 'score'
                    ? 'bg-gradient-to-br from-primary to-primary-light text-white shadow-glow-primary'
                    : 'bg-surface-dim text-text-secondary hover:bg-border'
                }`}
                onClick={() => setSearchMode('score')}
              >
                按分数查
              </button>
              <button
                className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-300 border-0 cursor-pointer ${
                  searchMode === 'rank'
                    ? 'bg-gradient-to-br from-primary to-primary-light text-white shadow-glow-primary'
                    : 'bg-surface-dim text-text-secondary hover:bg-border'
                }`}
                onClick={() => setSearchMode('rank')}
              >
                按位次查
              </button>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSearch}
              initialValues={{
                province: examInfo.province || '四川',
                score: examInfo.score,
                rank: examInfo.rank,
                range: searchMode === 'score' ? 20 : 5000,
              }}
            >
              <Form.Item
                name="province"
                label={
                  <span className="text-sm text-text-secondary font-medium">
                    省份
                  </span>
                }
                rules={[{ required: true }]}
              >
                <Select>
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>
                      {p.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {searchMode === 'score' ? (
                <Form.Item
                  name="score"
                  label={
                    <span className="text-sm text-text-secondary font-medium">
                      分数
                    </span>
                  }
                  rules={[{ required: true, message: '请输入分数' }]}
                >
                  <InputNumber
                    min={0}
                    max={750}
                    className="w-full"
                    placeholder="输入分数"
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="rank"
                  label={
                    <span className="text-sm text-text-secondary font-medium">
                      位次
                    </span>
                  }
                  rules={[{ required: true, message: '请输入位次' }]}
                >
                  <InputNumber
                    min={1}
                    className="w-full"
                    placeholder="输入位次"
                  />
                </Form.Item>
              )}

              <Form.Item
                name="range"
                label={
                  <span className="text-sm text-text-secondary font-medium">
                    浮动范围
                  </span>
                }
              >
                <InputNumber
                  min={1}
                  className="w-full"
                  placeholder={
                    searchMode === 'score' ? '分数浮动范围' : '位次浮动范围'
                  }
                />
              </Form.Item>

              <Form.Item className="mb-0">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl bg-gradient-to-br from-primary to-primary-light text-white font-semibold text-sm border-0 cursor-pointer flex items-center justify-center gap-2 shadow-glow-primary transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <SearchOutlined />
                  {isLoading ? '查询中...' : '查询'}
                </button>
              </Form.Item>
            </Form>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 min-w-0">
          {/* 统计卡片 */}
          {statistics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
              <StatCard
                label="数据总量"
                value={statistics._count ?? '-'}
                accentColor="primary"
              />
              <StatCard
                label="最高分"
                value={statistics._max?.majorMinScore || '-'}
                accentColor="rush"
              />
              <StatCard
                label="平均分"
                value={
                  statistics._avg?.majorMinScore
                    ? Math.round(statistics._avg.majorMinScore)
                    : '-'
                }
                accentColor="accent"
              />
              <StatCard
                label="最低分"
                value={statistics._min?.majorMinScore || '-'}
                accentColor="safe"
              />
            </div>
          )}

          {/* 筛选条件 */}
          {queryParams && (
            <div className="bg-surface rounded-xl px-5 py-3 mb-4 space-y-0.5">
              <FilterRow
                label="科目"
                items={ADMISSION_SUBJECTS as unknown as { value: string; label: string }[]}
                value={filterSubjects}
                onChange={handleFilterChange(setFilterSubjects)}
              />
              <FilterRow
                label="批次"
                items={ADMISSION_BATCHES as unknown as { value: string; label: string }[]}
                value={filterBatch}
                onChange={handleFilterChange(setFilterBatch)}
              />
              <FilterRow
                label="类型"
                items={RECRUIT_TYPES as unknown as { value: string; label: string }[]}
                value={filterRecruitType}
                onChange={handleFilterChange(setFilterRecruitType)}
              />
              <FeatureFilterRow
                features={featureFilters}
                onChange={handleFilterChange(setFeatureFilters)}
              />
            </div>
          )}

          {/* 结果表格 */}
          <div className="bg-surface rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <span className="font-sans font-semibold text-text text-sm">
                查询结果
                {result && (
                  <span className="text-text-muted font-normal ml-2">
                    共 {result.pagination.total} 个院校专业组合
                  </span>
                )}
              </span>
            </div>
            <Table
              columns={columns}
              dataSource={result?.data ?? []}
              rowKey={(record: AggregatedAdmissionItem) =>
                `${record.university.id}:${record.majorCode}:${record.groupCode}:${record.batch}`
              }
              loading={isLoading}
              expandable={{
                expandedRowRender: (record: AggregatedAdmissionItem) => (
                  <ExpandedAdmissionRow
                    yearlyData={record.yearlyData}
                    currentPlan={record.currentPlan}
                  />
                ),
              }}
              pagination={{
                current: currentPage,
                pageSize: currentPageSize,
                total: result?.pagination.total ?? 0,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                onChange: (p, ps) => {
                  setCurrentPage(p);
                  setCurrentPageSize(ps);
                },
              }}
              size="small"
              className="zhiyuanjia-table"
              scroll={{ x: 920 }}
            />
          </div>
        </div>
      </div>

      {/* 表格样式覆盖 */}
      <style jsx global>{`
        .zhiyuanjia-table .ant-table {
          background: transparent;
        }
        .zhiyuanjia-table .ant-table-thead > tr > th {
          background: var(--color-surface-dim) !important;
          border-bottom: 1px solid var(--color-border-subtle) !important;
          color: var(--color-text-secondary) !important;
          font-weight: 600;
          font-size: 13px;
        }
        .zhiyuanjia-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid var(--color-border-subtle) !important;
        }
        .zhiyuanjia-table .ant-table-tbody > tr:hover > td {
          background: var(--color-surface-dim) !important;
        }
        .zhiyuanjia-table .ant-table-expanded-row > td {
          background: var(--color-surface-dim) !important;
        }
      `}</style>
    </MainLayout>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(main\)/scores/page.tsx
git commit -m "feat: redesign scores page with multi-year trends, filters, and expandable detail rows"
```

---

## Self-Review Checklist

1. **Spec coverage:** All items from the revised proposal are covered:
   - Multi-year aggregation ✓ (Task 4, service groups across years)
   - Enrollment plan join ✓ (Task 4, second query for plans)
   - Trend display ✓ (Task 8, TrendCell component)
   - Expandable detail rows ✓ (Task 7, ExpandedAdmissionRow)
   - Filter sidebar ✓ (Task 8, FilterRow/FeatureFilterRow)
   - Server-side pagination ✓ (Task 4, paginated response)
   - Best-available score logic ✓ (Task 4, getBestScore; Task 8, getBestScore/getBestRank)

2. **Placeholder scan:** No TBD/TODO found. All code blocks complete.

3. **Type consistency:**
   - `AggregatedAdmissionItem` defined in Task 1, used in Task 7 and 8 ✓
   - `YearlyAdmissionData` defined in Task 1, used in Task 7 and 8 ✓
   - `CurrentEnrollmentPlan` defined in Task 1, used in Task 7 ✓
   - `AggregatedAdmissionQuery` defined in Task 1, used in Task 6 and 8 ✓
   - `FindAggregatedDto` defined in Task 3, used in Task 4 and 5 ✓
   - `getBestScore` private method in service (Task 4) matches frontend util (Task 8) ✓

4. **Data completeness awareness:**
   - OR query handles both majorMinScore and groupMinScore ✓
   - Display handles null values with `-` fallback ✓
   - Filing data excluded (70% null) ✓
   - majorMaxScore excluded (51% null) ✓
