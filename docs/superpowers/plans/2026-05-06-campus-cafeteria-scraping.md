# Campus Cafeteria Scraping Implementation Plan (MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data layer to scrape every university's on-campus cafeterias from AMap and persist into a new `UniversityCampusFacility` table, queryable per campus.

**Architecture:** A pure-function `FacilityScorer` decides which AMap POIs are real on-campus cafeterias based on distance + name match + typecode. A `CafeteriaScraper` service orchestrates per-uni AMap calls + scoring + DB upsert. A CLI script runs the backfill across all 2237 universities.

**Tech Stack:** TypeScript, NestJS, Prisma + MariaDB, Jest, AMap `/place/text` API.

**Spec reference:** [`docs/superpowers/specs/2026-05-06-campus-cafeteria-scraping-design.md`](../specs/2026-05-06-campus-cafeteria-scraping-design.md)

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `apps/server/prisma/schema.prisma` | Add `UniversityCampusFacility` model + `facilities` relation on `UniversityCampus` | Modify |
| `apps/server/prisma/migrations/<auto>/migration.sql` | Auto-generated schema migration | Create |
| `apps/server/src/modules/geo/facilities/facility-scorer.service.ts` | Pure scoring: `(pois, campuses, uniName) → ScoredFacility[]` | Create |
| `apps/server/src/modules/geo/facilities/facility-scorer.service.spec.ts` | Unit tests for scorer | Create |
| `apps/server/src/modules/geo/facilities/cafeteria-scraper.service.ts` | Per-uni: fetch AMap → score → upsert DB | Create |
| `apps/server/src/modules/geo/facilities/cafeteria-scraper.service.spec.ts` | Unit/integration tests with mocked AMap | Create |
| `apps/server/src/modules/geo/geo.module.ts` | Register the two new services in providers/exports | Modify |
| `apps/server/scripts/geo-cafeteria-backfill.ts` | CLI: iterate all universities, call scraper, write JSON report | Create |

---

### Task 1: Prisma migration for UniversityCampusFacility

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<auto>/migration.sql`

- [ ] **Step 1: Add the new model + relation**

In `apps/server/prisma/schema.prisma`, find the existing `UniversityCampus` model. Add `facilities UniversityCampusFacility[]` to its fields list (anywhere in the field block; below the existing `pois UniversityCampusPoi[]` line is a natural spot).

Then add this NEW model in the file (place it right after the existing `UniversityCampusPoi` model definition):

```prisma
model UniversityCampusFacility {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  campusId  Int      @map("campus_id")

  category String @db.VarChar(30)
  name     String @db.VarChar(200)

  latitude  Decimal @db.Decimal(9, 6)
  longitude Decimal @db.Decimal(9, 6)
  address   String? @db.VarChar(500)

  amapId         String @map("amap_id") @db.VarChar(50)
  typecode       String @db.VarChar(100)
  distanceMeters Int    @map("distance_meters")

  confidence  String @db.VarChar(10)
  matchMethod String @map("match_method") @db.VarChar(30)
  source      String @default("amap_text") @db.VarChar(30)

  fetchedAt DateTime @default(now()) @map("fetched_at")
  obsolete  Boolean  @default(false)

  campus UniversityCampus @relation(fields: [campusId], references: [id], onDelete: Cascade)

  @@unique([campusId, amapId])
  @@index([campusId, category])
  @@index([category, confidence])
  @@map("university_campus_facilities")
}
```

- [ ] **Step 2: Generate migration**

```bash
cd apps/server && pnpm prisma migrate dev --name add_university_campus_facility --create-only
```

This creates a new migration directory under `prisma/migrations/` containing `migration.sql`. Inspect the generated SQL and confirm it only:
- Creates `university_campus_facilities` table with the right columns
- Creates the unique index `(campus_id, amap_id)`
- Creates the two `@@index` btree indexes
- Adds the FK to `university_campuses`

If the generated SQL contains anything else (e.g., it tries to drop other tables), STOP and report — something is wrong.

- [ ] **Step 3: Apply migration**

```bash
cd apps/server && pnpm prisma migrate dev
```

Expected: migration applies, `prisma generate` runs, no errors.

- [ ] **Step 4: Verify table exists**

```bash
cd apps/server && node -e "
require('dotenv').config();
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
p.universityCampusFacility.count().then(c=>{console.log('count:',c); return p.\$disconnect();});
"
```

Expected: `count: 0`. (If it errors with "Unknown model", regenerate Prisma client with `pnpm prisma generate`.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(geo): add UniversityCampusFacility model + migration"
```

---

