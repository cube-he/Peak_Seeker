# University Map Frontend (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the geo data already in production via an extended detail API + a new POI endpoint, then render a "校区位置" Tab in the university detail page using AMap JS SDK. Stage 1 ships a minimum-viable desktop view that lets the user evaluate direction; Stage 2 adds switcher / multi-category POI / mobile responsive / error handling / tests.

**Architecture:** Plan A's `geo` module already populates `UniversityCampus` and `UniversityCampusPoi` tables. Plan B (Stage 1) extends `UniversityService.getById()` to include verified campuses, adds `GET /universities/:uniId/campuses/:campusId/pois`, and creates a new React component tree under `apps/web/src/components/university/campus-location/` that renders a tab in the existing detail page. AMap SDK loads lazily on first tab activation via the official `@amap/amap-jsapi-loader` (no PlaceSearch plugin — POI comes from our own backend).

**Tech Stack:** NestJS 10 + Prisma 7 (server), Next.js 14 + React 18 + Ant Design + Tailwind + React Query (web), `@amap/amap-jsapi-loader` (new dep), Jest 29 + React Testing Library.

**Out of Scope (Stage 2 / Plan C):**
- CampusSwitcher interactive switching (Stage 2)
- POI mall + airport categories (Stage 2)
- Mobile responsive < 1024px (Stage 2)
- AMap domain whitelist + production checklist (Stage 2)
- React Testing Library + MSW integration tests (Stage 2)
- Refilling the 60 campuses missing POI data (Plan C)

---

## File Structure

```
apps/server/src/modules/university/
  ├── university.service.ts        # MODIFY: add campuses include + getCampusPois()
  ├── university.controller.ts     # MODIFY: add /:uniId/campuses/:campusId/pois route
  ├── dto/
  │   └── poi-query.dto.ts         # NEW: validation DTO for ?category=&limit=
  ├── university.service.spec.ts   # MODIFY: 4 new tests
  └── university.controller.spec.ts # NEW IF MISSING / MODIFY: 1 e2e route test

apps/web/
  ├── package.json                 # MODIFY: + @amap/amap-jsapi-loader
  ├── .env.example                 # MODIFY: document NEXT_PUBLIC_AMAP_JS_KEY/_SECURITY
  └── src/
      ├── services/
      │   └── university.ts         # MODIFY: add getCampusPois()
      └── components/university/campus-location/   # NEW DIR
          ├── types.ts              # NEW: Campus / Poi types
          ├── amap-loader.ts        # NEW: SDK singleton lazy loader
          ├── usePoi.ts             # NEW: React Query hook
          ├── CampusInfo.tsx        # NEW: campus info card (Stage 1: main only)
          ├── PoiList.tsx           # NEW: POI list (Stage 1: subway only)
          ├── CampusPanel.tsx       # NEW: right panel container (Info + PoiList)
          ├── CampusMap.tsx         # NEW: AMap canvas + markers
          └── CampusLocationTab.tsx # NEW: tab container (Map + Panel)

apps/web/src/app/(main)/universities/[id]/
  └── page.tsx                     # MODIFY: conditionally insert tab in tabItems
```

**Why this layout:**
- Backend changes minimal — extend `getById()` in place; one new route handler. No new module needed.
- Frontend `campus-location/` directory groups all Tab-specific code under the existing `components/university/` neighborhood, mirroring siblings like `RankingCard`, `EmploymentCard`, etc. Each file is small and focused so subsequent tasks can be reviewed in isolation.
- `amap-loader.ts` and `usePoi.ts` are infrastructure isolated from React tree; easy to mock independently.

---

## Conventions Across Tasks

