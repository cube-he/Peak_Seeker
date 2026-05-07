# Campus Geocoding Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where every branch campus inherits the main campus's coordinates, leaving multi-campus universities with overlapping markers on the map.

**Architecture:** Replace `geocodeCampus`'s first-step `amap.geocode` call with `amap.searchPlaceText` (POI search filtered by typecode `141201` 高等院校), drop the `city` hint that was leaking the main campus's city, and add a haversine pollution guard that rejects results within 300m of the main campus. Re-run targeted backfill on multi-campus universities and spot-check via the public API.

**Tech Stack:** NestJS, Jest, Prisma (MariaDB), AMap Web Service API, ts-node CLI scripts.

**Spec:** `docs/superpowers/specs/2026-05-07-campus-geocoding-fix-design.md`

---

## File Structure

**Modified:**
- `apps/server/src/modules/geo/services/geocoder.service.ts` — rewrite `geocodeCampus`, drop `hint.city`, add `mainCoords` parameter, add haversine pollution guard
- `apps/server/src/modules/geo/services/geocoder.service.spec.ts` — update 3 existing `geocodeCampus` specs (signature change), add 4 new RED specs covering pollution guard
- `apps/server/scripts/geo-backfill.ts` — pass `main` coords to `geocodeCampus`; skip campus geocoding when main itself failed; add `--ids` CLI flag for targeted runs

**Read-only references:**
- `apps/server/src/modules/geo/utils/haversine.ts` — already exports `haversineMeters(lat1, lng1, lat2, lng2)`; reuse
- `apps/server/scripts/lib/cli-utils.ts` — `parseArgs` already supports `--ids 1,2,3` form

---

## Task 1: RED — write failing tests for new `geocodeCampus` behavior

**Files:**
- Modify: `apps/server/src/modules/geo/services/geocoder.service.spec.ts`

The existing `describe('GeocoderService.geocodeCampus', ...)` block (lines 46-127) tests the *old* `(uniName, campusName, { city })` signature plus a `geocode` → fallback flow. The new signature is `(uniName, campusName, mainCoords)` with `searchPlaceText` as the *only* path. Replace the entire describe block.

- [ ] **Step 1: Replace `describe('GeocoderService.geocodeCampus', ...)` block (lines 46-127) with new tests**

```ts
describe('GeocoderService.geocodeCampus', () => {
  const mainCoords = { latitude: 30.819352, longitude: 104.182965 };

  it('returns POI result when campus is far from main', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '西南石油大学南充校区',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '106.110000,31.750000',
      address: '南充市顺庆区',
      pname: '四川省', cityname: '南充市', adname: '顺庆区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '南充', mainCoords);

    expect(searchPlaceText).toHaveBeenCalledWith(
      '西南石油大学南充',
      { types: '141201' },
    );
    expect(result?.source).toBe('amap_poi');
    expect(result?.city).toBe('南充市');
    expect(result?.latitude).toBeCloseTo(31.75, 2);
  });

  it('returns null when result coords coincide with main coords (pollution)', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '西南石油大学',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.182965,30.819352',  // identical to main
      address: '成都市', pname: '四川省', cityname: '成都市', adname: '新都区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '南充', mainCoords);

    expect(result).toBeNull();
  });

  it('returns null when result is within 300m of main (just inside threshold)', async () => {
    // ~250m east of mainCoords (Δlng ≈ 0.0026 at 30.8°N → ~248m)
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '某分校',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.185565,30.819352',
      address: 'X', pname: '四川省', cityname: '成都市', adname: '新都区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '某', mainCoords);

    expect(result).toBeNull();
  });

  it('returns POI result when result is just outside 300m threshold', async () => {
    // ~360m east of mainCoords (Δlng ≈ 0.0038 at 30.8°N → ~363m)
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '某分校',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.186765,30.819352',
      address: 'X', pname: '四川省', cityname: '成都市', adname: '新都区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '某', mainCoords);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('amap_poi');
  });

  it('returns null when searchPlaceText returns empty array', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '南充', mainCoords);

    expect(result).toBeNull();
  });

  it('does not call amap.geocode (only PlaceSearch path remains)', async () => {
    const geocode = jest.fn();
    const searchPlaceText = jest.fn().mockResolvedValue([]);
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    await svc.geocodeCampus('某大学', '某', mainCoords);

    expect(geocode).not.toHaveBeenCalled();
    expect(searchPlaceText).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run from `apps/server`:
```bash
pnpm jest src/modules/geo/services/geocoder.service.spec.ts -t geocodeCampus
```

Expected: TypeScript compile error (`Argument of type '{ latitude: number; longitude: number }' is not assignable to parameter of type '{ city?: string; province?: string }'`) OR runtime failures on every assertion. Either is acceptable RED.

---

## Task 2: GREEN — implement new `geocodeCampus`

**Files:**
- Modify: `apps/server/src/modules/geo/services/geocoder.service.ts`

- [ ] **Step 1: Replace `geocodeCampus` method (lines 37-55) with new implementation**

```ts
async geocodeCampus(
  universityName: string,
  campusName: string,
  mainCoords: { latitude: number; longitude: number },
): Promise<GeoResult | null> {
  const query = `${universityName}${campusName}`;
  const pois = await this.amap.searchPlaceText(query, { types: '141201' });
  if (pois.length === 0) return null;
  const result = this.fromPoi(pois[0]);
  if (!result) return null;
  const distMeters = haversineMeters(
    mainCoords.latitude, mainCoords.longitude,
    result.latitude, result.longitude,
  );
  if (distMeters < CAMPUS_POLLUTION_THRESHOLD_METERS) return null;
  return result;
}
```

- [ ] **Step 2: Add the named threshold constant + import at top of file (after existing imports)**

```ts
import { haversineMeters } from '../utils/haversine';