### Task 2: FacilityScorer — RED tests

**Files:**
- Create: `apps/server/src/modules/geo/facilities/facility-scorer.service.spec.ts`

- [ ] **Step 1: Create the spec file with all RED test cases**

Create `apps/server/src/modules/geo/facilities/facility-scorer.service.spec.ts` with this content:

```ts
import { FacilityScorer } from './facility-scorer.service';

interface CampusInput {
  id: number;
  latitude: number;
  longitude: number;
}

interface PoiInput {
  id: string;        // amapId
  name: string;
  typecode: string;
  location: string;  // "lng,lat"
  address?: string;
}

describe('FacilityScorer.score', () => {
  const scorer = new FacilityScorer();

  // 清华大学主坐标 (校区 id=1)
  const campus = { id: 1, latitude: 40.003213, longitude: 116.326936 };

  it('classifies POI starting with uniName + close as HIGH', () => {
    const poi: PoiInput = {
      id: 'P1', name: '清华大学万人食堂', typecode: '050100',
      location: '116.322425,40.006875',  // ~450m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      amapId: 'P1', accept: true, campusId: 1,
      confidence: 'high', matchMethod: 'name_prefix',
    });
    expect(out[0].distanceMeters).toBeLessThan(800);
  });

  it('classifies POI containing uniName but not starting with it as MEDIUM', () => {
    const poi: PoiInput = {
      id: 'P2', name: '北京清华大学家属餐厅', typecode: '050100',
      location: '116.327000,40.005000',
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ confidence: 'medium', matchMethod: 'name_contains', accept: true });
  });

  it('classifies cafeteria-keyword POI within 500m + 050 typecode as LOW', () => {
    const poi: PoiInput = {
      id: 'P3', name: '紫荆园餐厅', typecode: '050100',
      location: '116.327500,40.004000',  // ~150m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ confidence: 'low', matchMethod: 'typecode_radius', accept: true });
  });

  it('rejects POI at 800m exactly (boundary, ≥800 = reject)', () => {
    // 800m east of campus: lng delta = 800 / (111320 * cos(40)) ≈ 0.00939
    const poi: PoiInput = {
      id: 'P4', name: '清华大学远程食堂', typecode: '050100',
      location: '116.336326,40.003213',
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('rejects POI further than 800m', () => {
    const poi: PoiInput = {
      id: 'P5', name: '清华大学附属医院食堂', typecode: '050100',
      location: '116.350000,40.010000',  // > 800m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('rejects POI without uni name and not within 500m + 050', () => {
    const poi: PoiInput = {
      id: 'P6', name: '某餐厅', typecode: '050100',
      location: '116.330500,40.005000',  // ~600m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('rejects POI with non-050 typecode and no uni name match', () => {
    const poi: PoiInput = {
      id: 'P7', name: '清华路便利店', typecode: '060100', // 060 = mall, not 050
      location: '116.327000,40.004000',
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('assigns POI to nearest campus when uni has multiple campuses', () => {
    const campuses: CampusInput[] = [
      { id: 1, latitude: 40.003213, longitude: 116.326936 }, // 清华本部
      { id: 2, latitude: 39.999000, longitude: 116.327000 }, // 假想南区分校 ~470m
    ];
    const poi: PoiInput = {
      id: 'P8', name: '清华大学南区食堂', typecode: '050100',
      location: '116.327200,39.999100',  // 离 campus 2 更近
    };
    const out = scorer.score([poi], campuses, '清华大学');
    expect(out[0]).toMatchObject({ campusId: 2, accept: true, confidence: 'high' });
  });

  it('returns distanceMeters as integer (Haversine)', () => {
    const poi: PoiInput = {
      id: 'P9', name: '清华大学测试', typecode: '050100',
      location: '116.336326,40.003213',  // ~800m east
    };
    const out = scorer.score([poi], [campus], '清华大学');
    // We expect approx 799-801m here; exact value depends on Haversine implementation
    expect(out[0].distanceMeters).toBeGreaterThanOrEqual(795);
    expect(out[0].distanceMeters).toBeLessThanOrEqual(805);
    expect(Number.isInteger(out[0].distanceMeters)).toBe(true);
  });

  it('returns empty array for empty POI input', () => {
    expect(scorer.score([], [campus], '清华大学')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they FAIL**

```bash
cd apps/server && pnpm jest src/modules/geo/facilities/facility-scorer.service.spec.ts -v
```

Expected: All 10 tests FAIL with TypeScript error like "Cannot find module './facility-scorer.service'" — this is the correct RED reason.

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/server/src/modules/geo/facilities/facility-scorer.service.spec.ts
git commit -m "test(geo): RED for FacilityScorer cafeteria classifier"
```