- **Run server unit tests:** `cd apps/server && npx jest --testPathPattern=<pattern>`
- **Run server e2e:** `cd apps/server && pnpm test:e2e`
- **Run web tests:** `cd apps/web && pnpm test`
- **TS check from web:** `cd apps/web && pnpm tsc --noEmit -p tsconfig.json`
- **Server scripts:** when running CLI scripts, prefer `npx jest` (not `pnpm test --` which doesn't pass args correctly)
- **Path aliases:** server uses `@/`; web uses `@/` mapped to `apps/web/src/`
- **Commit style:** conventional commits in English (project rule)
- **Working directory:** always `C:\Users\Administrator\Documents\VolunteerHelper`
- **Branch:** `feat/university-map-frontend` (already created; spec `130dcba`)
- **Currency note:** when a step says "Modify X:Y-Z", the line numbers refer to the file's state immediately *after* the previous task completed

---

## Phase 1 · Backend API extension

### Task 1: `UniversityService.getById()` returns campuses

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts:85-101`
- Modify: `apps/server/src/modules/university/university.service.spec.ts` (or create if absent)

- [ ] **Step 1: Check if a service spec file already exists**

Run:
```bash
ls apps/server/src/modules/university/university.service.spec.ts 2>/dev/null && echo EXISTS || echo MISSING
```

If MISSING, the test in step 2 will create it. If EXISTS, append the new `describe` block.

- [ ] **Step 2: Write failing test (or add to existing spec)**

Create or modify `apps/server/src/modules/university/university.service.spec.ts`:

```ts
import { UniversityService } from './university.service';

describe('UniversityService.getById campuses', () => {
  const setup = (universityRow: any, qiangji: any[] = [], predictions: any[] = []) => {
    const prisma = {
      university: {
        findUnique: jest.fn().mockResolvedValue(universityRow),
      },
      qiangjiAdmission: {
        findMany: jest.fn().mockResolvedValue(qiangji),
      },
      rankPrediction: {
        findMany: jest.fn().mockResolvedValue(predictions),
      },
    };
    const redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
    };
    const admissionService = {
      getTargetYear: jest.fn().mockResolvedValue(2026),
    };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc, prisma, redis };
  };

  it('includes campuses in the response', async () => {
    const { svc, prisma } = setup({
      id: 1, name: '哈工大',
      campuses: [
        {
          id: 10, name: '本部', isMain: true,
          province: '黑龙江省', city: '哈尔滨市', district: '南岗区',
          address: 'X', latitude: 45.74, longitude: 126.63,
          distanceToCityCenter: 5200,
          nearestSubwayMeters: 380,
          nearestAirportKm: 38.0,
          geoStatus: 'verified',
        },
      ],
      enrollmentPlans: [],
      admissionRecords: [],
    });
    const result: any = await svc.findOne(1);
    expect(result.campuses).toHaveLength(1);
    expect(result.campuses[0].name).toBe('本部');
    expect(prisma.university.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          campuses: expect.objectContaining({
            where: { geoStatus: 'verified' },
          }),
        }),
      }),
    );
  });

  it('returns empty array when university has no verified campuses', async () => {
    const { svc } = setup({
      id: 2, name: 'X',
      campuses: [],
      enrollmentPlans: [],
      admissionRecords: [],
    });
    const result: any = await svc.findOne(2);
    expect(result.campuses).toEqual([]);
  });
});
```

> **Note on method name:** the existing service exposes `findOne(id, subject?)` (verified at `university.service.ts:85`). If the method name in your codebase is `getById` instead, swap accordingly throughout this plan. The test calls it explicitly.

- [ ] **Step 3: Verify the existing method name**

Run: `grep -n "async findOne\|async getById" apps/server/src/modules/university/university.service.ts`

If output shows `findOne`, use `findOne` everywhere in this plan (Tasks 1, 2, 4, 5, etc.). If `getById`, swap. **The test in Step 2 calls `svc.findOne(...)`; adjust if needed.**

- [ ] **Step 4: Run the new tests — confirm failure**

Run: `cd apps/server && npx jest --testPathPattern=university.service`

Expected: FAIL — the existing implementation passes campuses through but the test asserts the `include.campuses.where: { geoStatus: 'verified' }` shape; without our modification, the prisma call doesn't include campuses at all so the `expect.objectContaining` matcher fails.

- [ ] **Step 5: Modify `university.service.ts`**

Locate the existing `prisma.university.findUnique` call (around line 89). Replace its `include` block:

```ts
const university = await this.prisma.university.findUnique({
  where: { id },
  include: {
    enrollmentPlans: {
      orderBy: { year: 'desc' },
      take: 100,
    },
    admissionRecords: {
      orderBy: { year: 'desc' },
      take: 100,
    },
    campuses: {
      where: { geoStatus: 'verified' },
      orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
    },
  },
});
```

- [ ] **Step 6: Run the new tests — confirm pass**

Run: `cd apps/server && npx jest --testPathPattern=university.service`

Expected: PASS — both new tests green; existing tests continue to pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/university/university.service.ts \
        apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(university): include verified campuses in detail response"
```

---

### Task 2: Coerce Decimal lat/lng to number in detail response

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts` (after the findUnique call, before `qiangjiAdmissions` query)

Prisma returns `Decimal` instances for `Decimal` columns (lat / lng / nearestAirportKm). The frontend wants plain `number`. We coerce in-place.

- [ ] **Step 1: Add a failing test**

Append to `university.service.spec.ts` inside the existing `describe`:

```ts
  it('coerces Decimal lat/lng to plain numbers in campuses', async () => {
    // Simulate Prisma's Decimal type: an object with toNumber() method
    const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n) });
    const { svc } = setup({
      id: 1, name: 'X',
      campuses: [
        {
          id: 10, name: '本部', isMain: true,
          province: '北京市', city: '北京市', district: null,
          address: 'X',
          latitude: decimal(40.0),
          longitude: decimal(116.331),
          distanceToCityCenter: 5200,
          nearestSubwayMeters: 380,
          nearestAirportKm: decimal(38.0),
          geoStatus: 'verified',
        },
      ],
      enrollmentPlans: [],
      admissionRecords: [],
    });
    const result: any = await svc.findOne(1);
    expect(result.campuses[0].latitude).toBe(40.0);
    expect(typeof result.campuses[0].latitude).toBe('number');
    expect(result.campuses[0].longitude).toBe(116.331);
    expect(result.campuses[0].nearestAirportKm).toBe(38.0);
  });
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd apps/server && npx jest --testPathPattern=university.service`

Expected: FAIL — `result.campuses[0].latitude` is the Decimal object, not the number.

- [ ] **Step 3: Implement the coercion**

In `university.service.ts`, immediately after the `if (!university) throw new NotFoundException(...)` block (around line 105), add:

```ts
// Coerce Prisma Decimal -> number for frontend consumption.
// Decimal instances have toNumber(); plain numbers / null pass through.
const decimalToNumber = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
};

const campuses = (university as any).campuses?.map((c: any) => ({
  ...c,
  latitude: decimalToNumber(c.latitude),
  longitude: decimalToNumber(c.longitude),
  nearestAirportKm: decimalToNumber(c.nearestAirportKm),
})) ?? [];
```

Then replace the final `const result = { ...university, qiangjiAdmissions, bestPrediction };` line with:

```ts
const result = { ...university, campuses, qiangjiAdmissions, bestPrediction };
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `cd apps/server && npx jest --testPathPattern=university.service`

Expected: PASS — all 3 campus tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/university/university.service.ts \
        apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(university): coerce Decimal coordinates to number in detail response"
```

---

### Task 3: POI query DTO

**Files:**
- Create: `apps/server/src/modules/university/dto/poi-query.dto.ts`

- [ ] **Step 1: Create the DTO**

```ts
// apps/server/src/modules/university/dto/poi-query.dto.ts
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const POI_CATEGORIES = ['subway', 'mall', 'airport'] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

