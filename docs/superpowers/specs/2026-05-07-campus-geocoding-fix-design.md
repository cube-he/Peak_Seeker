# Campus Geocoding Fix — Design

**Date**: 2026-05-07
**Status**: Approved
**Scope**: Bug fix — `geocodeCampus` returns main campus coordinates for all branch campuses

---

## Problem

Branch campuses on the university map are invisible. Investigation of production data
confirms the cause: every multi-campus university has all `universityCampus` rows pointing
to the same coordinates as the main campus.

Sample (live `/api/v1/universities/<id>` results):

| University | Campuses | Unique Coords | Symptom |
|---|---|---|---|
| 10676 西南石油大学 | 成都, 南充 | 1 | both at (30.8194, 104.1830), city="成都市" |
| 10611 重庆交通大学 | 第一/二/三 | 1 | all at main coords |
| 10618 重庆理工大学 | 花溪, 武警 | 1 | all at main coords |
| 10630 重庆工业职业技术学院 | 花溪, 第一附中 | 1 | all at main coords |

A 20-university sample shows the pattern is universal — every multi-campus university is
affected.

## Root Cause

Three code locations conspire to produce the bug:

1. **`apps/server/src/modules/geo/services/campus-extractor.service.ts:40-43, 99`**
   `CampusCandidate` is emitted as `{ name, source }` — no `hint.city`.

2. **`apps/server/scripts/geo-backfill.ts:141`**
   ```ts
   city: c.hint?.city ?? uni.city ?? undefined
   ```
   Because hint.city is always undefined, it falls back to `uni.city` (the **main**
   campus city).

3. **`apps/server/src/modules/geo/services/geocoder.service.ts:42-45`**
   ```ts
   const query = `${universityName}(${campusName})`;
   const direct = await this.amap.geocode(query, { city: hint.city });
   if (direct) return this.fromGeocode(query, direct);
   ```
   AMap's `/geocode/geo` is an **address geocoder, not a fuzzy search**. It cannot parse
   `"西南石油大学(南充)"` semantically. With `city="成都市"` constraint, it falls back to
   matching just `"西南石油大学"` and returns the main campus location with the constrained
   city. The PlaceSearch fallback at L51-54 never executes because `direct` is non-null.

The result is written with `geoStatus: 'verified'`, polluting the database silently.

## Solution

### Decisions

- **A1**: Replace `geocodeCampus` first step with `searchPlaceText` (POI search,
  typecode `141201` = 高等院校), mirroring `geocodeUniversity`'s implementation
  (`geocoder.service.ts:67-71`).
- **B3**: Do not introduce `hint.city`. The query carries the full university name + campus
  token, and the typecode filter restricts results to higher-education POIs. Collision risk
  is negligible.
- **C1**: Add a haversine distance check between the resolved campus coords and the main
  campus coords. If the distance is **< 300 m**, treat the result as polluted and return
  `null` (so backfill records `geoStatus: 'invalid'` instead of writing fake coords).
- **D3**: After deploying the fix, re-run backfill only for currently multi-campus
  universities. Spot-check 5 universities (10676, 10611, 10618, 10630, plus one random).
  Decide whether a full re-backfill is needed based on spot-check outcome.

### Files Touched

#### 1. `apps/server/src/modules/geo/services/geocoder.service.ts`