/** Branch campuses < this distance from main are treated as polluted (AMap fell back to main). */
const CAMPUS_POLLUTION_THRESHOLD_METERS = 300;
```

- [ ] **Step 3: Remove now-unused imports (`AmapApiError`, `AmapUnavailableError`) if they're no longer referenced**

Check `apps/server/src/modules/geo/services/geocoder.service.ts` — these were used only inside the old `geocodeCampus` try/catch. Remove from the import line if unused.

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm jest src/modules/geo/services/geocoder.service.spec.ts -t geocodeCampus
```

Expected: 6/6 PASS.

- [ ] **Step 5: Run full geocoder spec to ensure no regression**

```bash
pnpm jest src/modules/geo/services/geocoder.service.spec.ts
```

Expected: all PASS (existing `geocode` and `geocodeUniversity` tests untouched).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/geo/services/geocoder.service.ts apps/server/src/modules/geo/services/geocoder.service.spec.ts
git commit -m "fix(geo): geocodeCampus uses POI search + haversine pollution guard"
```

---

## Task 3: Update `geo-backfill.ts` call site

**Files:**
- Modify: `apps/server/scripts/geo-backfill.ts:139-151`

The old call site passed `{ city: c.hint?.city ?? uni.city, province: ... }` and didn't know about main coords. New call site needs main lat/lng and must skip when main itself is null.

- [ ] **Step 1: Replace the candidate loop (lines 139-151) with the new shape**

```ts
for (const c of candidates) {
  const r =
    main && main.latitude != null && main.longitude != null
      ? await deps.geocoder.geocodeCampus(uni.name, c.name, {
          latitude: main.latitude,
          longitude: main.longitude,
        })
      : null;
  campuses.push({
    name: c.name, isMain: c.name === '本部' || c.name === '主校区',
    province: r?.province, city: r?.city, district: r?.district,
    address: r?.address, latitude: r?.latitude, longitude: r?.longitude,
    geoStatus: r ? 'verified' : 'invalid', geoSource: r?.source,
    discoveredFrom: c.source,
  });
}
```

- [ ] **Step 2: Run TypeScript build to confirm no type errors**

```bash
pnpm --filter @volunteer-helper/server build
```

Expected: clean build. If `main` typing is too narrow for `latitude/longitude` access, inspect `GeocoderService.geocodeUniversity` return type and adjust the null check accordingly.

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/geo-backfill.ts
git commit -m "fix(geo): backfill passes main coords to geocodeCampus, skips when main missing"
```

---