export class PoiQueryDto {
  @IsEnum(POI_CATEGORIES)
  category!: PoiCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 5;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/server && pnpm tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/university/dto/poi-query.dto.ts
git commit -m "feat(university): add PoiQueryDto with category and limit validation"
```

---

### Task 4: `UniversityService.getCampusPois()` — TDD

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts`
- Modify: `apps/server/src/modules/university/university.service.spec.ts`

- [ ] **Step 1: Append failing tests**

Append to the spec file:

```ts
describe('UniversityService.getCampusPois', () => {
  const buildService = (poiRows: any[]) => {
    const prisma = {
      universityCampus: {
        findUnique: jest.fn().mockResolvedValue({ id: 10, universityId: 1 }),
      },
      universityCampusPoi: {
        findMany: jest.fn().mockResolvedValue(poiRows),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    return new UniversityService(prisma as any, redis as any, admissionService as any);
  };

  it('returns POIs filtered by category, sorted by distance, with limit', async () => {
    const svc = buildService([
      { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
      { id: 2, amapId: 'B', name: '哈工大',   category: 'subway', distance: 520, metadata: null },
    ]);
    const result = await svc.getCampusPois(1, 10, { category: 'subway', limit: 5 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('西大直街');
    expect(result[0].category).toBe('subway');
    // Returned shape: only public fields
    expect(result[0]).toEqual({
      id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null,
    });
  });

  it('rejects when campus does not belong to the requested university', async () => {
    const prisma = {
      universityCampus: {
        findUnique: jest.fn().mockResolvedValue({ id: 99, universityId: 2 }),
      },
      universityCampusPoi: { findMany: jest.fn() },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    await expect(
      svc.getCampusPois(1, 99, { category: 'subway', limit: 5 }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects when campus does not exist', async () => {
    const prisma = {
      universityCampus: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      universityCampusPoi: { findMany: jest.fn() },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    await expect(
      svc.getCampusPois(1, 999, { category: 'subway', limit: 5 }),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd apps/server && npx jest --testPathPattern=university.service`

Expected: FAIL — `svc.getCampusPois is not a function`.

- [ ] **Step 3: Add the method**

In `university.service.ts`, after the existing methods, add:

```ts
async getCampusPois(
  universityId: number,
  campusId: number,
  query: { category: 'subway' | 'mall' | 'airport'; limit?: number },
): Promise<Array<{
  id: number;
  amapId: string;
  name: string;
  category: 'subway' | 'mall' | 'airport';
  distance: number;
  metadata: unknown | null;
}>> {
  const campus = await this.prisma.universityCampus.findUnique({
    where: { id: campusId },
    select: { id: true, universityId: true },
  });
  if (!campus || campus.universityId !== universityId) {
    throw new NotFoundException('campus not found');
  }
  const limit = query.limit ?? 5;
  const rows = await this.prisma.universityCampusPoi.findMany({
    where: { campusId, category: query.category, obsolete: false },
    orderBy: { distance: 'asc' },
    take: limit,
    select: {
      id: true, amapId: true, name: true,
      category: true, distance: true, metadata: true,
    },
  });
  // category is `string` in Prisma's output; narrow it for the response.
  return rows.map((r) => ({
    ...r,
    category: r.category as 'subway' | 'mall' | 'airport',
  }));
}
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `cd apps/server && npx jest --testPathPattern=university.service`

Expected: PASS — 6/6 tests across both describes.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/university/university.service.ts \
        apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(university): UniversityService.getCampusPois with ownership check"
```

---

### Task 5: Controller route for POI endpoint

**Files:**
- Modify: `apps/server/src/modules/university/university.controller.ts`

- [ ] **Step 1: Modify the controller**

Open `apps/server/src/modules/university/university.controller.ts` and add the import for `PoiQueryDto`:

```ts
import { PoiQueryDto } from './dto/poi-query.dto';
```

Then add the new route handler after the existing `findAdmissions` method:

```ts
@Get(':uniId/campuses/:campusId/pois')
async getCampusPois(
  @Param('uniId', ParseIntPipe) uniId: number,
  @Param('campusId', ParseIntPipe) campusId: number,
  @Query() query: PoiQueryDto,
) {
  return this.universityService.getCampusPois(uniId, campusId, {
    category: query.category,
    limit: query.limit,
  });
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/server && pnpm build`

Expected: clean build (exit 0). NestJS validates DI at compile time.

- [ ] **Step 3: Smoke-check existing tests still pass**

Run: `cd apps/server && npx jest`

Expected: ALL existing test suites still pass (we only added a route, no logic changes).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/university/university.controller.ts
git commit -m "feat(university): add GET /universities/:uniId/campuses/:id/pois route"
```

---

### Task 6: Server e2e test for POI route

**Files:**
- Modify or create: `apps/server/test/university.e2e-spec.ts`

> **Why this test exists:** Sanity check that the route is wired (controller + DTO validation + service all reachable end-to-end). The unit tests in Task 4 don't exercise validation pipe / DI; this does.

- [ ] **Step 1: Check if a university e2e exists**

Run: `ls apps/server/test/university.e2e-spec.ts 2>/dev/null && echo EXISTS || echo MISSING`

If MISSING, create new file. If EXISTS, append a new describe.

- [ ] **Step 2: Write the e2e test**

Either create `apps/server/test/university.e2e-spec.ts` or append to it:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UniversityService } from '../src/modules/university/university.service';

describe('University POI route (e2e)', () => {
  let app: INestApplication;
  let svc: UniversityService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UniversityService)
      .useValue({
        getCampusPois: jest.fn().mockResolvedValue([
          { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
        ]),
        // Stubs for any other methods that AppModule wires that this test indirectly exercises.
        // Methods not invoked in this test are no-ops.
        findAll: jest.fn(),
        findOne: jest.fn(),
        getHot: jest.fn(),
        getFilters: jest.fn(),
        findMajors: jest.fn(),
        findAdmissions: jest.fn(),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    svc = moduleRef.get(UniversityService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns POI list for valid query', async () => {
    const res = await request(app.getHttpServer())
      .get('/universities/1/campuses/10/pois?category=subway&limit=5')
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('西大直街');
    expect(svc.getCampusPois).toHaveBeenCalledWith(1, 10, { category: 'subway', limit: 5 });
  });

  it('rejects invalid category with 400', async () => {
    await request(app.getHttpServer())
      .get('/universities/1/campuses/10/pois?category=invalid')
      .expect(400);
  });

  it('rejects missing category with 400', async () => {
    await request(app.getHttpServer())
      .get('/universities/1/campuses/10/pois')
      .expect(400);
  });
});
```

- [ ] **Step 3: Run e2e**

Run: `cd apps/server && pnpm test:e2e`

Expected: 3 new tests pass; existing e2e tests untouched.

> If e2e fails to bootstrap because the dev DB is unreachable, this is expected — most projects gate e2e behind a real DB. In that case, document it and move on (the unit tests in Task 4 already cover the service logic).

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/university.e2e-spec.ts
git commit -m "test(university): e2e for POI route validation and dispatch"
```

---

## Phase 2 · Frontend infrastructure

### Task 7: Add `@amap/amap-jsapi-loader` dependency

**Files:**
- Modify: `apps/web/package.json`
- Modify (auto): `pnpm-lock.yaml`

- [ ] **Step 1: Install the package**

Run: `cd apps/web && pnpm add @amap/amap-jsapi-loader`

Expected: package added to `dependencies`. Lockfile updated.

- [ ] **Step 2: Verify**

Run: `cd apps/web && grep -A 1 amap-jsapi-loader package.json | head -5`

Expected output includes the `@amap/amap-jsapi-loader` line.

- [ ] **Step 3: Document env vars**

Open or create `apps/web/.env.example`:

```dotenv
# AMap JS API Key (frontend map rendering)
# Get from https://console.amap.com/dev/key/app — type: Web端(JS API)
# Stage 1: keep these in .env.local; Stage 2: also bind production domain whitelist in console.
NEXT_PUBLIC_AMAP_JS_KEY=
NEXT_PUBLIC_AMAP_JS_SECURITY=
```

If `.env.example` already has other variables, append the AMap block at the end.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/.env.example pnpm-lock.yaml
git commit -m "chore(web): add @amap/amap-jsapi-loader and document env vars"
```

---

### Task 8: TypeScript types for Campus and Poi

**Files:**
- Create: `apps/web/src/components/university/campus-location/types.ts`

- [ ] **Step 1: Create the file**

```ts
// apps/web/src/components/university/campus-location/types.ts

export type PoiCategory = 'subway' | 'mall' | 'airport';

export interface Campus {
  id: number;
  name: string;
  isMain: boolean;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceToCityCenter: number | null;
  nearestSubwayMeters: number | null;
  nearestAirportKm: number | null;
}

export interface Poi {
  id: number;
  amapId: string;
  name: string;
  category: PoiCategory;
  distance: number;            // meters
  metadata: Record<string, unknown> | null;
}
```

- [ ] **Step 2: Verify TS**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/university/campus-location/types.ts
git commit -m "feat(web): add Campus and Poi types for map components"
```

---

### Task 9: AMap SDK lazy loader

**Files:**
- Create: `apps/web/src/components/university/campus-location/amap-loader.ts`

- [ ] **Step 1: Create the loader**

```ts
// apps/web/src/components/university/campus-location/amap-loader.ts

import AMapLoader from '@amap/amap-jsapi-loader';

// Module-level singleton so multiple components / re-renders do not
// reload the SDK. The promise is cached on first call.
let loadPromise: Promise<typeof AMap> | null = null;

/**
 * Lazy-load the AMap JS SDK. Safe to call multiple times — returns the
 * same promise. Configures the security code from env so the SDK can
 * authenticate against AMap's server-side validation.
 *
 * Stage 1: keys come from NEXT_PUBLIC_* env (visible in browser bundle).
 * Stage 2: bind production domain whitelist in AMap console so the keys
 * cannot be reused from other origins. See spec § 5.
 */
export function loadAMap(): Promise<typeof AMap> {
  if (loadPromise) return loadPromise;

  if (typeof window === 'undefined') {
    // SSR guard: refuse to start the loader during server render.
    return Promise.reject(new Error('AMap loader called during SSR'));
  }

  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  const securityCode = process.env.NEXT_PUBLIC_AMAP_JS_SECURITY;

  if (!key || !securityCode) {
    return Promise.reject(
      new Error(
        'AMap keys are not configured. Set NEXT_PUBLIC_AMAP_JS_KEY and NEXT_PUBLIC_AMAP_JS_SECURITY in apps/web/.env.local',
      ),
    );
  }

  // AMap reads the security code from this global before SDK init.
  (window as unknown as { _AMapSecurityConfig: { securityJsCode: string } })._AMapSecurityConfig = {
    securityJsCode: securityCode,
  };

  loadPromise = AMapLoader.load({
    key,
    version: '2.0',
    plugins: [],         // Stage 1 only needs Map + Marker (in core); no PlaceSearch
  });
  return loadPromise;
}

/**
 * Test-only helper: clears the cached loader promise so unit tests can
 * exercise the "first load" path repeatedly.
 */
export function _resetLoaderForTests(): void {
  loadPromise = null;
}
```

- [ ] **Step 2: Verify TS**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

> If TS complains that `typeof AMap` is not a known global, add a stub `declare global { const AMap: any; }` at the top of the file or above the export — the official `@amap/amap-jsapi-loader` package ships its own ambient `AMap` declaration; if not, this stub keeps TS happy. (Real type comes at runtime from the SDK.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/university/campus-location/amap-loader.ts
git commit -m "feat(web): AMap SDK singleton lazy loader with SSR guard"
```

---

### Task 10: `getCampusPois` API client method

**Files:**
- Modify: `apps/web/src/services/university.ts`

- [ ] **Step 1: Add the method**

Open `apps/web/src/services/university.ts`. Add a new method to the existing `universityService` object:

```ts
import api from './api';

export interface UniversityQueryParams {
  // ... existing fields unchanged ...
}

export interface CampusPoiQueryParams {
  category: 'subway' | 'mall' | 'airport';
  limit?: number;
}

export const universityService = {
  // ... existing methods unchanged ...
  getCampusPois: (
    universityId: number,
    campusId: number,
    params: CampusPoiQueryParams,
  ): Promise<any> =>
    api.get(
      `/universities/${universityId}/campuses/${campusId}/pois`,
      { params },
    ) as any,
};
```

> Keep all existing methods. Only add `getCampusPois` at the end of the object literal.

- [ ] **Step 2: Verify TS**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/university.ts
git commit -m "feat(web): add universityService.getCampusPois API client method"
```

---

### Task 11: `usePoi` React Query hook — TDD

**Files:**
- Create: `apps/web/src/components/university/campus-location/usePoi.ts`
- Create: `apps/web/src/components/university/campus-location/__tests__/usePoi.test.ts`

- [ ] **Step 1: Confirm web test setup exists**

Run: `cat apps/web/jest.config.ts`

Expected to see `testMatch: ['**/__tests__/**/*.test.ts', ...]`. The test file path used below matches that pattern.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/components/university/campus-location/__tests__/usePoi.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { usePoi } from '../usePoi';
import { universityService } from '@/services/university';

jest.mock('@/services/university', () => ({
  universityService: {
    getCampusPois: jest.fn(),
  },
}));

const wrap = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe('usePoi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches POIs with the requested category', async () => {
    (universityService.getCampusPois as jest.Mock).mockResolvedValue([
      { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
    ]);

    const { result } = renderHook(
      () => usePoi({ universityId: 1, campusId: 10, category: 'subway' }),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(universityService.getCampusPois).toHaveBeenCalledWith(1, 10, {
      category: 'subway',
      limit: 5,
    });
  });

  it('returns isError when the API throws', async () => {
    (universityService.getCampusPois as jest.Mock).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(
      () => usePoi({ universityId: 1, campusId: 10, category: 'subway' }),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch when campusId is null', () => {
    renderHook(
      () => usePoi({ universityId: 1, campusId: null, category: 'subway' }),
      { wrapper: wrap() },
    );

    expect(universityService.getCampusPois).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Confirm RTL is installed**

Run: `cd apps/web && grep -E "@testing-library/react|@tanstack/react-query" package.json | head -5`

If `@testing-library/react` is missing:
- Run: `cd apps/web && pnpm add -D @testing-library/react @testing-library/dom`

If `@tanstack/react-query` is missing (it should already be present):
- Run: `cd apps/web && pnpm add @tanstack/react-query`

- [ ] **Step 4: Run test — confirm fail**

Run: `cd apps/web && pnpm test -- usePoi`

Expected: FAIL — module `../usePoi` does not exist.

- [ ] **Step 5: Implement the hook**

Create `apps/web/src/components/university/campus-location/usePoi.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { universityService } from '@/services/university';
import type { Poi, PoiCategory } from './types';

interface UsePoiArgs {
  universityId: number;
  campusId: number | null;
  category: PoiCategory;
  limit?: number;
}

const DEFAULT_LIMIT = 5;
const STALE_TIME_MS = 30 * 60 * 1000;     // 30 min — POI data is near-static

export function usePoi(args: UsePoiArgs) {
  const { universityId, campusId, category, limit = DEFAULT_LIMIT } = args;
  return useQuery<Poi[]>({
    queryKey: ['campus-pois', universityId, campusId, category, limit],
    enabled: campusId != null,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      const data = await universityService.getCampusPois(universityId, campusId!, {
        category,
        limit,
      });
      return data as Poi[];
    },
  });
}
```

- [ ] **Step 6: Run tests — confirm pass**

Run: `cd apps/web && pnpm test -- usePoi`

Expected: 3/3 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/university/campus-location/usePoi.ts \
        apps/web/src/components/university/campus-location/__tests__/usePoi.test.ts \
        apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): usePoi React Query hook with 30-min stale time"
```