Rewrite `geocodeCampus`:

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
    { lat: mainCoords.latitude, lng: mainCoords.longitude },
    { lat: result.latitude, lng: result.longitude },
  );
  if (distMeters < 300) return null;   // pollution guard
  return result;
}
```

Signature change: removes `hint`, adds required `mainCoords`. Imports
`haversineMeters` from `../utils/haversine`.

#### 2. `apps/server/scripts/geo-backfill.ts`

L139-150 update — pass `main` coords (already in scope from L113):

```ts
for (const c of candidates) {
  const r = main && main.latitude != null && main.longitude != null
    ? await deps.geocoder.geocodeCampus(uni.name, c.name, {
        latitude: main.latitude,
        longitude: main.longitude,
      })
    : null;
  campuses.push({
    name: c.name,
    isMain: c.name === '本部' || c.name === '主校区',
    province: r?.province, city: r?.city, district: r?.district,
    address: r?.address, latitude: r?.latitude, longitude: r?.longitude,
    geoStatus: r ? 'verified' : 'invalid',
    geoSource: r?.source,
    discoveredFrom: c.source,
  });
}
```

Edge case: if `main` itself failed to geocode, we cannot do the pollution check.
In that case, skip `geocodeCampus` entirely and mark the campus invalid (no
trustworthy reference point).

Also extend CLI flag parsing to support `--ids 10676,10611,...` for the targeted
re-backfill (see step 3 below). Existing `--filter 985,211,dfc` remains
untouched.

#### 3. `apps/server/src/modules/geo/services/campus-extractor.service.ts`

**No change** (B3 decision).

#### 4. `apps/server/src/modules/geo/dto/campus-candidate.dto.ts`

**No change** (B3 decision).

### Tests (TDD)

New / updated specs in `apps/server/src/modules/geo/services/geocoder.service.spec.ts`:

- **RED 1**: `geocodeCampus("西南石油大学", "南充", {latitude:30.82, longitude:104.18})`
  with mocked `searchPlaceText` returning a POI at `(30.82, 104.18)` (= main coords)
  → expect `null` (pollution guard triggers)
- **RED 2**: same call, mocked POI at `(31.75, 106.10)` (~280 km away)
  → expect non-null `GeoResult` with those coords
- **RED 3**: same call, mocked `searchPlaceText` returning `[]`
  → expect `null`
- **RED 4**: same call, mocked POI exactly 250m away → expect `null` (just inside threshold)
- **RED 5**: same call, mocked POI exactly 350m away → expect non-null (just outside threshold)

Update any existing `geocodeCampus` specs to match the new signature (removing
`hint.city`, adding `mainCoords`).

If `geo-backfill.ts` has integration specs touching `geocodeCampus`, update mocks.

### Data Re-Backfill

1. Identify multi-campus universities:
   ```sql
   SELECT university_id, COUNT(*) AS n
   FROM university_campuses
   GROUP BY university_id
   HAVING COUNT(*) >= 2;
   ```
2. Run targeted backfill (after `--ids` flag is added to the script):
   ```bash
   pnpm ts-node scripts/geo-backfill.ts --force --ids <comma-separated-ids>
   ```
3. Spot-check via API:
   - 10676 西南石油大学 — expect 南充 校区 ≈ (31.75, 106.10)
   - 10611 重庆交通大学 — expect 3 distinct coords
   - 10618 重庆理工大学 — expect 2 distinct coords
   - 10630 重庆工业职业技术学院 — expect 2 distinct coords
   - 1 random multi-campus university — distinct coords
4. If any spot-check fails (e.g., still polluted, or pollution guard rejected a legitimate
   nearby campus), pause and re-evaluate threshold or query construction.
5. If all spot-checks pass → done. Single-campus universities (the vast majority) are not
   affected by this bug and do not need re-backfilling.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| 300 m threshold too strict (twin campuses in same university town) | Spot-check after re-backfill. If false-positives appear, lower to 200 m. Threshold defined as a single named constant for easy tuning. |
| AMap rate-limiting during re-backfill | `RetryChain` + existing rate-limiter handle this. Multi-campus subset is small (likely < 100 universities), low risk. |
| `searchPlaceText` returns wrong POI (e.g., a building named the same) | typecode `141201` filter restricts to higher-education POIs. Combined with full university name in query, collision probability is negligible. If observed, add post-filter: result POI name must contain university name. |
| Main campus geocoding failed → cannot do pollution check | Skip `geocodeCampus`, mark all candidates invalid. Better than writing untrusted data. |

## Out of Scope

- Frontend changes (CampusMap.tsx). Once data is correct, markers separate naturally.
- Adding `hint.city` infrastructure to `CampusCandidate` (B3 was chosen).
- Full re-backfill of single-campus universities (only multi-campus are affected).
- Improving `CampusExtractor` extraction quality (separate concern).
