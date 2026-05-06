# Empty-address Geocode Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `geocodeUniversity()` to `GeocoderService` so the 32 universities with empty `address` fields can resolve via `/place/text` POI search instead of failing on `/geocode/geo`.

**Architecture:** New method on `GeocoderService` mirrors the existing `geocodeCampus()` POI-fallback pattern: when `address` is empty, skip `/geocode/geo` and search `/place/text` directly with `types=141201` (高等院校). One call site in `geo-backfill.ts` is switched to the new method. No retry-chain or strategy-table changes.

**Tech Stack:** TypeScript, NestJS, Jest. No new dependencies.

**Spec reference:** [`docs/superpowers/specs/2026-05-06-empty-address-geocode-fallback-design.md`](../specs/2026-05-06-empty-address-geocode-fallback-design.md)

---

### Task 1: Add unit tests for `geocodeUniversity()` (RED)

**Files:**
- Modify: `apps/server/src/modules/geo/services/geocoder.service.spec.ts`

- [ ] **Step 1: Append a new `describe` block at the end of the file**

Add after the existing `GeocoderService.geocodeCampus` describe block (around line 103):

```ts
describe('GeocoderService.geocodeUniversity', () => {
  it('uses /geocode/geo when address is provided and AMap returns a result', async () => {
    const geocode = jest.fn().mockResolvedValue({
      formatted_address: '四川省成都市金牛区西南交通大学',
      province: '四川省', city: '成都市', district: '金牛区',
      location: '104.053,30.698', level: '兴趣点',
    });
    const searchPlaceText = jest.fn();
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('西南交通大学', {
      city: '成都', address: '四川省成都市金牛区二环路北一段111号',
    });

    expect(geocode).toHaveBeenCalledWith(
      '四川省成都市金牛区二环路北一段111号',
      { city: '成都' },
    );
    expect(searchPlaceText).not.toHaveBeenCalled();
    expect(result?.source).toBe('amap_geocode');
    expect(result?.longitude).toBe(104.053);
  });

  it('falls back to /place/text when address is provided but geocode returns null', async () => {
    const amap = fakeAmap({
      geocode: jest.fn().mockResolvedValue(null),
      searchPlaceText: jest.fn().mockResolvedValue([{
        id: 'X', name: '西南交通大学九里校区',
        type: '科教文化服务;学校;高等院校', typecode: '141201',
        location: '104.053,30.698',
        address: '二环路北一段111号',
        pname: '四川省', cityname: '成都市', adname: '金牛区',
      }]),
    });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('西南交通大学', {
      city: '成都', address: 'garbage-address',
    });

    expect(amap.searchPlaceText).toHaveBeenCalledWith(
      '西南交通大学',
      { city: '成都', types: '141201' },
    );
    expect(result?.source).toBe('amap_poi');
    expect(result?.city).toBe('成都市');
  });

  it('skips geocode and goes straight to /place/text when address is undefined', async () => {
    const geocode = jest.fn();
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '西南交通大学',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.053,30.698',
      address: [], pname: '四川省', cityname: '成都市', adname: '金牛区',
    }]);
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('西南交通大学', { city: '成都' });

    expect(geocode).not.toHaveBeenCalled();
    expect(searchPlaceText).toHaveBeenCalledWith(
      '西南交通大学',
      { city: '成都', types: '141201' },
    );
    expect(result?.source).toBe('amap_poi');
  });

  it('skips geocode when address is whitespace only', async () => {
    const geocode = jest.fn();
    const searchPlaceText = jest.fn().mockResolvedValue([]);
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    await svc.geocodeUniversity('某大学', { city: '北京', address: '   ' });

    expect(geocode).not.toHaveBeenCalled();
    expect(searchPlaceText).toHaveBeenCalled();
  });

  it('returns null when both paths yield no result', async () => {
    const amap = fakeAmap({
      geocode: jest.fn().mockResolvedValue(null),
      searchPlaceText: jest.fn().mockResolvedValue([]),
    });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('某大学', { city: '北京' });

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd apps/server && pnpm jest src/modules/geo/services/geocoder.service.spec.ts -t "geocodeUniversity" -v
```