---

### Task 3: FacilityScorer — GREEN implementation

**Files:**
- Create: `apps/server/src/modules/geo/facilities/facility-scorer.service.ts`

- [ ] **Step 1: Create the implementation file**

Create `apps/server/src/modules/geo/facilities/facility-scorer.service.ts` with this content:

```ts
import { Injectable } from '@nestjs/common';

export interface ScorerCampus {
  id: number;
  latitude: number;
  longitude: number;
}

export interface ScorerPoi {
  id: string;
  name: string;
  typecode: string;
  location: string;
  address?: string;
}

export interface ScoredFacility {
  amapId: string;
  name: string;
  typecode: string;
  latitude: number;
  longitude: number;
  address?: string;
  campusId: number;
  distanceMeters: number;
  accept: boolean;
  confidence: 'high' | 'medium' | 'low' | null;
  matchMethod: 'name_prefix' | 'name_contains' | 'typecode_radius' | null;
}

const REJECT_DISTANCE_M = 800;
const TYPECODE_RADIUS_DISTANCE_M = 500;
const CAFETERIA_KEYWORDS = ['食堂', '餐厅', '园', '苑'];

function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371000; // earth radius (m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class FacilityScorer {
  score(
    pois: ScorerPoi[],
    campuses: ScorerCampus[],
    uniName: string,
  ): ScoredFacility[] {
    return pois.map((poi) => this.scoreOne(poi, campuses, uniName));
  }

  private scoreOne(
    poi: ScorerPoi,
    campuses: ScorerCampus[],
    uniName: string,
  ): ScoredFacility {
    const [lng, lat] = poi.location.split(',').map(Number);

    // Find nearest campus
    let nearest = campuses[0];
    let nearestDist = haversineMeters(lat, lng, nearest.latitude, nearest.longitude);
    for (const c of campuses.slice(1)) {
      const d = haversineMeters(lat, lng, c.latitude, c.longitude);
      if (d < nearestDist) { nearest = c; nearestDist = d; }
    }
    const distanceMeters = Math.round(nearestDist);

    const base = {
      amapId: poi.id, name: poi.name, typecode: poi.typecode,
      latitude: lat, longitude: lng, address: poi.address,
      campusId: nearest.id, distanceMeters,
    };

    if (distanceMeters >= REJECT_DISTANCE_M) {
      return { ...base, accept: false, confidence: null, matchMethod: null };
    }

    if (poi.name.startsWith(uniName)) {
      return { ...base, accept: true, confidence: 'high', matchMethod: 'name_prefix' };
    }

    if (poi.name.includes(uniName)) {
      return { ...base, accept: true, confidence: 'medium', matchMethod: 'name_contains' };
    }

    const hasKeyword = CAFETERIA_KEYWORDS.some((k) => poi.name.includes(k));
    const isCateringTypecode = poi.typecode.startsWith('050');
    if (hasKeyword && isCateringTypecode && distanceMeters <= TYPECODE_RADIUS_DISTANCE_M) {
      return { ...base, accept: true, confidence: 'low', matchMethod: 'typecode_radius' };
    }

    return { ...base, accept: false, confidence: null, matchMethod: null };
  }
}
```

- [ ] **Step 2: Run tests to verify they PASS**

```bash
cd apps/server && pnpm jest src/modules/geo/facilities/facility-scorer.service.spec.ts -v
```

Expected: All 10 tests PASS.

- [ ] **Step 3: Commit (GREEN)**

```bash
git add apps/server/src/modules/geo/facilities/facility-scorer.service.ts
git commit -m "feat(geo): FacilityScorer for cafeteria classification"
```

---

### Task 4: CafeteriaScraper — RED tests

**Files:**
- Create: `apps/server/src/modules/geo/facilities/cafeteria-scraper.service.spec.ts`

- [ ] **Step 1: Create the spec file**

Create `apps/server/src/modules/geo/facilities/cafeteria-scraper.service.spec.ts`:

```ts
import { CafeteriaScraper, ScraperResult } from './cafeteria-scraper.service';
import { FacilityScorer } from './facility-scorer.service';
import { AmapClient } from '../amap/amap.client';
import { PrismaService } from '@/prisma/prisma.service';

function fakeAmap(overrides: Partial<AmapClient> = {}): AmapClient {
  return { searchPlaceText: jest.fn(), ...overrides } as unknown as AmapClient;
}

function fakePrisma(opts: {
  campusFindMany?: jest.Mock;
  facilityUpsert?: jest.Mock;
} = {}): PrismaService {
  return {
    universityCampus: {
      findMany: opts.campusFindMany ?? jest.fn().mockResolvedValue([]),
    },
    universityCampusFacility: {
      upsert: opts.facilityUpsert ?? jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

describe('CafeteriaScraper.scrapeOne', () => {
  it('fetches AMap, scores POIs, upserts accepted facilities', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([
      {
        id: 'P1', name: '清华大学万人食堂', typecode: '050100',
        location: '116.322425,40.006875', address: '观畴园B1层',
      },
      {
        id: 'P2', name: '街边小炒', typecode: '050100',
        location: '116.350000,40.010000',
      },
    ]);
    const amap = fakeAmap({ searchPlaceText });
    const facilityUpsert = jest.fn().mockResolvedValue({});
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    const result: ScraperResult = await scraper.scrapeOne({
      universityId: 1, universityName: '清华大学', city: '北京',
    });

    expect(searchPlaceText).toHaveBeenCalledWith('清华大学食堂', { city: '北京' });
    expect(facilityUpsert).toHaveBeenCalledTimes(1);
    expect(facilityUpsert.mock.calls[0][0].create).toMatchObject({
      campusId: 11, amapId: 'P1', name: '清华大学万人食堂',
      confidence: 'high', matchMethod: 'name_prefix', category: 'cafeteria',
    });
    expect(result).toEqual({ fetched: 2, accepted: 1, rejected: 1, written: 1 });
  });

  it('returns zero counts and no upserts when AMap returns empty', async () => {
    const amap = fakeAmap({ searchPlaceText: jest.fn().mockResolvedValue([]) });
    const facilityUpsert = jest.fn();
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    const result = await scraper.scrapeOne({
      universityId: 1, universityName: '清华大学', city: '北京',
    });

    expect(facilityUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, accepted: 0, rejected: 0, written: 0 });
  });

  it('skips and returns zero when uni has no campuses with coords', async () => {
    const amap = fakeAmap({ searchPlaceText: jest.fn() });
    const facilityUpsert = jest.fn();
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    const result = await scraper.scrapeOne({
      universityId: 1, universityName: '清华大学', city: '北京',
    });

    expect(amap.searchPlaceText).not.toHaveBeenCalled();
    expect(facilityUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, accepted: 0, rejected: 0, written: 0 });
  });

  it('propagates AmapApiError without catching', async () => {
    const { AmapApiError } = await import('../amap/amap.types');
    const searchPlaceText = jest.fn()
      .mockRejectedValue(new AmapApiError('AMap geocode failed: INVALID_USER_KEY', 'INVALID_USER_KEY'));
    const amap = fakeAmap({ searchPlaceText });
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    await expect(
      scraper.scrapeOne({ universityId: 1, universityName: '清华大学', city: '北京' }),
    ).rejects.toThrow('INVALID_USER_KEY');
  });

  it('upsert payload includes all required fields including update path', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'P1', name: '清华大学万人食堂', typecode: '050100',
      location: '116.322425,40.006875', address: '观畴园B1层',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const facilityUpsert = jest.fn().mockResolvedValue({});
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    await scraper.scrapeOne({ universityId: 1, universityName: '清华大学', city: '北京' });

    const call = facilityUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ campusId_amapId: { campusId: 11, amapId: 'P1' } });
    expect(call.update).toMatchObject({ obsolete: false });
    expect(call.update.fetchedAt).toBeInstanceOf(Date);
    expect(call.create).toMatchObject({
      campusId: 11, amapId: 'P1', category: 'cafeteria',
      name: '清华大学万人食堂', typecode: '050100',
      confidence: 'high', matchMethod: 'name_prefix', source: 'amap_text',
      address: '观畴园B1层',
    });
    expect(typeof call.create.distanceMeters).toBe('number');
    expect(typeof call.create.latitude).toBe('number');
    expect(typeof call.create.longitude).toBe('number');
  });
});
```

- [ ] **Step 2: Run tests to verify they FAIL**

```bash
cd apps/server && pnpm jest src/modules/geo/facilities/cafeteria-scraper.service.spec.ts -v
```

Expected: 5 FAILs with "Cannot find module './cafeteria-scraper.service'".

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/server/src/modules/geo/facilities/cafeteria-scraper.service.spec.ts
git commit -m "test(geo): RED for CafeteriaScraper"
```

---

### Task 5: CafeteriaScraper — GREEN implementation

**Files:**
- Create: `apps/server/src/modules/geo/facilities/cafeteria-scraper.service.ts`

- [ ] **Step 1: Create the implementation file**

Create `apps/server/src/modules/geo/facilities/cafeteria-scraper.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AmapClient } from '../amap/amap.client';
import { PrismaService } from '@/prisma/prisma.service';
import { FacilityScorer, ScorerPoi } from './facility-scorer.service';