---

## Phase 3 · Frontend components

### Task 12: `PoiList` component — TDD

**Files:**
- Create: `apps/web/src/components/university/campus-location/PoiList.tsx`
- Create: `apps/web/src/components/university/campus-location/__tests__/PoiList.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/components/university/campus-location/__tests__/PoiList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { PoiList } from '../PoiList';
import { universityService } from '@/services/university';

jest.mock('@/services/university', () => ({
  universityService: { getCampusPois: jest.fn() },
}));

const wrap = (ui: React.ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
};

describe('PoiList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders POI items with names and distances', async () => {
    (universityService.getCampusPois as jest.Mock).mockResolvedValue([
      { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
      { id: 2, amapId: 'B', name: '哈工大',   category: 'subway', distance: 1250, metadata: null },
    ]);

    wrap(<PoiList universityId={1} campusId={10} category="subway" />);

    expect(await screen.findByText('西大直街')).toBeTruthy();
    expect(screen.getByText('380 m')).toBeTruthy();
    expect(screen.getByText('哈工大')).toBeTruthy();
    expect(screen.getByText('1.3 km')).toBeTruthy();   // > 1000m formatted as km
  });

  it('shows empty placeholder when API returns []', async () => {
    (universityService.getCampusPois as jest.Mock).mockResolvedValue([]);

    wrap(<PoiList universityId={1} campusId={10} category="subway" />);

    expect(await screen.findByText(/暂无周边/)).toBeTruthy();
  });

  it('shows error placeholder when API throws', async () => {
    (universityService.getCampusPois as jest.Mock).mockRejectedValue(new Error('boom'));

    wrap(<PoiList universityId={1} campusId={10} category="subway" />);

    expect(await screen.findByText(/无法加载/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Confirm @testing-library/jest-dom is in jest setup if used**

Run: `cd apps/web && grep -r "jest-dom" jest.config.ts tsconfig.jest.json 2>/dev/null | head -3`

If absent, the assertions above use plain `toBeTruthy()` (which work without jest-dom). No action needed.

- [ ] **Step 3: Run tests — confirm fail**

Run: `cd apps/web && pnpm test -- PoiList`

Expected: FAIL — `../PoiList` not found.

- [ ] **Step 4: Implement `PoiList.tsx`**

```tsx
// apps/web/src/components/university/campus-location/PoiList.tsx
'use client';