Expected: 5 FAILs, each saying `svc.geocodeUniversity is not a function` (or TypeScript build error referencing missing property).

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/server/src/modules/geo/services/geocoder.service.spec.ts
git commit -m "test(geo): RED for geocodeUniversity address-empty fallback"
```

---

### Task 2: Implement `geocodeUniversity()` (GREEN)

**Files:**
- Modify: `apps/server/src/modules/geo/services/geocoder.service.ts`

- [ ] **Step 1: Add the new method right after `geocodeCampus()`**

Insert this method between lines 49 and 50 (after the closing brace of `geocodeCampus`, before the `private fromGeocode` definition):

```ts
  async geocodeUniversity(
    name: string,
    opts: { city?: string; address?: string } = {},
  ): Promise<GeoResult | null> {
    // 1. If we have a non-empty address, try /geocode/geo first
    if (opts.address && opts.address.trim()) {
      const direct = await this.amap.geocode(opts.address, { city: opts.city });
      if (direct) return this.fromGeocode(opts.address, direct);
    }
    // 2. Fall back to POI text search filtered by 高等院校 typecode
    const pois = await this.amap.searchPlaceText(name, {
      city: opts.city,
      types: '141201',
    });
    return pois.length > 0 ? this.fromPoi(pois[0]) : null;
  }
```

- [ ] **Step 2: Run the new tests to verify they pass**

```bash
cd apps/server && pnpm jest src/modules/geo/services/geocoder.service.spec.ts -t "geocodeUniversity" -v
```

Expected: 5 PASSes.

- [ ] **Step 3: Run the full geocoder spec to confirm no regressions**

```bash
cd apps/server && pnpm jest src/modules/geo/services/geocoder.service.spec.ts -v
```

Expected: All tests pass (existing `geocode` and `geocodeCampus` describes still green).

- [ ] **Step 4: Commit (GREEN)**

```bash
git add apps/server/src/modules/geo/services/geocoder.service.ts
git commit -m "feat(geo): add geocodeUniversity with /place/text fallback for empty addresses"
```

---

### Task 3: Switch `geo-backfill.ts` to call `geocodeUniversity()`

**Files:**
- Modify: `apps/server/scripts/geo-backfill.ts:113-116`

- [ ] **Step 1: Replace the main-uni geocode call**

Replace this block (lines 113-116):

```ts
  const main = await deps.geocoder.geocode(
    uni.address ?? `${uni.province ?? ''}${uni.city ?? ''}${uni.name}`,
    { city: uni.city ?? undefined },
  );
```

With:

```ts
  const main = await deps.geocoder.geocodeUniversity(uni.name, {
    city: uni.city ?? undefined,
    address: uni.address ?? undefined,
  });
```

- [ ] **Step 2: Type-check the script**

```bash
cd apps/server && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run the full server test suite**

```bash
cd apps/server && pnpm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/geo-backfill.ts
git commit -m "feat(scripts): geo-backfill uses geocodeUniversity for main campus"
```

---

### Task 4: Deploy to production

**Files:** none (deploy script reads from working tree)

- [ ] **Step 1: Sync the 2 changed source files to prod**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
scp -i cube.pem apps/server/src/modules/geo/services/geocoder.service.ts \
  ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/src/modules/geo/services/geocoder.service.ts
scp -i cube.pem apps/server/scripts/geo-backfill.ts \
  ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/scripts/geo-backfill.ts
```

Expected: 2 files copied, no errors.

- [ ] **Step 2: Verify the prod files contain the new method**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 \
  "grep -n 'geocodeUniversity' /home/ubuntu/apps/volunteer-helper/apps/server/src/modules/geo/services/geocoder.service.ts /home/ubuntu/apps/volunteer-helper/apps/server/scripts/geo-backfill.ts"
```

Expected: 2+ matches across both files (method declaration + call site).

> Note: `vh-server` (PM2) doesn't need a restart for this change — it doesn't call `geocodeUniversity()`. The backfill script is run standalone via `ts-node`.

---

### Task 5: Run backfill on prod and verify the 32 pending get resolved

**Files:** none

- [ ] **Step 1: Kick off the resume run**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 \
  "cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && \
   nohup ts-node \
     --require /home/ubuntu/apps/volunteer-helper/node_modules/.pnpm/tsconfig-paths@4.2.0/node_modules/tsconfig-paths/register \
     --transpile-only scripts/geo-backfill.ts --resume --skip-poi \
     > logs/backfill-resume-after-fix-2026-05-06.log 2>&1 < /dev/null & \
   echo PID=\$! && disown"