export interface ScrapeOneInput {
  universityId: number;
  universityName: string;
  city?: string;
}

export interface ScraperResult {
  fetched: number;
  accepted: number;
  rejected: number;
  written: number;
}

@Injectable()
export class CafeteriaScraper {
  constructor(
    private readonly amap: AmapClient,
    private readonly prisma: PrismaService,
    private readonly scorer: FacilityScorer,
  ) {}

  async scrapeOne(input: ScrapeOneInput): Promise<ScraperResult> {
    const campusRows = await this.prisma.universityCampus.findMany({
      where: {
        universityId: input.universityId,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, latitude: true, longitude: true },
    });
    if (campusRows.length === 0) {
      return { fetched: 0, accepted: 0, rejected: 0, written: 0 };
    }
    const campuses = campusRows.map((c) => ({
      id: c.id,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
    }));

    const pois = await this.amap.searchPlaceText(
      `${input.universityName}食堂`,
      { city: input.city },
    );
    if (pois.length === 0) {
      return { fetched: 0, accepted: 0, rejected: 0, written: 0 };
    }

    const scorerInput: ScorerPoi[] = pois.map((p) => ({
      id: p.id,
      name: p.name,
      typecode: p.typecode,
      location: p.location,
      address: typeof p.address === 'string' ? p.address : undefined,
    }));
    const scored = this.scorer.score(scorerInput, campuses, input.universityName);

    let written = 0;
    const now = new Date();
    for (const s of scored) {
      if (!s.accept) continue;
      await this.prisma.universityCampusFacility.upsert({
        where: { campusId_amapId: { campusId: s.campusId, amapId: s.amapId } },
        update: { obsolete: false, fetchedAt: now },
        create: {
          campusId: s.campusId,
          amapId: s.amapId,
          category: 'cafeteria',
          name: s.name,
          typecode: s.typecode,
          latitude: s.latitude as any,
          longitude: s.longitude as any,
          address: s.address,
          distanceMeters: s.distanceMeters,
          confidence: s.confidence!,
          matchMethod: s.matchMethod!,
          source: 'amap_text',
          fetchedAt: now,
        },
      });
      written += 1;
    }

    const accepted = scored.filter((s) => s.accept).length;
    return {
      fetched: pois.length,
      accepted,
      rejected: scored.length - accepted,
      written,
    };
  }
}
```

- [ ] **Step 2: Run tests to verify they PASS**

```bash
cd apps/server && pnpm jest src/modules/geo/facilities/cafeteria-scraper.service.spec.ts -v
```

Expected: 5 PASSes.

- [ ] **Step 3: Run the full geo module test suite to confirm no regressions**

```bash
cd apps/server && pnpm jest src/modules/geo -v
```

Expected: All tests pass (existing + new).

- [ ] **Step 4: Commit (GREEN)**

```bash
git add apps/server/src/modules/geo/facilities/cafeteria-scraper.service.ts
git commit -m "feat(geo): CafeteriaScraper end-to-end (fetch + score + upsert)"
```

---

### Task 6: Wire into GeoModule

**Files:**
- Modify: `apps/server/src/modules/geo/geo.module.ts`

- [ ] **Step 1: Read the existing module file**

Read `apps/server/src/modules/geo/geo.module.ts` to find the `providers` and `exports` arrays.

- [ ] **Step 2: Add imports**

At the top of the file, alongside existing imports of GeoModule services, add:

```ts
import { FacilityScorer } from './facilities/facility-scorer.service';
import { CafeteriaScraper } from './facilities/cafeteria-scraper.service';
```

- [ ] **Step 3: Add to providers and exports**

In the `@Module({...})` decorator, add `FacilityScorer` and `CafeteriaScraper` to BOTH the `providers` array and the `exports` array. They go alongside the existing entries (e.g., `AmapClient`, `GeocoderService`, etc.).

- [ ] **Step 4: Type-check**

```bash
cd apps/server && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Run all tests**

```bash
cd apps/server && pnpm jest src/modules/geo
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/geo/geo.module.ts
git commit -m "feat(geo): register cafeteria services in GeoModule"
```

---

### Task 7: CLI backfill script

**Files:**
- Create: `apps/server/scripts/geo-cafeteria-backfill.ts`