import { Spin } from 'antd';
import { usePoi } from './usePoi';
import type { PoiCategory } from './types';

interface PoiListProps {
  universityId: number;
  campusId: number | null;
  category: PoiCategory;
  limit?: number;
}

const CATEGORY_LABELS: Record<PoiCategory, string> = {
  subway: '最近地铁',
  mall: '周边商圈',
  airport: '最近机场',
};

const CATEGORY_ICONS: Record<PoiCategory, string> = {
  subway: '🚇',
  mall: '🛍',
  airport: '✈️',
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function PoiList({ universityId, campusId, category, limit }: PoiListProps) {
  const { data, isLoading, isError } = usePoi({ universityId, campusId, category, limit });

  return (
    <div>
      <div className="flex items-center gap-1 mb-2 text-sm text-text-tertiary">
        <span>{CATEGORY_ICONS[category]}</span>
        <span>{CATEGORY_LABELS[category]}</span>
      </div>
      {isLoading && <Spin size="small" />}
      {isError && (
        <div className="text-xs text-text-muted">暂时无法加载{CATEGORY_LABELS[category]}信息</div>
      )}
      {!isLoading && !isError && data && data.length === 0 && (
        <div className="text-xs text-text-muted">暂无周边{CATEGORY_LABELS[category]}信息</div>
      )}
      {!isLoading && !isError && data && data.length > 0 && (
        <ul className="space-y-1.5">
          {data.map((p) => (
            <li key={p.id} className="flex justify-between gap-3 text-sm">
              <span className="truncate text-text-secondary">{p.name}</span>
              <span className="shrink-0 text-text-tertiary [font-variant-numeric:tabular-nums]">
                {formatDistance(p.distance)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PoiList;
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `cd apps/web && pnpm test -- PoiList`

Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/university/campus-location/PoiList.tsx \
        apps/web/src/components/university/campus-location/__tests__/PoiList.test.tsx
git commit -m "feat(web): PoiList renders POIs with distance formatting and empty/error states"
```

---

### Task 13: `CampusInfo` component

**Files:**
- Create: `apps/web/src/components/university/campus-location/CampusInfo.tsx`

> **No tests in this task.** CampusInfo is a pure render of static props with no logic worth testing — it's caught by visual review when the user opens a real page.

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/components/university/campus-location/CampusInfo.tsx
'use client';

import { EnvironmentOutlined } from '@ant-design/icons';
import type { Campus } from './types';

interface CampusInfoProps {
  campus: Campus;
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function CampusInfo({ campus }: CampusInfoProps) {
  const cityLine = [campus.city, campus.district].filter(Boolean).join(' · ');

  return (
    <div className="bg-surface-dim rounded-lg p-3 mb-3">
      <div className="font-serif text-base font-semibold text-text mb-1">
        {campus.name}
        {campus.isMain && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary-fixed text-primary font-medium">
            主校区
          </span>
        )}
      </div>
      {cityLine && (
        <div className="flex items-center gap-1 text-xs text-text-tertiary mb-1">
          <EnvironmentOutlined />
          <span>{cityLine}</span>
        </div>
      )}
      {campus.address && (
        <div className="text-xs text-text-muted truncate" title={campus.address}>
          {campus.address}
        </div>
      )}
      {campus.distanceToCityCenter != null && (
        <div className="text-xs text-text-tertiary mt-2">
          距市中心 {formatKm(campus.distanceToCityCenter)}
        </div>
      )}
    </div>
  );
}

export default CampusInfo;
```

- [ ] **Step 2: Verify TS**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/university/campus-location/CampusInfo.tsx
git commit -m "feat(web): CampusInfo card with city, address, distance to center"
```

---

### Task 14: `CampusPanel` component

**Files:**
- Create: `apps/web/src/components/university/campus-location/CampusPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/components/university/campus-location/CampusPanel.tsx
'use client';

import { CampusInfo } from './CampusInfo';
import { PoiList } from './PoiList';
import type { Campus } from './types';

interface CampusPanelProps {
  universityId: number;
  selectedCampus: Campus;
}

export function CampusPanel({ universityId, selectedCampus }: CampusPanelProps) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <CampusInfo campus={selectedCampus} />
      <PoiList
        universityId={universityId}
        campusId={selectedCampus.id}
        category="subway"
      />
    </div>
  );
}

export default CampusPanel;
```

- [ ] **Step 2: Verify TS**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/university/campus-location/CampusPanel.tsx
git commit -m "feat(web): CampusPanel composes CampusInfo and PoiList"
```

---

### Task 15: `CampusMap` component

**Files:**
- Create: `apps/web/src/components/university/campus-location/CampusMap.tsx`

> **No unit test in this task.** AMap SDK requires a real browser canvas; jsdom mocks would test our mocking, not real behavior. This is the boundary between "automated test" and "user opens the page and sees a map". Verification happens via the visual smoke check at the end of Task 17.

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/components/university/campus-location/CampusMap.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { loadAMap } from './amap-loader';
import type { Campus } from './types';

interface CampusMapProps {
  campuses: Campus[];
  selectedCampusId: number;
  height?: number;     // px
}

const DEFAULT_HEIGHT = 480;

// Icon URLs hosted by AMap CDN — official red/blue/green pins.
const MAIN_ICON_URL = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png';
const BRANCH_ICON_URL = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_g.png';

export function CampusMap({ campuses, selectedCampusId, height = DEFAULT_HEIGHT }: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let mapInstance: any = null;

    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        const main = campuses.find((c) => c.isMain) ?? campuses[0];
        mapInstance = new AMap.Map(containerRef.current, {
          zoom: 14,
          center: [main.longitude, main.latitude],
        });

        const markers = campuses.map((c) =>
          new AMap.Marker({
            position: [c.longitude, c.latitude],
            title: c.name,
            icon: c.isMain ? MAIN_ICON_URL : BRANCH_ICON_URL,
          }),
        );
        mapInstance.add(markers);

        if (campuses.length > 1) {
          mapInstance.setFitView(markers, false, [60, 60, 60, 60], 16);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (mapInstance) {
        try {
          mapInstance.destroy();
        } catch {
          // noop — destroy can throw if already disposed
        }
      }
    };
  }, [campuses, selectedCampusId]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-surface-dim rounded-lg text-sm text-text-muted"
        style={{ height }}
      >
        地图加载失败,请刷新重试
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-dim/50">
          <Spin />
        </div>
      )}
    </div>
  );
}

export default CampusMap;
```

- [ ] **Step 2: Verify TS**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

> **Type note:** `AMap` is referenced as a runtime global from the SDK. If TS doesn't have an ambient type for it, the package's own `.d.ts` will provide it after install. If TS still errors, add `declare global { var AMap: any; }` at the top of `amap-loader.ts` — that's the most defensive workaround.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/university/campus-location/CampusMap.tsx
git commit -m "feat(web): CampusMap renders all campuses with fitBounds and main/branch icons"
```

---

### Task 16: `CampusLocationTab` container

**Files:**
- Create: `apps/web/src/components/university/campus-location/CampusLocationTab.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/components/university/campus-location/CampusLocationTab.tsx
'use client';

import { useState } from 'react';
import { CampusMap } from './CampusMap';
import { CampusPanel } from './CampusPanel';
import type { Campus } from './types';

interface CampusLocationTabProps {
  universityId: number;
  campuses: Campus[];
}

export function CampusLocationTab({ universityId, campuses }: CampusLocationTabProps) {
  // Stage 1: selection is fixed to the main campus (no switcher yet).
  // Stage 2 will pass setSelectedId down to CampusSwitcher.
  const initialMain = campuses.find((c) => c.isMain) ?? campuses[0];
  const [selectedCampusId] = useState<number>(initialMain.id);

  const selected = campuses.find((c) => c.id === selectedCampusId) ?? initialMain;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 py-4">
      <div className="lg:col-span-2">
        <CampusMap campuses={campuses} selectedCampusId={selectedCampusId} />
      </div>
      <div className="lg:col-span-1">
        <CampusPanel universityId={universityId} selectedCampus={selected} />
      </div>
    </div>
  );
}

export default CampusLocationTab;
```

- [ ] **Step 2: Verify TS**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/university/campus-location/CampusLocationTab.tsx
git commit -m "feat(web): CampusLocationTab composes Map and Panel with fixed main selection"
```

---

### Task 17: Wire the tab into the detail page

**Files:**
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`

- [ ] **Step 1: Read the current detail page**

Run: `grep -n "tabItems\|qiangji" apps/web/src/app/\(main\)/universities/\[id\]/page.tsx | head -10`

Locate the `tabItems` array and the qiangji conditional spread (the existing pattern for conditional tabs).

- [ ] **Step 2: Add the import**

In `apps/web/src/app/(main)/universities/[id]/page.tsx`, near the other imports, add:

```tsx
import CampusLocationTab from '@/components/university/campus-location/CampusLocationTab';
```

- [ ] **Step 3: Insert the conditional Tab in `tabItems`**

Find the `...(u.qiangjiAdmissions?.length > 0 ? [...] : [])` block and add a similar block for campuses. Insert just before the qiangji block:

```tsx
...(u.campuses && u.campuses.length > 0
  ? [
      {
        key: 'campus',
        label: (
          <span>
            <EnvironmentOutlined className="mr-1" />
            校区位置 ({u.campuses.length})
          </span>
        ),
        children: (
          <CampusLocationTab universityId={u.id} campuses={u.campuses} />
        ),
      },
    ]
  : []),
```

If `EnvironmentOutlined` isn't already imported in this file, add it to the existing icon imports from `@ant-design/icons`.

- [ ] **Step 4: TS check**

Run: `cd apps/web && pnpm tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Build check**

Run: `cd apps/web && pnpm build`

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(main\)/universities/\[id\]/page.tsx
git commit -m "feat(web): conditionally render 校区位置 tab on university detail page"
```

---

### Task 18: Stage 1 visual verification (manual)

**Files:**
- None (this is a runtime check, not a code change)

> **Why this exists:** Static tests don't catch visual regressions. The user explicitly wants to "see the effect" before Stage 2. This task runs the dev server and asks the engineer to verify a small set of expected behaviors.

- [ ] **Step 1: Configure dev environment**

Create or edit `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_AMAP_JS_KEY=dcfcc876bf8794f4a63da60de5b88b5b
NEXT_PUBLIC_AMAP_JS_SECURITY=<your SL_JS jscode from AMap console>
```

> The SL_JS jscode value is in the user's AMap console under the SL_JS key's "Security key" field. The user provided it once during brainstorming; if not in env, ask before continuing.

- [ ] **Step 2: Start the dev servers**

Two terminals:

Terminal A:
```bash
cd apps/server && pnpm dev
```

Terminal B (after server is up):
```bash
cd apps/web && pnpm dev
```

- [ ] **Step 3: Open three test universities and verify**

In a browser, open each URL and verify the listed criteria:

| URL | Expected |
|---|---|
| `http://localhost:3000/universities/<清华大学 id>` | Tab "校区位置 (1)" appears; map shows 1 blue marker; right panel shows "本部" with subway POIs |
| `http://localhost:3000/universities/<哈尔滨工业大学 id>` | Tab "校区位置 (3)" appears (if backfill found 3 campuses); map shows blue + 2 grey markers; fitBounds includes威海 + 深圳 |
| `http://localhost:3000/universities/<某 invalid 院校 id>` | Tab "校区位置" **does NOT appear** (failure-silent) |

To find the IDs, query DB:
```bash
ssh -i cube.pem ubuntu@132.232.245.53 'cd ~/apps/volunteer-helper/apps/server && set -a && . .env && set +a && U=$(echo "$DATABASE_URL"|cut -d/ -f3|cut -d: -f1) && P=$(echo "$DATABASE_URL"|cut -d: -f3|cut -d@ -f1) && H=$(echo "$DATABASE_URL"|cut -d@ -f2|cut -d: -f1) && N=$(echo "$DATABASE_URL"|cut -d/ -f4|cut -d? -f1) && mysql -u"$U" -p"$P" -h"$H" "$N" -sN -e "SELECT id, name FROM universities WHERE name IN (\"清华大学\",\"哈尔滨工业大学\",\"电子科技大学\") AND geo_status = \"verified\"; SELECT id, name FROM universities WHERE geo_status = \"invalid\" LIMIT 1;"'
```

- [ ] **Step 4: If any criterion fails, file the issue**

If anything is wrong (Tab missing on verified, marker position off, panel layout broken, console errors):
- Stop here.
- Write a bullet list of observed issues.
- Report status DONE_WITH_CONCERNS in the implementer report.

The Stage 2 plan picks up from here: switcher + multi-category POI + responsive + error edges + tests.

- [ ] **Step 5: Commit screenshot or log of verification**

If verification passes, no commit needed (no code changed). Just record in the report:
- "Verified on universities X, Y, Z — all pass."
- Approximate dev console error count (should be 0 from our code).

---

## Self-Review (Plan-Author)

### Spec Coverage Trace

| Spec section | Plan task |
|---|---|
| § 2.1 Detail interface campuses | Task 1 + Task 2 |
| § 2.2 POI endpoint | Task 3 + Task 4 + Task 5 |
| § 2.3 Auth (public) | Task 5 (no JWT decorator added) |
| § 3.1 Component tree | Tasks 8-16 |
| § 3.2 Detail page mount point | Task 17 |
| § 3.3 Stage 1 data flow | Tasks 11, 12, 14, 16 |
| § 3.4 AMap loader | Task 9 |
| § 3.5 CampusMap implementation | Task 15 |
| § 3.6 Stage 1 layout | Task 16 (grid lg:grid-cols-3) |
| § 5 Env vars | Task 7 (.env.example) + Task 18 (.env.local) |
| § 6.1 Backend unit tests | Task 1 / Task 4 |
| § 6.2 Backend e2e | Task 6 |
| § 6.3 Frontend unit tests | Task 11 (usePoi) + Task 12 (PoiList) |
| § 6.4 Frontend integration tests | **Stage 2 — explicitly out of scope per spec § 1.1** |

**Spec items intentionally deferred to Stage 2:**
- CampusSwitcher (spec § 1.1)
- POI mall + airport (spec § 1.1)
- Responsive < 1024 (spec § 1.1, § 8)
- ErrorBoundary wrapping (spec § 4)
- AMap domain whitelist (spec § 5, § 9)

### Placeholder & Consistency Checks

- ✓ No "TBD" / "fill in later" / "similar to Task N".
- ✓ Method names verified: `findOne` confirmed at `university.service.ts:85` (Task 1 step 3 documents how to swap if codebase uses `getById`).
- ✓ Type `Campus` and `Poi` defined in Task 8, used identically in Tasks 11 / 12 / 13 / 14 / 15 / 16.
- ✓ `usePoi` signature: `{ universityId, campusId, category, limit? }` — same in Task 11 (definition) and Task 12 (call from PoiList).
- ✓ `loadAMap()` returns `Promise<typeof AMap>` — same in Task 9 (definition) and Task 15 (consumption).
- ✓ POI categories enum `'subway' | 'mall' | 'airport'` consistent across Task 3 (DTO), Task 4 (service), Task 8 (frontend types), Task 12 (PoiList).
- ✓ Endpoint URL: `/universities/:uniId/campuses/:campusId/pois` consistent in Task 5 (controller), Task 10 (api client), Task 6 (e2e test).
- ✓ Coercion: `decimalToNumber` only called for fields documented as `Decimal` in schema (lat/lng/nearestAirportKm). Integer fields like `nearestSubwayMeters` stay `number` natively.

### Known Caveats

1. **Task 6 e2e test will only run if dev DB is reachable**. If not, document and skip — Task 4 unit tests cover the service logic.
2. **Task 18 visual verification requires the user's AMap jscode** in `.env.local`. The implementer should ask if not provided.
3. **CampusMap (Task 15) has no unit test** by design — AMap canvas isn't testable in jsdom. Verification is in Task 18.
4. **`@testing-library/react` may not be installed**. Task 11 step 3 handles this conditionally.

### Total Stats

- **Tasks:** 18 (Stage 1 only)
- **Phases:** 3
- **New files:** ~13 (server: 3 / web: 10)
- **Modified files:** 4 (server: 3 / web: 4)
- **New deps:** `@amap/amap-jsapi-loader` (web runtime), possibly `@testing-library/react` (web dev)
- **Commits:** ~18-20