```

Expected: prints `PID=<number>`.

- [ ] **Step 2: Wait ~3 minutes, then read the report**

```bash
sleep 180 && ssh -i cube.pem ubuntu@132.232.245.53 \
  "ls -t /home/ubuntu/apps/volunteer-helper/apps/server/logs/geo-backfill-2026-05-06T*.json | head -1 | xargs cat"
```

Expected JSON shape: `{"total":32,"verified":>=28,"invalid":<=4,"errors":<=2,...}`. (≥28 of 32 should resolve. Some may legitimately end up `invalid` if validator rejects, e.g. coordinate out of declared province.)

- [ ] **Step 3: Confirm DB pending count dropped**

Save and run an inline Node script on prod:

```bash
ssh -i cube.pem ubuntu@132.232.245.53 "cat > /home/ubuntu/apps/volunteer-helper/apps/server/_check.js <<'EOF'
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
(async()=>{
  console.log(JSON.stringify({
    pending: await p.university.count({where:{geoStatus:'pending'}}),
    verified: await p.university.count({where:{geoStatus:'verified'}}),
    invalid: await p.university.count({where:{geoStatus:'invalid'}}),
  }));
  await p.\$disconnect();
})();
EOF
cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && node _check.js && rm _check.js"
```

Expected: `pending: 0` (or close to 0), `verified: ~2200`.

- [ ] **Step 4: Spot-check 5 freshly-resolved universities**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 "cat > /home/ubuntu/apps/volunteer-helper/apps/server/_spot.js <<'EOF'
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
(async()=>{
  const ids=[9004,9023,9061,10423,11042]; // 西南交通,中央戏剧,中科院大学,香港中文(深圳),西北师范
  for (const id of ids) {
    const u=await p.university.findUnique({where:{id},select:{name:true,latitude:true,longitude:true,geoStatus:true,geoSource:true}});
    console.log(id,'|',u?.name,'|',Number(u?.latitude),Number(u?.longitude),'|',u?.geoStatus,u?.geoSource);
  }
  await p.\$disconnect();
})();
EOF
cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && node _spot.js && rm _spot.js"
```

Expected: All 5 rows show non-null `latitude`/`longitude`, `geoStatus='verified'`, `geoSource='amap_poi'` (most likely; some may be `'amap_geocode'` if address was actually populated for them).

Open https://lbs.amap.com/tools/picker in a browser and paste each lng,lat to confirm the pin lands on/near the actual campus. Spec success criterion = ≥4/5 visually correct.

---

### Task 6: Final cleanup

**Files:** none (commit + push)

- [ ] **Step 1: Push the master branch**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && git push origin master
```

Expected: 3 new commits pushed (RED test, GREEN impl, geo-backfill switch).

- [ ] **Step 2: Mark spec as implemented**

Edit the spec frontmatter in `docs/superpowers/specs/2026-05-06-empty-address-geocode-fallback-design.md` line 4:

```markdown
**状态**：implemented 2026-05-06 (commit: <last-sha>)
```

Replace `<last-sha>` with the short SHA of the Task 3 commit (`git rev-parse --short HEAD`).

- [ ] **Step 3: Commit the spec status update**

```bash
git add docs/superpowers/specs/2026-05-06-empty-address-geocode-fallback-design.md
git commit -m "docs(geo): mark empty-address fallback spec as implemented"
git push origin master
```

---

## Self-review notes

**Spec coverage:**
- Spec §"修改清单 1" → Task 2
- Spec §"修改清单 2" → Task 3
- Spec §"测试 → 单元测试" 5 cases → Task 1 has 5 matching `it()` blocks
- Spec §"测试 → 生产验证" → Tasks 4 + 5
- Spec §"成功标准" → Task 5 Step 2/3 (verified count + JSON report)
- Spec §"失败回滚" → not a step, but `git revert` is one-liner if needed

**Placeholder scan:** none. Every code block is complete; every command has expected output.

**Type consistency:**
- `geocodeUniversity(name: string, opts: { city?: string; address?: string })` — declared in Task 2, called the same way in Task 3.
- Return type `Promise<GeoResult | null>` — matches existing methods.
- AMap API call shape `searchPlaceText(name, { city, types: '141201' })` — matches existing usage in `geocodeCampus` (line 45-47 of `geocoder.service.ts`).