- [ ] **Step 1: Create the CLI script**

Create `apps/server/scripts/geo-cafeteria-backfill.ts`:

```ts
/**
 * Backfill cafeteria POIs for every university.
 *
 * Usage:
 *   pnpm ts-node scripts/geo-cafeteria-backfill.ts
 *   pnpm ts-node scripts/geo-cafeteria-backfill.ts --resume
 *   pnpm ts-node scripts/geo-cafeteria-backfill.ts --filter 985
 *   pnpm ts-node scripts/geo-cafeteria-backfill.ts --limit 50
 */
import { NestFactory } from '@nestjs/core';
import { GeoCliModule } from './geo-cli.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CafeteriaScraper } from '../src/modules/geo/facilities/cafeteria-scraper.service';
import { makeBar, writeJsonReport, parseArgs } from './lib/cli-utils';

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const resume = flags.resume === true;
  const limit = flags.limit ? Number(flags.limit) : undefined;
  const filter = typeof flags.filter === 'string' ? flags.filter.split(',') : undefined;

  const app = await NestFactory.createApplicationContext(GeoCliModule, { logger: false });
  const prisma = app.get(PrismaService);
  const scraper = app.get(CafeteriaScraper);

  // Build the base WHERE
  const where: any = { geoStatus: 'verified' };
  if (filter) {
    where.OR = [];
    if (filter.includes('985')) where.OR.push({ is985: true });
    if (filter.includes('211')) where.OR.push({ is211: true });
    if (where.OR.length === 0) delete where.OR;
  }

  // Resume: skip universities whose any campus already has cafeteria facility rows
  if (resume) {
    const doneIds = await prisma.universityCampusFacility.findMany({
      where: { category: 'cafeteria' },
      select: { campus: { select: { universityId: true } } },
      distinct: ['campusId'],
    });
    const doneUniIds = new Set(doneIds.map((r) => r.campus.universityId));
    if (doneUniIds.size > 0) {
      where.id = { notIn: Array.from(doneUniIds) };
    }
  }

  const list = await prisma.university.findMany({
    where,
    select: { id: true, name: true, city: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

  console.log(`[cafeteria] target=${list.length} resume=${resume} filter=${filter ?? 'none'}`);
  const bar = makeBar(list.length, 'cafeteria');
  let totalFetched = 0, totalAccepted = 0, totalRejected = 0, totalWritten = 0;
  let ok = 0, err = 0, zero = 0;

  for (const uni of list) {
    try {
      const r = await scraper.scrapeOne({
        universityId: uni.id,
        universityName: uni.name,
        city: uni.city ?? undefined,
      });
      totalFetched += r.fetched;
      totalAccepted += r.accepted;
      totalRejected += r.rejected;
      totalWritten += r.written;
      if (r.written > 0) ok += 1;
      else zero += 1;
    } catch (e) {
      err += 1;
      console.error(`[cafeteria] error for university ${uni.id} (${uni.name}): ${(e as Error).message}`);
    }
    bar.increment(1, { ok, err });
  }
  bar.stop();

  const report = {
    timestamp: new Date().toISOString(),
    target: list.length,
    universitiesWithCafeteria: ok,
    universitiesWithoutCafeteria: zero,
    errors: err,
    poisFetched: totalFetched,
    poisAccepted: totalAccepted,
    poisRejected: totalRejected,
    facilitiesWritten: totalWritten,
    options: { resume, filter, limit },
  };
  const file = writeJsonReport('geo-cafeteria-backfill', report);
  console.log(`[cafeteria] done. report: ${file}`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check**

```bash
cd apps/server && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Local dry test (limit 1, against local DB if available)**

Note: this step is OPTIONAL — local MariaDB may not be set up. If `DATABASE_URL` connection fails, skip and rely on prod test in Task 9.

```bash
cd apps/server && pnpm ts-node scripts/geo-cafeteria-backfill.ts --limit 1
```

Expected (if DB connects): script runs end-to-end on 1 uni, prints report. If DB connection fails, that's OK — we'll verify on prod.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/geo-cafeteria-backfill.ts
git commit -m "feat(scripts): geo-cafeteria-backfill CLI"
```

---

### Task 8: Deploy to production (migration + code)

**Files:** none

- [ ] **Step 1: SCP the new source files to prod**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
scp -i cube.pem -o StrictHostKeyChecking=no apps/server/prisma/schema.prisma \
  ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/prisma/schema.prisma
scp -i cube.pem -o StrictHostKeyChecking=no -r apps/server/prisma/migrations \
  ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/prisma/
scp -i cube.pem -o StrictHostKeyChecking=no -r apps/server/src/modules/geo/facilities \
  ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/src/modules/geo/
scp -i cube.pem -o StrictHostKeyChecking=no apps/server/src/modules/geo/geo.module.ts \
  ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/src/modules/geo/geo.module.ts
scp -i cube.pem -o StrictHostKeyChecking=no apps/server/scripts/geo-cafeteria-backfill.ts \
  ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/scripts/geo-cafeteria-backfill.ts
```