## Task 4: Add `--ids` flag to `geo-backfill.ts`

**Files:**
- Modify: `apps/server/scripts/geo-backfill.ts:21-61`

Spec calls for targeted re-run on a specific list of multi-campus IDs. Existing `--filter` only supports `985`/`211`/`dfc` flags.

- [ ] **Step 1: Extend `RunOptions` interface (line 21-28) and `opts` parsing (line 32-39)**

Add field:
```ts
interface RunOptions {
  resume: boolean;
  force: boolean;
  dryRun: boolean;
  skipPoi: boolean;
  filter?: string[];
  ids?: number[];      // NEW
  concurrency: number;
}
```

In the `opts` block:
```ts
ids: typeof flags.ids === 'string'
  ? flags.ids.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
  : undefined,
```

- [ ] **Step 2: Add `where.id` filter when `ids` is present (after line 56, before line 58)**

```ts
if (opts.ids && opts.ids.length > 0) {
  where.id = { in: opts.ids };
}
```

- [ ] **Step 3: Update the usage docstring at top of file (lines 4-9)**

Add one line:
```ts
*   pnpm ts-node scripts/geo-backfill.ts --force --ids 10676,10611,10618
```

- [ ] **Step 4: Smoke-test the flag with `--dry-run`**

```bash
cd apps/server
pnpm ts-node scripts/geo-backfill.ts --dry-run --ids 10676 --concurrency 1
```

Expected stdout: `[backfill] target=1 dryRun=true skipPoi=false`. No DB writes, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/geo-backfill.ts
git commit -m "feat(geo): geo-backfill supports --ids for targeted re-runs"
```

---

## Task 5: Identify multi-campus universities and run targeted backfill

**Files:** none (data operation)

- [ ] **Step 1: Query the production DB for multi-campus university IDs**

Use the API route since direct DB access is currently unreliable (memory #507). From any machine with network access:

```bash
python << 'EOF' > /tmp/multi_campus_ids.txt
import json, urllib.request, time
ids = []
page = 1
while page <= 30:
    url = f'http://132.232.245.53:3004/api/v1/universities?pageSize=100&page={page}'
    with urllib.request.urlopen(url, timeout=20) as r:
        d = json.load(r)
    ids += [u['id'] for u in d['data']]
    if len(d['data']) < 100: break
    page += 1
multi = []
for i, uid in enumerate(ids):
    try:
        with urllib.request.urlopen(f'http://132.232.245.53:3004/api/v1/universities/{uid}', timeout=15) as r:
            d = json.load(r)
        if len(d.get('campuses', [])) >= 2:
            multi.append(uid)
    except Exception:
        pass
    if (i + 1) % 50 == 0: time.sleep(2)  # avoid rate limit
print(','.join(str(m) for m in multi))
EOF
cat /tmp/multi_campus_ids.txt
```

Expected: comma-separated list of IDs (likely 10-100 IDs based on prior sampling). Save the output.

- [ ] **Step 2: Confirm the spot-check anchors are in the list**

The list MUST contain `10676, 10611, 10618, 10630`. If any are missing, investigate before proceeding (likely listing pagination or rate-limit issue).

- [ ] **Step 3: Deploy the fix to production**

Per project conventions (memory shows PM2 + multi-process restart):
```bash
git push origin master      # or gitee, per existing deployment
ssh <prod>                   # or however deploy runs
cd /path/to/VolunteerHelper
git pull
pnpm install --frozen-lockfile
pnpm --filter @volunteer-helper/server build
pm2 restart vh-server
```

Expected: server back up, `GET /api/v1/universities/10676` still returns 200.

- [ ] **Step 4: Run targeted backfill on production**

On the production host (or wherever `AMAP_SERVICE_KEY` is configured):
```bash
cd apps/server
AMAP_SERVICE_KEY=$AMAP_SERVICE_KEY pnpm ts-node scripts/geo-backfill.ts \
  --force --ids <comma-separated-list-from-step-1>
