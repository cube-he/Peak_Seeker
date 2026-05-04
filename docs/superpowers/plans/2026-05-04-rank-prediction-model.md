# 预估录取位次模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline ETL that computes per-(university, group, batch, recruitType, subjects) predicted minimum admission rank for the target year, expose it via the aggregated admission API, and produce a calibration report.

**Architecture:** Two new Prisma models (`ProvinceYearStat`, `RankPrediction`); one data-acquisition script (`seed-province-stats.ts`); one prediction ETL (`etl-predict-rank.ts`); one calibration script (`validate-rank-predictions.ts`); minimal API extension to `admission.service.findAggregated()`. Pure prediction functions are extracted to `apps/server/src/scripts/etl-predict-rank/` and unit-tested.

**Tech Stack:** NestJS + Prisma 7 + MariaDB adapter + Jest + ts-node. ETL scripts run from `apps/server/` via `pnpm ts-node scripts/<name>.ts`. Spec: `docs/superpowers/specs/2026-05-04-rank-prediction-model-design.md`.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/server/src/scripts/etl-predict-rank/subject-normalize.ts` | Map raw `examType`/`subjects` strings to canonical `物理`/`历史`/`全部` |
| Create | `apps/server/src/scripts/etl-predict-rank/predict.ts` | Pure functions: `subjectWeight`, `planWeight`, `predictMinRank` |
| Create | `apps/server/src/scripts/etl-predict-rank/predict.spec.ts` | Unit tests for pure functions |
| Create | `apps/server/scripts/etl-predict-rank.ts` | Main ETL: load data, compute, write `RankPrediction` |
| Create | `apps/server/scripts/seed-province-stats.ts` | Seed `ProvinceYearStat` from researched data |
| Create | `apps/server/scripts/fetch-province-stats/sources.md` | Researched source URLs + values cross-checked |
| Create | `apps/server/scripts/fetch-province-stats/seed-data.ts` | Typed const array of researched stat values |
| Create | `apps/server/scripts/validate-rank-predictions.ts` | Holdout calibration; output report |
| Create | `apps/server/prisma/migrations/<ts>_rank_prediction_models/migration.sql` | DDL for two new tables |
| Modify | `apps/server/prisma/schema.prisma` | Add `ProvinceYearStat` + `RankPrediction` models |
| Modify | `packages/shared/src/types/admission.ts` | Add `PredictedMinRank` type, extend `AggregatedAdmissionItem` |
| Modify | `apps/server/src/modules/admission/admission.service.ts` | Join `RankPrediction` into aggregated response |
| Create | `apps/server/test/admission.e2e-spec.ts` (or extend existing) | Verify `predictedMinRank` field present in response |
| Create | `config/rank-prediction.json` | `{ targetYear, switchTrigger, lastSwitchedAt, policyNote }` |
| Create | `docs/data-reports/2026-05-04-province-year-stats-source.md` | Per-data-point source log |
| Create | `docs/data-reports/2026-05-04-rank-prediction-validation.md` | Calibration MAE/MAPE report |
| Create | `docs/runbooks/rank-prediction.md` | When to switch targetYear, how to rerun ETL |

---

## Task 1: Subject Normalization Utility

**Files:**
- Create: `apps/server/src/scripts/etl-predict-rank/subject-normalize.ts`
- Create: `apps/server/src/scripts/etl-predict-rank/subject-normalize.spec.ts`

`score_segments.examType` likely contains values like `物理类`/`历史类`/`理科`/`文科`, while `admission_records.subjects` and `enrollment_plans.subjects` use `物理`/`历史`. Normalize all to a canonical 3-value enum before comparison.

- [ ] **Step 1: Confirm distinct values from DB (read-only)**

Run from `apps/server/`:
```bash
pnpm ts-node -e "
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
const p = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
(async () => {
  const a = await p.\$queryRaw\`SELECT DISTINCT exam_type FROM score_segments\`;
  const b = await p.\$queryRaw\`SELECT DISTINCT subjects FROM admission_records WHERE subjects != ''\`;
  const c = await p.\$queryRaw\`SELECT DISTINCT subjects FROM enrollment_plans WHERE subjects != ''\`;
  console.log('score_segments.exam_type:', a);
  console.log('admission_records.subjects:', b);
  console.log('enrollment_plans.subjects:', c);
  await p.\$disconnect();
})();
"
```
Expected output: list of distinct values. Record them in commit message of next step.

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/scripts/etl-predict-rank/subject-normalize.spec.ts`:
```typescript
import { normalizeSubject, CanonicalSubject } from './subject-normalize';

describe('normalizeSubject', () => {
  it.each([
    ['物理', '物理'],
    ['物理类', '物理'],
    ['理科', '物理'],
    ['历史', '历史'],
    ['历史类', '历史'],
    ['文科', '历史'],
    ['全部', '全部'],
    ['', null],
    ['综合改革', null],
    ['  物理  ', '物理'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSubject(input)).toBe(expected);
  });
});
```

- [ ] **Step 3: Run test — expect failure**

Run from `apps/server/`:
```bash
pnpm jest src/scripts/etl-predict-rank/subject-normalize.spec.ts
```
Expected: FAIL with module not found.

- [ ] **Step 4: Implement**

Create `apps/server/src/scripts/etl-predict-rank/subject-normalize.ts`:
```typescript
export type CanonicalSubject = '物理' | '历史' | '全部';

const MAP: Record<string, CanonicalSubject> = {
  '物理': '物理',
  '物理类': '物理',
  '理科': '物理',
  '历史': '历史',
  '历史类': '历史',
  '文科': '历史',
  '全部': '全部',
};

/**
 * Map raw subject/examType strings to canonical 3-value enum.
 * Returns null for unknown / unsupported values (e.g. "综合改革").
 */
export function normalizeSubject(raw: string | null | undefined): CanonicalSubject | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return MAP[trimmed] ?? null;
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm jest src/scripts/etl-predict-rank/subject-normalize.spec.ts
```
Expected: PASS, 10 cases.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/scripts/etl-predict-rank/subject-normalize.ts apps/server/src/scripts/etl-predict-rank/subject-normalize.spec.ts
git commit -m "feat: add subject normalization util for rank prediction etl"
```

If Step 1 revealed values not in the MAP (e.g. `普通类`), add them to the MAP and the test before committing.

---

## Task 2: Add Prisma Models — `ProvinceYearStat` and `RankPrediction`

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<TIMESTAMP>_rank_prediction_models/migration.sql`

- [ ] **Step 1: Append models to schema.prisma**

Add at end of `apps/server/prisma/schema.prisma` (before any closing comments):

```prisma
model ProvinceYearStat {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  province String @db.VarChar(50)
  year     Int    @db.SmallInt
  examType String @map("exam_type") @db.VarChar(50) // canonical: 物理 | 历史 | 全部

  registrants     Int? // 报名人数（教育考试院通报）
  examineesActual Int? @map("examinees_actual") // 实际参考人数
  rankedCount     Int? @map("ranked_count") // 一分一段最大累计（自推算）

  source      String   @db.VarChar(500)
  fetchedDate DateTime @map("fetched_date")
  notes       String?  @db.Text

  @@unique([province, year, examType])
  @@index([year])
  @@map("province_year_stats")
}

model RankPrediction {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  universityId Int        @map("university_id")
  university   University @relation(fields: [universityId], references: [id])

  groupCode   String @map("group_code") @db.VarChar(50)
  batch       String @db.VarChar(50)
  recruitType String @map("recruit_type") @db.VarChar(100)
  subjects    String @db.VarChar(50) // canonical 物理|历史
  targetYear  Int    @map("target_year") @db.SmallInt

  pointRank        Int? @map("point_rank")
  conservativeRank Int? @map("conservative_rank")
  optimisticRank   Int? @map("optimistic_rank")
  basisYears       Json @map("basis_years") // [2024, 2023, 2022]
  confidence       String @db.VarChar(20) // high|medium|low

  computedAt DateTime @default(now()) @map("computed_at")

  @@unique([universityId, groupCode, batch, recruitType, subjects, targetYear], name: "rank_pred_natural_key")
  @@index([targetYear, subjects])
  @@index([universityId])
  @@map("rank_predictions")
}
```

You also need to add the inverse relation field on `University`. In the existing `University` model, add this line near the other `@relation` lines:

```prisma
  rankPredictions RankPrediction[]
```

- [ ] **Step 2: Generate migration**

```bash
cd apps/server
pnpm prisma migrate dev --name rank_prediction_models --create-only
```
Expected: creates `prisma/migrations/<TIMESTAMP>_rank_prediction_models/migration.sql` with two `CREATE TABLE` statements. Inspect file.

- [ ] **Step 3: Apply migration**

```bash
pnpm prisma migrate dev
pnpm prisma generate
```
Expected: tables created in MariaDB, Prisma Client regenerated.

- [ ] **Step 4: Verify with raw query**

```bash
pnpm ts-node -e "
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
const p = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
(async () => {
  const a = await p.\$queryRaw\`SHOW TABLES LIKE 'province_year_stats'\`;
  const b = await p.\$queryRaw\`SHOW TABLES LIKE 'rank_predictions'\`;
  console.log('province_year_stats:', a);
  console.log('rank_predictions:', b);
  await p.\$disconnect();
})();
"
```
Expected: both tables listed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat: add ProvinceYearStat and RankPrediction Prisma models"
```

---

## Task 3: Research Province Registration Stats

**Files:**
- Create: `apps/server/scripts/fetch-province-stats/sources.md`
- Create: `apps/server/scripts/fetch-province-stats/seed-data.ts`

This task is **research-driven** — execute web research and transcribe findings into a typed const array. The actual numeric values come from cross-referenced sources.

- [ ] **Step 1: Conduct research**

For each `(year, examType)` in the matrix `years={2017..2025} × examType={物理, 历史, 全部}`, find:

- `registrants` — official 报名人数 (preferred from 四川省教育考试院 announcements)
- `examineesActual` — 实际参考人数 (often from 出分通告)

Use these starting search queries (run with WebSearch tool):
- `四川省 <YEAR> 高考报名人数`
- `四川省教育考试院 <YEAR> 高考报名 通报`
- `四川 <YEAR> 物理类 历史类 报名人数 site:sceea.cn`
- `四川 <YEAR> 高考 实际参考`

For 2017-2023 (old gaokao), `examType` is `理科` / `文科` instead of `物理` / `历史` — record actual original term in `notes`, but use canonical `物理`/`历史` in `examType` field per `subject-normalize.ts` mapping.

For each data point, find **at least 2 independent sources**. Record both URLs.

- [ ] **Step 2: Write `sources.md`**

Create `apps/server/scripts/fetch-province-stats/sources.md` with a table:

```markdown
# 四川省高考报名/参考人数 — 数据来源记录

抓取日期：2026-05-04
确认人：[engineer name]

| 年份 | 类别 | registrants | examineesActual | 来源1 | 来源2 | 备注 |
|---|---|---|---|---|---|---|
| 2025 | 物理 | ?? | ?? | https://www.sceea.cn/... | https://...edu.sc.gov.cn/... | (新高考首届) |
| 2025 | 历史 | ?? | ?? | ... | ... | |
| 2025 | 全部 | ?? | ?? | ... | ... | 全部=物理+历史 |
| 2024 | 理科 | ?? | ?? | ... | ... | (旧高考) |
| 2024 | 文科 | ?? | ?? | ... | ... | |
| 2024 | 全部 | ?? | ?? | ... | ... | |
... (rows for 2017-2023, each with 物理/历史/全部 OR 理科/文科/全部)
```

Replace `??` with actual numbers. Mark rows with conflicts (>1% diff between sources) with a ⚠️ in 备注 column and use the higher number as `registrants` (more conservative).

- [ ] **Step 3: Transcribe to typed const array**

Create `apps/server/scripts/fetch-province-stats/seed-data.ts`:

```typescript
import type { CanonicalSubject } from '../../src/scripts/etl-predict-rank/subject-normalize';

export interface ProvinceYearStatRow {
  province: '四川';
  year: number;
  examType: CanonicalSubject;
  registrants: number | null;
  examineesActual: number | null;
  source: string; // semicolon-separated URLs from sources.md
  notes: string | null;
}

/**
 * Researched values from sources.md (2026-05-04).
 * Each row cross-validated with at least 2 sources.
 * Fields rankedCount intentionally null here — populated by ETL from score_segments.
 */
export const PROVINCE_YEAR_STATS: ProvinceYearStatRow[] = [
  // 2025
  { province: '四川', year: 2025, examType: '物理', registrants: /*FILL*/, examineesActual: /*FILL*/, source: '/*FILL URL1*/; /*FILL URL2*/', notes: '新高考首届' },
  { province: '四川', year: 2025, examType: '历史', registrants: /*FILL*/, examineesActual: /*FILL*/, source: '...; ...', notes: '新高考首届' },
  { province: '四川', year: 2025, examType: '全部', registrants: /*FILL*/, examineesActual: /*FILL*/, source: '...; ...', notes: null },
  // 2024 (旧高考: 理科/文科 已归一化为 物理/历史)
  { province: '四川', year: 2024, examType: '物理', registrants: /*FILL*/, examineesActual: /*FILL*/, source: '...; ...', notes: '原 examType=理科' },
  { province: '四川', year: 2024, examType: '历史', registrants: /*FILL*/, examineesActual: /*FILL*/, source: '...; ...', notes: '原 examType=文科' },
  { province: '四川', year: 2024, examType: '全部', registrants: /*FILL*/, examineesActual: /*FILL*/, source: '...; ...', notes: null },
  // ... 2023, 2022, 2021, 2020, 2019, 2018, 2017 同结构
];
```

Replace every `/*FILL*/` with researched value (or `null` if unrecoverable + add `notes`). The TypeScript compiler will error on missing values, ensuring nothing is forgotten.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/server
pnpm tsc --noEmit -p .
```
Expected: no errors. If `null` is acceptable for some cells, the type allows it.

- [ ] **Step 5: Copy report to docs/**

Copy the final `sources.md` to `docs/data-reports/2026-05-04-province-year-stats-source.md` (rename for date sortability):
```bash
cp apps/server/scripts/fetch-province-stats/sources.md docs/data-reports/2026-05-04-province-year-stats-source.md
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/scripts/fetch-province-stats/ docs/data-reports/2026-05-04-province-year-stats-source.md
git commit -m "feat: research and seed province registration stats for 2017-2025"
```

---

## Task 4: Seed `ProvinceYearStat` Table

**Files:**
- Create: `apps/server/scripts/seed-province-stats.ts`

- [ ] **Step 1: Implement seed script**

Create `apps/server/scripts/seed-province-stats.ts`:
```typescript
/**
 * Seed province_year_stats from researched data + score_segments.
 * Idempotent (upsert).
 *
 * Usage: cd apps/server && pnpm ts-node scripts/seed-province-stats.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PROVINCE_YEAR_STATS } from './fetch-province-stats/seed-data';
import { normalizeSubject } from '../src/scripts/etl-predict-rank/subject-normalize';

async function computeRankedCount(prisma: PrismaClient, year: number, canonicalExamType: string): Promise<number | null> {
  // score_segments.exam_type may be 物理类/理科/etc — query with all aliases that map to this canonical
  const segments = await prisma.scoreSegment.findMany({
    where: { year, province: '四川' },
    select: { examType: true, cumulativeCount: true },
  });
  const matched = segments.filter(s => normalizeSubject(s.examType) === canonicalExamType);
  if (matched.length === 0) return null;
  return Math.max(...matched.map(s => s.cumulativeCount));
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });
  const fetchedDate = new Date();

  let upserted = 0;
  for (const row of PROVINCE_YEAR_STATS) {
    const rankedCount = await computeRankedCount(prisma, row.year, row.examType);
    await prisma.provinceYearStat.upsert({
      where: {
        province_year_examType: {
          province: row.province,
          year: row.year,
          examType: row.examType,
        },
      },
      create: {
        province: row.province,
        year: row.year,
        examType: row.examType,
        registrants: row.registrants,
        examineesActual: row.examineesActual,
        rankedCount,
        source: row.source,
        fetchedDate,
        notes: row.notes,
      },
      update: {
        registrants: row.registrants,
        examineesActual: row.examineesActual,
        rankedCount,
        source: row.source,
        fetchedDate,
        notes: row.notes,
      },
    });
    upserted++;
    console.log(`  upserted ${row.province}/${row.year}/${row.examType}: registrants=${row.registrants ?? 'null'}, rankedCount=${rankedCount ?? 'null'}`);
  }
  console.log(`[seed-province-stats] ${upserted} rows upserted`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run seed**

```bash
cd apps/server
pnpm ts-node scripts/seed-province-stats.ts
```
Expected: ~27 rows (9 years × 3 examTypes) upserted with no errors. `rankedCount` is non-null for years that have score_segments coverage.

- [ ] **Step 3: Sanity-check ratio**

```bash
pnpm ts-node -e "
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
const p = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
(async () => {
  const rows = await p.provinceYearStat.findMany({
    where: { province: '四川', examType: { in: ['物理', '历史'] } },
    orderBy: [{ year: 'desc' }, { examType: 'asc' }],
  });
  for (const r of rows) {
    const ratio = r.registrants && r.rankedCount ? (r.rankedCount / r.registrants).toFixed(3) : 'N/A';
    console.log(\`\${r.year} \${r.examType}: registrants=\${r.registrants ?? 'null'}, rankedCount=\${r.rankedCount ?? 'null'}, ratio=\${ratio}\`);
  }
  await p.\$disconnect();
})();
"
```
Expected: `rankedCount/registrants` ratios should be 0.85–1.00. Any outliers (< 0.80) indicate either bad research data or score_segments coverage gap; investigate and fix in `seed-data.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed-province-stats.ts
git commit -m "feat: seed province_year_stats from researched data"
```

---

## Task 5: Pure Functions — `subjectWeight` and `planWeight`

**Files:**
- Create: `apps/server/src/scripts/etl-predict-rank/predict.ts` (initial — will grow)
- Create: `apps/server/src/scripts/etl-predict-rank/predict.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/server/src/scripts/etl-predict-rank/predict.spec.ts`:
```typescript
import { subjectWeight, planWeight } from './predict';

describe('subjectWeight', () => {
  it('returns ratio of target/historical pools', () => {
    expect(subjectWeight(100000, 80000)).toBeCloseTo(1.25);
  });
  it('returns 1 when historical is null', () => {
    expect(subjectWeight(100000, null)).toBe(1);
  });
  it('returns 1 when target is null', () => {
    expect(subjectWeight(null, 80000)).toBe(1);
  });
  it('returns 1 when target is zero (degenerate)', () => {
    expect(subjectWeight(0, 80000)).toBe(1);
  });
});

describe('planWeight', () => {
  it('returns ratio of historical/target plans', () => {
    // more plans → looser → higher rank → multiply by P_y/P_t
    expect(planWeight(50, 100)).toBeCloseTo(0.5);
  });
  it('returns 1 when historical is null', () => {
    expect(planWeight(50, null)).toBe(1);
  });
  it('returns 1 when target is null', () => {
    expect(planWeight(null, 50)).toBe(1);
  });
  it('returns 1 when target is zero (degenerate)', () => {
    expect(planWeight(50, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/server
pnpm jest src/scripts/etl-predict-rank/predict.spec.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/server/src/scripts/etl-predict-rank/predict.ts`:
```typescript
/**
 * subjectWeight: how the target year's subject pool size compares to a historical year.
 * Larger N_target / N_historical → same rank in target year is "harder" (more competitors above).
 * Returns 1 (no adjustment) when either side is unknown.
 */
export function subjectWeight(N_target: number | null, N_historical: number | null): number {
  if (N_target == null || N_historical == null) return 1;
  if (N_target === 0 || N_historical === 0) return 1;
  return N_target / N_historical;
}

/**
 * planWeight: how the target year's plan count compares to a historical year.
 * More plans this year → admission threshold loosens → predicted rank moves toward larger numbers.
 * Use historical/target ratio so historical_rank × planWeight scales correctly.
 * Returns 1 (no adjustment) when either side is unknown.
 */
export function planWeight(P_historical: number | null, P_target: number | null): number {
  if (P_historical == null || P_target == null) return 1;
  if (P_historical === 0 || P_target === 0) return 1;
  return P_historical / P_target;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm jest src/scripts/etl-predict-rank/predict.spec.ts
```
Expected: PASS, 8 cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/scripts/etl-predict-rank/predict.ts apps/server/src/scripts/etl-predict-rank/predict.spec.ts
git commit -m "feat: add subjectWeight and planWeight pure functions"
```

---

## Task 6: Pure Function — `predictMinRank`

**Files:**
- Modify: `apps/server/src/scripts/etl-predict-rank/predict.ts`
- Modify: `apps/server/src/scripts/etl-predict-rank/predict.spec.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/server/src/scripts/etl-predict-rank/predict.spec.ts`:

```typescript
import { predictMinRank, type PredictInput } from './predict';

describe('predictMinRank', () => {
  // Helper: build a minimal valid input
  function makeInput(overrides: Partial<PredictInput> = {}): PredictInput {
    return {
      history: [
        { year: 2024, minRank: 5000 },
        { year: 2023, minRank: 5500 },
        { year: 2022, minRank: 6000 },
      ],
      planTarget: 100,
      planHistorical: { 2024: 100, 2023: 100, 2022: 100 },
      poolTarget: 200000,
      poolHistorical: { 2024: 200000, 2023: 190000, 2022: 180000 },
      poolTargetIsProxy: false,
      ...overrides,
    };
  }

  it('returns null when history < 2 years', () => {
    expect(predictMinRank(makeInput({ history: [{ year: 2024, minRank: 5000 }] }))).toBeNull();
  });

  it('returns null when both target pool and proxy missing', () => {
    expect(predictMinRank(makeInput({ poolTarget: null }))).toBeNull();
  });

  it('flat case (all weights = 1) → weighted avg', () => {
    const out = predictMinRank(makeInput());
    // weights 0.5/0.3/0.2 → 5000*.5 + 5500*.3 + 6000*.2 = 5350
    expect(out!.point).toBe(5350);
    expect(out!.optimistic).toBe(5000);
    expect(out!.conservative).toBe(6000);
    expect(out!.basisYears).toEqual([2024, 2023, 2022]);
    expect(out!.confidence).toBe('high');
  });

  it('subject pool grew → predicted rank grows proportionally', () => {
    // pool 2024 = 200000, target = 220000 → equiv 2024 = 5000 * 1.1 = 5500
    const out = predictMinRank(makeInput({ poolTarget: 220000 }));
    expect(out!.point).toBeGreaterThan(5350);
  });

  it('plan count doubled → predicted rank shifts higher (looser threshold)', () => {
    const out = predictMinRank(makeInput({ planTarget: 200 }));
    // each equiv multiplied by P_hist/P_t = 100/200 = 0.5 → all numbers half — rank decreases (smaller = harder)
    // wait: looser threshold means rank goes UP (number larger). The 0.5 multiplier means rank shrinks.
    // The convention: more plans this year ⇒ same percentile maps to smaller rank? No — more plans
    // means lower-ranked candidates also get in, so the *minimum admitted rank* moves to a LARGER number.
    // So historical_rank × (P_hist/P_t) being < historical_rank means *prediction goes lower (smaller number)*.
    // That's wrong direction. Reverse: planWeight should be P_target/P_historical.
    // ⚠ This test will fail and force fixing planWeight direction.
    expect(out!.point).toBeGreaterThan(5350);
  });

  it('only 2 years of history → confidence medium', () => {
    const out = predictMinRank(makeInput({
      history: [{ year: 2024, minRank: 5000 }, { year: 2023, minRank: 5500 }],
    }));
    expect(out!.confidence).toBe('medium');
  });

  it('proxy pool used → confidence medium', () => {
    const out = predictMinRank(makeInput({ poolTargetIsProxy: true }));
    expect(out!.confidence).toBe('medium');
  });

  it('plan target null → confidence low', () => {
    const out = predictMinRank(makeInput({ planTarget: null }));
    expect(out!.confidence).toBe('low');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm jest src/scripts/etl-predict-rank/predict.spec.ts
```
Expected: FAIL — `predictMinRank` not found AND the "plan count doubled" test will reveal a direction bug if `planWeight = P_h/P_t`.

- [ ] **Step 3: Re-derive direction**

When P_target > P_historical (more plans this year), the minimum admitted rank gets larger (worse-ranked candidates also accepted). So if historical = 5000 and we doubled plans, prediction should be ~10000.

So `equiv = historical_rank × (P_target / P_historical)`, i.e. **planWeight = P_target / P_historical**.

This contradicts what `planWeight()` returns (P_historical / P_target). **Fix `planWeight` direction** — update Task 5's tests to reflect:

```typescript
describe('planWeight', () => {
  it('more plans this year than historical → multiplier > 1 → rank moves higher', () => {
    expect(planWeight(50, 100)).toBeCloseTo(2); // P_h=50, P_t=100 → multiply historical_rank by 2
  });
  // ... update all other tests accordingly
});
```

Update `planWeight` impl:
```typescript
export function planWeight(P_historical: number | null, P_target: number | null): number {
  if (P_historical == null || P_target == null) return 1;
  if (P_historical === 0 || P_target === 0) return 1;
  return P_target / P_historical;
}
```

Also update spec doc comment in `apps/server/src/scripts/etl-predict-rank/predict.ts` to match. **And update the design doc**:
```bash
sed -i 's|planWeight = P_y / P_t|planWeight = P_t / P_y|g' docs/superpowers/specs/2026-05-04-rank-prediction-model-design.md
```
(Or edit manually — the formula in step 4 of section 3 should read `equiv = historical_rank × subjWeight × planWeight` where planWeight inverts.)

- [ ] **Step 4: Implement `predictMinRank`**

Append to `apps/server/src/scripts/etl-predict-rank/predict.ts`:
```typescript
export interface PredictInput {
  /** sorted desc by year, max 3 */
  history: Array<{ year: number; minRank: number }>;
  /** plan count for target year, null if unknown */
  planTarget: number | null;
  /** plan count for each historical year keyed by year */
  planHistorical: Record<number, number | null>;
  /** target year subject pool (canonical) */
  poolTarget: number | null;
  /** historical subject pool keyed by year */
  poolHistorical: Record<number, number | null>;
  /** true if poolTarget came from target-1 fallback */
  poolTargetIsProxy: boolean;
}

export interface PredictOutput {
  point: number;
  conservative: number;
  optimistic: number;
  basisYears: number[];
  confidence: 'high' | 'medium' | 'low';
}

const YEAR_WEIGHTS = [0.5, 0.3, 0.2];

export function predictMinRank(input: PredictInput): PredictOutput | null {
  const { history, planTarget, planHistorical, poolTarget, poolHistorical, poolTargetIsProxy } = input;

  if (history.length < 2) return null;
  if (poolTarget == null) return null;

  const equivRanks: number[] = [];
  for (const h of history) {
    const N_y = poolHistorical[h.year] ?? null;
    const P_y = planHistorical[h.year] ?? null;
    const sw = subjectWeight(poolTarget, N_y);
    const pw = planWeight(P_y, planTarget);
    equivRanks.push(h.minRank * sw * pw);
  }

  const usedWeights = YEAR_WEIGHTS.slice(0, equivRanks.length);
  const totalWeight = usedWeights.reduce((a, b) => a + b, 0);
  const point = equivRanks.reduce((acc, v, i) => acc + v * usedWeights[i], 0) / totalWeight;

  const confidence: PredictOutput['confidence'] =
    history.length === 3 && !poolTargetIsProxy && planTarget != null ? 'high'
    : history.length >= 2 && !poolTargetIsProxy && planTarget != null ? 'medium'
    : !poolTargetIsProxy ? 'medium'
    : 'low';

  return {
    point: Math.round(point),
    conservative: Math.round(Math.max(...equivRanks)),
    optimistic: Math.round(Math.min(...equivRanks)),
    basisYears: history.map(h => h.year),
    confidence,
  };
}
```

- [ ] **Step 5: Run — expect pass**

```bash
pnpm jest src/scripts/etl-predict-rank/predict.spec.ts
```
Expected: PASS, all cases. If "plan count doubled" still fails, re-check direction in `planWeight`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/scripts/etl-predict-rank/predict.ts apps/server/src/scripts/etl-predict-rank/predict.spec.ts docs/superpowers/specs/2026-05-04-rank-prediction-model-design.md
git commit -m "feat: add predictMinRank pure function with weighted history"
```

---

## Task 7: ETL Main Script — `etl-predict-rank.ts`

**Files:**
- Create: `apps/server/scripts/etl-predict-rank.ts`

This wires DB queries → pure functions → `RankPrediction` upserts.

- [ ] **Step 1: Implement**

Create `apps/server/scripts/etl-predict-rank.ts`:

```typescript
/**
 * Compute RankPrediction for every (uniId, groupCode, batch, recruitType, subjects)
 * combination with sufficient history, for the configured target year.
 *
 * Usage: cd apps/server && pnpm ts-node scripts/etl-predict-rank.ts [targetYear]
 *        Defaults to value in config/rank-prediction.json (Task 12).
 */
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { normalizeSubject } from '../src/scripts/etl-predict-rank/subject-normalize';
import { predictMinRank, type PredictInput } from '../src/scripts/etl-predict-rank/predict';

const PROVINCE = '四川';
const HISTORY_YEARS = 3;

function getTargetYear(): number {
  const cliYear = process.argv[2] ? Number(process.argv[2]) : null;
  if (cliYear) return cliYear;
  const configPath = path.resolve(__dirname, '../../../config/rank-prediction.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')).targetYear;
  }
  return new Date().getFullYear();
}

interface PoolMap { [year: number]: number | null }

async function loadPools(prisma: PrismaClient): Promise<{ 物理: PoolMap; 历史: PoolMap }> {
  const stats = await prisma.provinceYearStat.findMany({
    where: { province: PROVINCE, examType: { in: ['物理', '历史'] } },
  });
  const out: { 物理: PoolMap; 历史: PoolMap } = { 物理: {}, 历史: {} };
  for (const s of stats) {
    const subj = s.examType as '物理' | '历史';
    // prefer registrants, fall back to rankedCount
    out[subj][s.year] = s.registrants ?? s.rankedCount ?? null;
  }
  return out;
}

interface HistoryKey {
  universityId: number;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: '物理' | '历史';
}
interface HistoryRow extends HistoryKey {
  year: number;
  groupMinRank: number;
}

function keyOf(k: HistoryKey): string {
  return [k.universityId, k.groupCode, k.batch, k.recruitType, k.subjects].join('|');
}

async function loadHistory(prisma: PrismaClient, targetYear: number): Promise<Map<string, HistoryRow[]>> {
  const records = await prisma.admissionRecord.findMany({
    where: {
      province: PROVINCE,
      year: { gte: targetYear - HISTORY_YEARS, lt: targetYear },
      groupMinRank: { not: null },
    },
    select: {
      universityId: true,
      groupCode: true,
      batch: true,
      recruitType: true,
      subjects: true,
      year: true,
      groupMinRank: true,
    },
  });
  // group by (uni, group, batch, recruitType, subjects); for each year keep one row
  const grouped = new Map<string, Map<number, HistoryRow>>();
  for (const r of records) {
    const subj = normalizeSubject(r.subjects);
    if (subj !== '物理' && subj !== '历史') continue;
    const k: HistoryKey = {
      universityId: r.universityId,
      groupCode: r.groupCode,
      batch: r.batch,
      recruitType: r.recruitType,
      subjects: subj,
    };
    const key = keyOf(k);
    if (!grouped.has(key)) grouped.set(key, new Map());
    const yearMap = grouped.get(key)!;
    if (!yearMap.has(r.year)) {
      yearMap.set(r.year, { ...k, year: r.year, groupMinRank: r.groupMinRank! });
    }
  }
  // flatten to sorted arrays (desc by year)
  const out = new Map<string, HistoryRow[]>();
  for (const [key, yearMap] of grouped) {
    const arr = [...yearMap.values()].sort((a, b) => b.year - a.year).slice(0, HISTORY_YEARS);
    out.set(key, arr);
  }
  return out;
}

async function loadPlans(prisma: PrismaClient, years: number[]): Promise<Map<string, Map<number, number>>> {
  const plans = await prisma.enrollmentPlan.findMany({
    where: {
      province: PROVINCE,
      year: { in: years },
      groupPlanCount: { not: null },
    },
    select: {
      universityId: true,
      groupCode: true,
      batch: true,
      recruitType: true,
      subjects: true,
      year: true,
      groupPlanCount: true,
    },
  });
  const out = new Map<string, Map<number, number>>();
  for (const p of plans) {
    const subj = normalizeSubject(p.subjects);
    if (subj !== '物理' && subj !== '历史') continue;
    const key = keyOf({
      universityId: p.universityId,
      groupCode: p.groupCode,
      batch: p.batch,
      recruitType: p.recruitType,
      subjects: subj,
    });
    if (!out.has(key)) out.set(key, new Map());
    // groupPlanCount may differ between rows of same group (shouldn't, but defensive — take first)
    const yearMap = out.get(key)!;
    if (!yearMap.has(p.year)) yearMap.set(p.year, p.groupPlanCount!);
  }
  return out;
}

async function main() {
  const targetYear = getTargetYear();
  console.log(`[etl-predict-rank] targetYear=${targetYear}`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  console.log('Loading pool stats...');
  const pools = await loadPools(prisma);

  console.log('Loading admission history...');
  const historyByKey = await loadHistory(prisma, targetYear);
  console.log(`  ${historyByKey.size} unique (uni,group,batch,recruitType,subjects) keys`);

  console.log('Loading enrollment plans...');
  const yearsNeeded = [targetYear, ...Array.from({ length: HISTORY_YEARS }, (_, i) => targetYear - 1 - i)];
  const plansByKey = await loadPlans(prisma, yearsNeeded);

  let written = 0;
  let skippedInsufficient = 0;
  let skippedNoPool = 0;
  for (const [key, history] of historyByKey) {
    if (history.length < 2) { skippedInsufficient++; continue; }

    const sample = history[0];
    const subj = sample.subjects;
    let poolTarget = pools[subj][targetYear] ?? null;
    let poolTargetIsProxy = false;
    if (poolTarget == null) {
      poolTarget = pools[subj][targetYear - 1] ?? null;
      poolTargetIsProxy = poolTarget != null;
    }
    if (poolTarget == null) { skippedNoPool++; continue; }

    const planMap = plansByKey.get(key) ?? new Map();
    const planTarget = planMap.get(targetYear) ?? null;
    const planHistorical: Record<number, number | null> = {};
    const poolHistorical: Record<number, number | null> = {};
    for (const h of history) {
      planHistorical[h.year] = planMap.get(h.year) ?? null;
      poolHistorical[h.year] = pools[subj][h.year] ?? null;
    }

    const input: PredictInput = {
      history: history.map(h => ({ year: h.year, minRank: h.groupMinRank })),
      planTarget,
      planHistorical,
      poolTarget,
      poolHistorical,
      poolTargetIsProxy,
    };

    const result = predictMinRank(input);
    if (!result) { skippedInsufficient++; continue; }

    await prisma.rankPrediction.upsert({
      where: {
        rank_pred_natural_key: {
          universityId: sample.universityId,
          groupCode: sample.groupCode,
          batch: sample.batch,
          recruitType: sample.recruitType,
          subjects: sample.subjects,
          targetYear,
        },
      },
      create: {
        universityId: sample.universityId,
        groupCode: sample.groupCode,
        batch: sample.batch,
        recruitType: sample.recruitType,
        subjects: sample.subjects,
        targetYear,
        pointRank: result.point,
        conservativeRank: result.conservative,
        optimisticRank: result.optimistic,
        basisYears: result.basisYears as any,
        confidence: result.confidence,
      },
      update: {
        pointRank: result.point,
        conservativeRank: result.conservative,
        optimisticRank: result.optimistic,
        basisYears: result.basisYears as any,
        confidence: result.confidence,
        computedAt: new Date(),
      },
    });
    written++;
    if (written % 1000 === 0) console.log(`  written ${written}`);
  }

  console.log(`[etl-predict-rank] done: written=${written}, skippedInsufficient=${skippedInsufficient}, skippedNoPool=${skippedNoPool}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run on real data**

```bash
cd apps/server
pnpm ts-node scripts/etl-predict-rank.ts 2025
```
Expected: completes without error. Approximate output: written ≈ 20000-40000 (depends on data); skippedInsufficient and skippedNoPool both small.

- [ ] **Step 3: Sanity-check predictions**

```bash
pnpm ts-node -e "
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
const p = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
(async () => {
  const total = await p.rankPrediction.count();
  const byConfidence = await p.rankPrediction.groupBy({ by: ['confidence'], _count: true });
  console.log('total:', total);
  console.log('by confidence:', byConfidence);
  const sample = await p.rankPrediction.findMany({ take: 5, include: { university: true } });
  for (const s of sample) {
    console.log(\`\${s.university.name} \${s.groupCode}/\${s.batch}/\${s.subjects}: point=\${s.pointRank}, conf=\${s.confidence}, basis=\${JSON.stringify(s.basisYears)}\`);
  }
  await p.\$disconnect();
})();
"
```
Expected: total > 0; confidence distribution skewed to `high` (most rows have full 3-year history). Sample rows have plausible point ranks within historical-rank ballpark.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/etl-predict-rank.ts
git commit -m "feat: add rank prediction etl script"
```

---

## Task 8: Calibration Script — `validate-rank-predictions.ts`

**Files:**
- Create: `apps/server/scripts/validate-rank-predictions.ts`

Holdout-style calibration: hide 2024 actuals, run model on 2022/2023 history → predict 2024 → compare with real 2024 minRanks.

- [ ] **Step 1: Implement**

Create `apps/server/scripts/validate-rank-predictions.ts`:

```typescript
/**
 * Holdout calibration: predict 2024 using 2022/2023 history, compare to actual 2024.
 * Outputs Markdown report.
 *
 * Usage: cd apps/server && pnpm ts-node scripts/validate-rank-predictions.ts > /tmp/report.md
 *        Or with redirect: pnpm ts-node scripts/validate-rank-predictions.ts \
 *          > ../../docs/data-reports/2026-05-04-rank-prediction-validation.md
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { normalizeSubject } from '../src/scripts/etl-predict-rank/subject-normalize';
import { predictMinRank, type PredictInput } from '../src/scripts/etl-predict-rank/predict';

const PROVINCE = '四川';
const HOLDOUT_YEAR = 2024;

interface ValidationCase {
  universityId: number;
  uniName: string;
  is985: boolean;
  is211: boolean;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: '物理' | '历史';
  actual: number;
  predicted: number;
  confidence: string;
  error: number; // predicted - actual
  absError: number;
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(cases: ValidationCase[]): { mae: number; mape: number; rmse: number; medAE: number; n: number } {
  if (cases.length === 0) return { mae: 0, mape: 0, rmse: 0, medAE: 0, n: 0 };
  const mae = cases.reduce((a, c) => a + c.absError, 0) / cases.length;
  const mape = cases.reduce((a, c) => a + c.absError / c.actual, 0) / cases.length * 100;
  const rmse = Math.sqrt(cases.reduce((a, c) => a + c.error * c.error, 0) / cases.length);
  return { mae: Math.round(mae), mape: +mape.toFixed(2), rmse: Math.round(rmse), medAE: Math.round(median(cases.map(c => c.absError))), n: cases.length };
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  // Load 2024 actuals (target)
  const actuals = await prisma.admissionRecord.findMany({
    where: { province: PROVINCE, year: HOLDOUT_YEAR, groupMinRank: { not: null } },
    select: { universityId: true, groupCode: true, batch: true, recruitType: true, subjects: true, groupMinRank: true },
  });

  // Load 2022/2023 history for prediction
  const history = await prisma.admissionRecord.findMany({
    where: { province: PROVINCE, year: { in: [2022, 2023] }, groupMinRank: { not: null } },
    select: { universityId: true, groupCode: true, batch: true, recruitType: true, subjects: true, year: true, groupMinRank: true },
  });

  // Plans for all 3 years
  const plans = await prisma.enrollmentPlan.findMany({
    where: { province: PROVINCE, year: { in: [2022, 2023, 2024] }, groupPlanCount: { not: null } },
    select: { universityId: true, groupCode: true, batch: true, recruitType: true, subjects: true, year: true, groupPlanCount: true },
  });

  // Pools (registrants + rankedCount fallback)
  const stats = await prisma.provinceYearStat.findMany({
    where: { province: PROVINCE, examType: { in: ['物理', '历史'] } },
  });
  const pools: { 物理: Record<number, number | null>; 历史: Record<number, number | null> } = { 物理: {}, 历史: {} };
  for (const s of stats) pools[s.examType as '物理' | '历史'][s.year] = s.registrants ?? s.rankedCount ?? null;

  // Index helpers
  function key(r: { universityId: number; groupCode: string; batch: string; recruitType: string; subjects: string }) {
    const subj = normalizeSubject(r.subjects);
    if (subj !== '物理' && subj !== '历史') return null;
    return [r.universityId, r.groupCode, r.batch, r.recruitType, subj].join('|');
  }

  const histByKey = new Map<string, Array<{ year: number; minRank: number; subjects: '物理' | '历史' }>>();
  for (const h of history) {
    const k = key(h); if (!k) continue;
    if (!histByKey.has(k)) histByKey.set(k, []);
    histByKey.get(k)!.push({ year: h.year, minRank: h.groupMinRank!, subjects: normalizeSubject(h.subjects) as '物理' | '历史' });
  }
  const planByKey = new Map<string, Map<number, number>>();
  for (const p of plans) {
    const k = key(p); if (!k) continue;
    if (!planByKey.has(k)) planByKey.set(k, new Map());
    if (!planByKey.get(k)!.has(p.year)) planByKey.get(k)!.set(p.year, p.groupPlanCount!);
  }

  // Universities for tier breakdown
  const uniMap = new Map<number, { name: string; is985: boolean; is211: boolean }>();
  for (const u of await prisma.university.findMany({ select: { id: true, name: true, is985: true, is211: true } })) {
    uniMap.set(u.id, u);
  }

  // Build validation cases
  const cases: ValidationCase[] = [];
  for (const a of actuals) {
    const subj = normalizeSubject(a.subjects);
    if (subj !== '物理' && subj !== '历史') continue;
    const k = key(a)!;
    const hist = histByKey.get(k);
    if (!hist || hist.length < 2) continue;

    const planMap = planByKey.get(k) ?? new Map();
    const planTarget = planMap.get(HOLDOUT_YEAR) ?? null;
    const poolTarget = pools[subj][HOLDOUT_YEAR];
    if (poolTarget == null) continue;

    const input: PredictInput = {
      history: hist.sort((x, y) => y.year - x.year).map(h => ({ year: h.year, minRank: h.minRank })),
      planTarget,
      planHistorical: { 2022: planMap.get(2022) ?? null, 2023: planMap.get(2023) ?? null },
      poolTarget,
      poolHistorical: { 2022: pools[subj][2022], 2023: pools[subj][2023] },
      poolTargetIsProxy: false,
    };
    const result = predictMinRank(input);
    if (!result) continue;

    const u = uniMap.get(a.universityId);
    cases.push({
      universityId: a.universityId,
      uniName: u?.name ?? `#${a.universityId}`,
      is985: u?.is985 ?? false,
      is211: u?.is211 ?? false,
      groupCode: a.groupCode,
      batch: a.batch,
      recruitType: a.recruitType,
      subjects: subj as '物理' | '历史',
      actual: a.groupMinRank!,
      predicted: result.point,
      confidence: result.confidence,
      error: result.point - a.groupMinRank!,
      absError: Math.abs(result.point - a.groupMinRank!),
    });
  }

  // Output Markdown
  const lines: string[] = [];
  lines.push(`# 预估位次模型校准报告 — 2024 holdout`);
  lines.push(``);
  lines.push(`**生成时间**: ${new Date().toISOString()}`);
  lines.push(`**Holdout 年份**: ${HOLDOUT_YEAR}`);
  lines.push(`**训练集**: 2022/2023 admission_records + 2024 plans + 2024 ProvinceYearStat`);
  lines.push(`**样本数**: ${cases.length}`);
  lines.push(``);
  const overall = summarize(cases);
  lines.push(`## 整体指标`);
  lines.push(``);
  lines.push(`| 指标 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| MAE | ${overall.mae} |`);
  lines.push(`| MAPE | ${overall.mape}% |`);
  lines.push(`| RMSE | ${overall.rmse} |`);
  lines.push(`| Median AE | ${overall.medAE} |`);
  lines.push(`| n | ${overall.n} |`);
  lines.push(``);

  lines.push(`## 按层次分组`);
  lines.push(``);
  lines.push(`| 层次 | n | MAE | MAPE | Median AE |`);
  lines.push(`|---|---|---|---|---|`);
  const tiers: Array<[string, (c: ValidationCase) => boolean]> = [
    ['985', c => c.is985],
    ['211 (非 985)', c => c.is211 && !c.is985],
    ['普通本科', c => !c.is985 && !c.is211 && !c.batch.includes('专科')],
    ['专科', c => c.batch.includes('专科')],
  ];
  for (const [name, pred] of tiers) {
    const sub = cases.filter(pred);
    const s = summarize(sub);
    lines.push(`| ${name} | ${s.n} | ${s.mae} | ${s.mape}% | ${s.medAE} |`);
  }
  lines.push(``);

  lines.push(`## 按选科分组`);
  lines.push(``);
  lines.push(`| 选科 | n | MAE | MAPE |`);
  lines.push(`|---|---|---|---|`);
  for (const subj of ['物理', '历史'] as const) {
    const s = summarize(cases.filter(c => c.subjects === subj));
    lines.push(`| ${subj} | ${s.n} | ${s.mae} | ${s.mape}% |`);
  }
  lines.push(``);

  lines.push(`## 按位次段分组`);
  lines.push(``);
  lines.push(`| 位次段 | n | MAE | MAPE |`);
  lines.push(`|---|---|---|---|`);
  const buckets: Array<[string, (r: number) => boolean]> = [
    ['0–10000', r => r < 10000],
    ['10000–50000', r => r >= 10000 && r < 50000],
    ['50000–100000', r => r >= 50000 && r < 100000],
    ['100000+', r => r >= 100000],
  ];
  for (const [name, pred] of buckets) {
    const s = summarize(cases.filter(c => pred(c.actual)));
    lines.push(`| ${name} | ${s.n} | ${s.mae} | ${s.mape}% |`);
  }
  lines.push(``);

  lines.push(`## 按 confidence 分组`);
  lines.push(``);
  lines.push(`| confidence | n | MAE | MAPE |`);
  lines.push(`|---|---|---|---|`);
  for (const conf of ['high', 'medium', 'low'] as const) {
    const s = summarize(cases.filter(c => c.confidence === conf));
    lines.push(`| ${conf} | ${s.n} | ${s.mae} | ${s.mape}% |`);
  }
  lines.push(``);

  lines.push(`## Top 20 误差最大案例`);
  lines.push(``);
  lines.push(`| 院校 | 组 | 批次 | 选科 | actual | predicted | absError |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const c of [...cases].sort((a, b) => b.absError - a.absError).slice(0, 20)) {
    lines.push(`| ${c.uniName} | ${c.groupCode} | ${c.batch} | ${c.subjects} | ${c.actual} | ${c.predicted} | ${c.absError} |`);
  }

  console.log(lines.join('\n'));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Generate report**

```bash
cd apps/server
pnpm ts-node scripts/validate-rank-predictions.ts > ../../docs/data-reports/2026-05-04-rank-prediction-validation.md
```
Expected: file created with sections "整体指标" through "Top 20 误差最大案例". Inspect.

- [ ] **Step 3: Evaluate against acceptance thresholds**

Read `docs/data-reports/2026-05-04-rank-prediction-validation.md`:
- Overall MAE < 3000 ✓
- High-confidence MAE < 1500 ✓
- 0-10000 段 MAE < 800 ✓ (high-rank candidates need tighter)

If thresholds fail, **STOP** — do not proceed to API integration. Report failures and decide:
1. Improve model (return to Task 5/6 with refinements)
2. Lower thresholds (revise spec)
3. Block染色 in spec-1 (model unusable, only show numbers in details)

If thresholds pass, continue.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/validate-rank-predictions.ts docs/data-reports/2026-05-04-rank-prediction-validation.md
git commit -m "feat: add rank prediction calibration script and 2024 validation report"
```

---

## Task 9: Shared Type — `PredictedMinRank`

**Files:**
- Modify: `packages/shared/src/types/admission.ts`

- [ ] **Step 1: Append type**

Insert before the `AggregatedAdmissionItem` interface in `packages/shared/src/types/admission.ts`:

```typescript
// 预估当年最低录取位次（来自 spec-0 模型）
export interface PredictedMinRank {
  point: number;
  conservative: number;
  optimistic: number;
  basisYears: number[];
  confidence: 'high' | 'medium' | 'low';
  targetYear: number;
}
```

Then add the field to `AggregatedAdmissionItem`:
```typescript
export interface AggregatedAdmissionItem {
  // ... existing fields
  yearlyData: YearlyAdmissionData[];
  currentPlan: CurrentEnrollmentPlan | null;
  supplementary: SupplementaryInfo | null;
  predictedMinRank: PredictedMinRank | null; // <-- ADD
}
```

- [ ] **Step 2: Build shared package**

```bash
cd packages/shared
pnpm build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/admission.ts
git commit -m "feat: add PredictedMinRank type to shared admission types"
```

---

## Task 10: Backend API — Join `RankPrediction` in `findAggregated`

**Files:**
- Modify: `apps/server/src/modules/admission/admission.service.ts`

- [ ] **Step 1: Locate findAggregated**

Open `apps/server/src/modules/admission/admission.service.ts` and find the `findAggregated` method (~line 80+).

- [ ] **Step 2: After computing `paginatedGroups`, fetch predictions**

Inside `findAggregated`, after the existing `paginatedGroups` slicing and **before** the final return, add:

```typescript
    // Fetch predictions for the current page's groups
    if (paginatedGroups.length > 0) {
      const targetYear = await getTargetYear();  // helper added below
      const keys = paginatedGroups.map(g => ({
        universityId: g.university.id,
        groupCode: g.groupCode,
        batch: g.batch,
        recruitType: g.recruitType,
        subjects: g.subjects,  // already canonical from admission_records
        targetYear,
      }));

      const preds = await this.prisma.rankPrediction.findMany({
        where: {
          targetYear,
          OR: keys.map(k => ({
            universityId: k.universityId,
            groupCode: k.groupCode,
            batch: k.batch,
            recruitType: k.recruitType,
            subjects: k.subjects,
          })),
        },
      });

      const predMap = new Map<string, typeof preds[number]>();
      for (const p of preds) {
        const k = [p.universityId, p.groupCode, p.batch, p.recruitType, p.subjects].join('|');
        predMap.set(k, p);
      }

      for (const g of paginatedGroups) {
        const k = [g.university.id, g.groupCode, g.batch, g.recruitType, g.subjects].join('|');
        const pred = predMap.get(k);
        (g as any).predictedMinRank = pred ? {
          point: pred.pointRank,
          conservative: pred.conservativeRank,
          optimistic: pred.optimisticRank,
          basisYears: pred.basisYears as number[],
          confidence: pred.confidence,
          targetYear: pred.targetYear,
        } : null;
      }
    }
```

- [ ] **Step 3: Add `getTargetYear` helper**

At the top of the file (just after the imports), add:

```typescript
import * as fs from 'fs';
import * as path from 'path';

let _cachedTargetYear: number | null = null;
async function getTargetYear(): Promise<number> {
  if (_cachedTargetYear !== null) return _cachedTargetYear;
  const configPath = path.resolve(process.cwd(), 'config/rank-prediction.json');
  if (fs.existsSync(configPath)) {
    _cachedTargetYear = JSON.parse(fs.readFileSync(configPath, 'utf-8')).targetYear;
    return _cachedTargetYear!;
  }
  // Fallback: current calendar year
  _cachedTargetYear = new Date().getFullYear();
  return _cachedTargetYear;
}
```

- [ ] **Step 4: Build server**

```bash
cd apps/server
pnpm build
```
Expected: success. If `g.subjects` etc. don't exist on the type, inspect the surrounding `paginatedGroups` and ensure these fields are projected (they should already be — search for `groupCode` in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/admission/admission.service.ts
git commit -m "feat: inject predictedMinRank into aggregated admission response"
```

---

## Task 11: Config File — `rank-prediction.json`

**Files:**
- Create: `config/rank-prediction.json`

- [ ] **Step 1: Create config**

Create `config/rank-prediction.json` (project root):
```json
{
  "targetYear": 2026,
  "switchTrigger": "manual",
  "lastSwitchedAt": "2026-05-04",
  "policyNote": "切换条件：上一年度填报+录取批次完整闭环后才推进 targetYear。运行时由 etl-predict-rank.ts 与 admission.service 共同读取此文件。"
}
```

- [ ] **Step 2: Commit**

```bash
git add config/rank-prediction.json
git commit -m "feat: add rank prediction config with manual targetYear switch"
```

---

## Task 12: E2E Test — Verify `predictedMinRank` in Response

**Files:**
- Create or extend: `apps/server/test/admission.e2e-spec.ts`

- [ ] **Step 1: Check existing e2e test**

```bash
ls apps/server/test/
```
If `admission.e2e-spec.ts` doesn't exist, model the new file after `auth.e2e-spec.ts` and `plan.e2e-spec.ts`.

- [ ] **Step 2: Write the test**

Create or extend `apps/server/test/admission.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /admissions/aggregated (e2e) — predictedMinRank field', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('returns predictedMinRank field (null or shape) on each item', async () => {
    const res = await request(app.getHttpServer())
      .get('/admissions/aggregated')
      .query({ province: '四川', score: 600, range: 20, pageSize: 5 })
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    for (const item of res.body.data) {
      expect(item).toHaveProperty('predictedMinRank');
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

  it('at least one item in 600-pt window has non-null predictedMinRank', async () => {
    const res = await request(app.getHttpServer())
      .get('/admissions/aggregated')
      .query({ province: '四川', score: 600, range: 20, pageSize: 50 })
      .expect(200);
    const nonNull = res.body.data.filter((i: any) => i.predictedMinRank !== null);
    expect(nonNull.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run e2e**

```bash
cd apps/server
pnpm test:e2e --testPathPattern admission
```
Expected: PASS. If "no item has prediction" fails, the score window may not match data — adjust the test query to a known-populated range (use 500/range=50 or whatever calibration showed has good coverage).

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/admission.e2e-spec.ts
git commit -m "test: e2e verify predictedMinRank field in aggregated admission response"
```

---

## Task 13: Runbook

**Files:**
- Create: `docs/runbooks/rank-prediction.md`

- [ ] **Step 1: Write runbook**

Create `docs/runbooks/rank-prediction.md`:
```markdown
# Rank Prediction Runbook

## Overview

Predicted admission ranks live in `rank_predictions` table. Frontend reads them via `/admissions/aggregated` response field `predictedMinRank`. ETL is offline.

## Files

- Config: `config/rank-prediction.json` — `targetYear` is the year being predicted
- ETL: `apps/server/scripts/etl-predict-rank.ts`
- Seed: `apps/server/scripts/seed-province-stats.ts`
- Validation: `apps/server/scripts/validate-rank-predictions.ts`
- Pure functions: `apps/server/src/scripts/etl-predict-rank/predict.ts`

## When to switch `targetYear`

**Trigger**: previous year's filing + admission cycle has fully closed and that year's `admission_records` + `enrollment_plans` + `province_year_stats` are loaded.

**Steps**:
1. Confirm new year's data is in DB:
   ```bash
   pnpm ts-node -e "...select count from admission_records where year = NEW_YEAR..."
   ```
2. Update `config/rank-prediction.json`:
   ```json
   { "targetYear": NEW_YEAR + 1, "lastSwitchedAt": "YYYY-MM-DD", ... }
   ```
3. Re-seed province stats if NEW_YEAR data missing:
   ```bash
   cd apps/server && pnpm ts-node scripts/seed-province-stats.ts
   ```
4. Run ETL:
   ```bash
   pnpm ts-node scripts/etl-predict-rank.ts
   ```
5. Run validation:
   ```bash
   pnpm ts-node scripts/validate-rank-predictions.ts > ../../docs/data-reports/YYYY-MM-DD-rank-prediction-validation.md
   ```
6. Confirm thresholds pass (overall MAE < 3000, high-confidence < 1500); if not, debug before deploy.
7. Restart server (cache invalidates `_cachedTargetYear`).

## When to rerun ETL without changing targetYear

- Any change to `admission_records`, `enrollment_plans`, or `province_year_stats`
- After improving model in `predict.ts`

## Adding new province stats data points

1. Edit `apps/server/scripts/fetch-province-stats/sources.md` with new sources
2. Edit `apps/server/scripts/fetch-province-stats/seed-data.ts` with verified values
3. Run `pnpm ts-node scripts/seed-province-stats.ts`
4. Re-run ETL.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/rank-prediction.md
git commit -m "docs: add rank prediction runbook"
```

---

## Self-Review

Run through the spec section by section after completing all tasks:

| Spec Section | Implemented in |
|---|---|
| 1. 范围 & 目标 | Tasks 5-7 (model + ETL output shape) |
| 2. 架构 | All tasks; Stage A=Tasks 3-4, Stage B=Tasks 5-7, Stage C=Task 8, Stage D=Tasks 9-10, config=Task 11 |
| 2.5 权威报名数据核实 | Tasks 3, 4 |
| 3. 核心算法 | Task 5 (subjectWeight, planWeight), Task 6 (predictMinRank with回退链 covered by tests) |
| 4. 数据模型 | Task 2 (both tables) |
| 5. 前端集成契约 | Tasks 9, 10, 12 |
| 6. 校准报告 | Task 8 |
| 7. 测试策略 | unit Tasks 1, 5, 6; integration via Task 7 sanity-check + Task 12 e2e |
| 8. 风险 | Mitigations spread across multiple tasks (e.g., R3 covered by confidence handling in Task 6) |
| 9. 实施阶段 | This plan's task numbering = spec phase ordering |
| 10. spec-1 接口锁定 | Task 9 + Task 10 |

**Placeholder scan**: Search this file for `TBD|TODO|placeholder|implement later|fill in details` — none should appear (templates with `/*FILL*/` in Task 3 are intentional, marked clearly as research output).

**Type consistency check**:
- `PredictInput` defined in Task 6, used in Tasks 7 and 8 ✓
- `PredictOutput` confidence enum (`high`/`medium`/`low`) consistent across Tasks 6, 9, 10, 12 ✓
- `ProvinceYearStatRow` in Task 3 → used in Task 4 ✓
- `RankPrediction` table fields align between Task 2 (schema) and Task 7 (upsert) and Task 10 (read) ✓
- `keyOf` and the `key()` helper repeat the same join semantics in Task 7 and Task 8 ✓
- `subjectWeight` direction: `N_target / N_historical` (Tasks 5, 6) ✓
- `planWeight` direction: `P_target / P_historical` (Task 6 step 3 fix-up + Task 5 final state) ✓ — be sure to apply the direction fix during Task 6.

---

## Plan complete

Saved to `docs/superpowers/plans/2026-05-04-rank-prediction-model.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