Expected: all scp commands succeed.

- [ ] **Step 2: Apply Prisma migration on prod**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 \
  "cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && \
   pnpm prisma migrate deploy && pnpm prisma generate"
```

Expected: migration applies, prisma client regenerates. Output should mention `1 migration applied` or similar.

- [ ] **Step 3: Verify table exists on prod DB**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 "cat > /home/ubuntu/apps/volunteer-helper/apps/server/_check.js <<'EOF'
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
p.universityCampusFacility.count().then(c=>{console.log('count:',c); return p.\$disconnect();});
EOF
cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && node _check.js && rm _check.js"
```

Expected: `count: 0`.

> Note: `vh-server` (PM2) does NOT need restart — it doesn't use the new model yet.

---

### Task 9: Run backfill on prod and verify

**Files:** none

- [ ] **Step 1: Pilot run with --limit 10 first (sanity check)**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 \
  "cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && \
   ts-node \
     --require /home/ubuntu/apps/volunteer-helper/node_modules/.pnpm/tsconfig-paths@4.2.0/node_modules/tsconfig-paths/register \
     --transpile-only scripts/geo-cafeteria-backfill.ts --limit 10"
```

Expected: prints report at the end, e.g. `target=10 universitiesWithCafeteria=8+ facilitiesWritten=20+`. If errors > 0, STOP and investigate before full run.

- [ ] **Step 2: Spot-check the 10 piloted unis in DB**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 "cat > /home/ubuntu/apps/volunteer-helper/apps/server/_pilot.js <<'EOF'
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
(async()=>{
  const facs=await p.universityCampusFacility.findMany({
    where:{category:'cafeteria'},
    select:{name:true,confidence:true,distanceMeters:true,campus:{select:{name:true,university:{select:{name:true}}}}},
    take:50, orderBy:{id:'asc'},
  });
  for (const f of facs) console.log(f.campus.university.name,'|',f.campus.name,'|',f.name,'|',f.confidence,'|',f.distanceMeters,'m');
  console.log('total written:', facs.length);
  await p.\$disconnect();
})();
EOF
cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && node _pilot.js && rm _pilot.js"
```

Visually inspect output — names should look like real cafeterias (e.g., 食堂, 餐厅, 园, 苑). If 50%+ look obviously wrong (e.g., random KFC stores), STOP and re-tune the scorer.

- [ ] **Step 3: Full backfill run**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 \
  "cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && \
   nohup ts-node \
     --require /home/ubuntu/apps/volunteer-helper/node_modules/.pnpm/tsconfig-paths@4.2.0/node_modules/tsconfig-paths/register \
     --transpile-only scripts/geo-cafeteria-backfill.ts --resume \
     > logs/cafeteria-backfill-2026-05-06.log 2>&1 < /dev/null & \
   echo PID=\$! && disown"
```

Expected: PID printed.

- [ ] **Step 4: Wait for completion (~25 min total at QPS=2)**

Wait 25 minutes. Check progress with:

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 \
  "pgrep -af 'geo-cafeteria-backfill' || echo FINISHED; \
   tail -3 /home/ubuntu/apps/volunteer-helper/apps/server/logs/cafeteria-backfill-2026-05-06.log"
```

When FINISHED, proceed to Step 5.

- [ ] **Step 5: Read final report**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 \
  "ls -t /home/ubuntu/apps/volunteer-helper/apps/server/logs/geo-cafeteria-backfill-*.json | head -1 | xargs cat"
```

Expected: `target ≈ 2237`, `facilitiesWritten ≥ 5000`, `errors ≤ 20`.

- [ ] **Step 6: Verify confidence distribution**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 "cat > /home/ubuntu/apps/volunteer-helper/apps/server/_dist.js <<'EOF'
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
(async()=>{
  const total=await p.universityCampusFacility.count({where:{category:'cafeteria'}});
  console.log('total cafeterias:', total);
  const groups=await p.universityCampusFacility.groupBy({
    by:['confidence'], where:{category:'cafeteria'}, _count:{_all:true},
  });
  for (const g of groups) console.log('  ',g.confidence,':',g._count._all);
  const noFac = await p.university.count({
    where:{geoStatus:'verified',campuses:{none:{facilities:{some:{category:'cafeteria'}}}}},
  });
  console.log('universities with NO cafeteria found:', noFac);
  await p.\$disconnect();
})();
EOF
cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && node _dist.js && rm _dist.js"
```