```

Expected: progress bar reaches 100%, report file written to `apps/server/logs/geo-backfill-<ts>.json`. Check `verified` count and `invalid` count.

- [ ] **Step 5: Inspect the report**

```bash
cat apps/server/logs/geo-backfill-<latest-ts>.json | python -m json.tool | head -40
```

Look at `issuesByType`. If `invalid` campus rate is unexpectedly high (>30%), pause and re-evaluate the 300m threshold before spot-checking.

---

## Task 6: Spot-check via API

**Files:** none (verification)

- [ ] **Step 1: Pull post-backfill data for the 4 anchor universities + 1 random**

```bash
python << 'EOF'
import json, urllib.request, random, time
sample = [10676, 10611, 10618, 10630]
# pick 1 random from the multi-campus list
with open('/tmp/multi_campus_ids.txt') as f:
    pool = [int(x) for x in f.read().strip().split(',')]
remaining = [i for i in pool if i not in sample]
sample.append(random.choice(remaining))
for uid in sample:
    with urllib.request.urlopen(f'http://132.232.245.53:3004/api/v1/universities/{uid}', timeout=10) as r:
        d = json.load(r)
    cs = d.get('campuses', [])
    coords = {(round(float(c['latitude']), 4), round(float(c['longitude']), 4))
              for c in cs if c.get('latitude') is not None}
    cities = {c.get('city') for c in cs}
    print(f'{uid} {d.get("name")}: {len(cs)} campuses, {len(coords)} unique coords, cities={cities}')
    for c in cs:
        print(f"   - {c.get('name')} isMain={c.get('isMain')} status={c.get('geoStatus')} "
              f"city={c.get('city')} lat={c.get('latitude')} lng={c.get('longitude')}")
    time.sleep(0.5)
EOF
```

- [ ] **Step 2: Verify each anchor passes its expectation**

| ID | Expected outcome |
|----|------------------|
| 10676 西南石油大学 | 2 campuses, 2 unique coords, 南充 校区 city="南充市" lat≈31.75 lng≈106.10 |
| 10611 重庆交通大学 | 3 campuses, 3 unique coords (each campus distinct) |
| 10618 重庆理工大学 | 2 campuses, 2 unique coords |
| 10630 重庆工业职业技术学院 | 2 campuses, 2 unique coords |
| Random | ≥2 unique coords (or all `invalid` if AMap genuinely couldn't find branches) |

If a branch comes back `invalid`, that's correct behavior — the pollution guard rejected a fake match. Manual investigation can follow later.

If a branch still has the same coords as main (`geoStatus: 'verified'` + same lat/lng), that means AMap returned a result > 300m away that's still wrong. Document the case and lower threshold to 200m as a follow-up.

- [ ] **Step 3: Browser visual check**

Open `http://132.232.245.53:3004/universities/10676` and confirm the map shows two distinct markers — one in 成都, one in 南充 (~280 km apart, the map should auto-fitBounds to show both).

Repeat for 10611, 10618, 10630.

- [ ] **Step 4: Final commit (close-out report)**

If anything was tweaked during spot-check (threshold change, etc.), commit those. Otherwise no code changes needed in this task.

```bash
# (only if changes happened)
git add <files>
git commit -m "fix(geo): tune campus pollution threshold to <N>m based on spot-check"
```

---

## Acceptance Criteria

- [ ] All `geocodeCampus` unit tests pass (6 tests).
- [ ] `pnpm --filter @volunteer-helper/server build` is clean.
- [ ] Targeted backfill completes without errors.
- [ ] `/api/v1/universities/10676` returns 2 campuses with 2 distinct coordinates.
- [ ] `/api/v1/universities/10611` returns 3 campuses with 3 distinct coordinates.
- [ ] Browser map at `/universities/10676` shows two markers in different cities.
- [ ] No single-campus university's main coords or city changed (sanity check on 1-2 random single-campus universities pre/post).

---

## Rollback Plan

If post-deployment the API starts returning `invalid` for many previously-`verified` campuses (e.g., > 50% of multi-campus universities now have all-invalid branches), revert via:

```bash
git revert <task-2-commit> <task-3-commit>
pnpm --filter @volunteer-helper/server build && pm2 restart vh-server
```

Then re-run `--force --ids <list>` to restore old (wrong but rendered) data. Address the root cause (likely threshold too strict or AMap typecode mismatch) before re-attempting.