Expected: total ≥ 5000; HIGH should be ~30-50%, MEDIUM ~30-50%, LOW < 30% (rough heuristic — no hard rule). Universities with no cafeteria should be ≤ 200 (likely small职校/分校 with sparse AMap data).

- [ ] **Step 7: Spot-check 10 universities (5 985 + 5 二本/职校)**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 "cat > /home/ubuntu/apps/volunteer-helper/apps/server/_spot.js <<'EOF'
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
(async()=>{
  const targetNames=['清华大学','北京大学','复旦大学','浙江大学','西南交通大学','黄淮学院','钦州学院','盘锦职业技术学院','厦门大学','武汉大学'];
  for (const name of targetNames) {
    const uni=await p.university.findFirst({where:{name},select:{id:true}});
    if (!uni) { console.log(name,'NOT_FOUND'); continue; }
    const facs=await p.universityCampusFacility.findMany({
      where:{category:'cafeteria',campus:{universityId:uni.id}},
      select:{name:true,confidence:true,distanceMeters:true,campus:{select:{name:true}}},
      orderBy:[{confidence:'desc'},{distanceMeters:'asc'}], take:5,
    });
    console.log('\\n=== '+name+' ('+facs.length+' total shown, top 5) ===');
    for (const f of facs) console.log('  ',f.campus.name,'|',f.name,'|',f.confidence,'|',f.distanceMeters,'m');
  }
  await p.\$disconnect();
})();
EOF
cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && node _spot.js && rm _spot.js"
```

Expected: Top schools (清北复浙) should show 3-10 plausible-looking cafeteria names (e.g., 万人食堂, 学一食堂, 紫荆园 etc.). Vocational schools may show 0-3 entries — that's OK if data is genuinely sparse on AMap.

---

### Task 10: Push branch + mark spec implemented

**Files:**
- Modify: `docs/superpowers/specs/2026-05-06-campus-cafeteria-scraping-design.md`

- [ ] **Step 1: Update spec status**

In the spec file, change line 4 from:

```markdown
**状态**：approved, pending implementation
```

to:

```markdown
**状态**：implemented 2026-05-06
```

- [ ] **Step 2: Commit and push**

```bash
git add docs/superpowers/specs/2026-05-06-campus-cafeteria-scraping-design.md
git commit -m "docs(geo): mark cafeteria scraping spec as implemented"
git push origin master
```

Expected: push succeeds.

---

## Self-review notes

**Spec coverage:**
- Spec §"数据 schema" → Task 1
- Spec §"采集逻辑 (5 步)" → Task 3 (scorer) + Task 5 (scraper orchestration)
- Spec §"模块/文件结构" → Tasks 1-7 produce all files in the spec's structure
- Spec §"测试策略 → Scorer 单测" → Task 2 (10 test cases covering all branches in spec table)
- Spec §"测试策略 → Scraper 集成测" → Task 4 (5 test cases: success, empty AMap, no campuses, error propagation, upsert payload)
- Spec §"测试策略 → 生产验证" → Task 9 Steps 5-7 (report check, distribution check, spot-check 10 unis)
- Spec §"CLI 脚本 → resume" → Task 7 (resume flag implemented via NOT IN query)
- Spec §"调用预算 / 失败模式 / 回滚" → addressed implicitly by scorer thresholds + Task 9 pilot

**Placeholder scan:** none. Every code block is complete; every command has expected output.

**Type consistency:**
- `ScorerCampus { id, latitude, longitude }` — used identically in scorer (Task 3) and scraper (Task 5) via `campuses.map(...)`.
- `ScorerPoi { id, name, typecode, location, address? }` — exported from scorer, used in scraper.
- `ScoredFacility` shape — produced by scorer, consumed by scraper (which reads `accept`, `confidence`, `matchMethod`, `distanceMeters`, etc. — all defined in Task 3).
- `ScraperResult { fetched, accepted, rejected, written }` — defined in Task 5, exported and used in CLI Task 7.
- Prisma model name `universityCampusFacility` (Pascal `UniversityCampusFacility` in schema) — consistent across Tasks 1, 5, 7, 9.
- Prisma upsert composite where `campusId_amapId: { campusId, amapId }` — matches the `@@unique([campusId, amapId])` declared in Task 1.
