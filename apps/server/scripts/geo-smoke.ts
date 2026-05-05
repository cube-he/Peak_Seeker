/**
 * Real-network smoke test for the geo module.
 *
 * Hits the actual 高德 Web Service API with one university so we can
 * verify our hand-written `amap.types.ts` shapes match reality before
 * committing to Plan B (frontend) or Plan C (full backfill).
 *
 * Does NOT touch the database. Does NOT bootstrap NestJS. Only the
 * stand-alone AmapClient + GeocoderService are exercised.
 *
 * Usage (from apps/server):
 *   AMAP_SERVICE_KEY=<your-key> pnpm ts-node scripts/geo-smoke.ts \
 *     --university 清华大学 --city 北京
 *
 * Total AMap calls per run: 7 (geocode + regeocode + 3× place/around + place/text).
 * Well within any quota.
 *
 * Output:
 *   - human-readable log to stdout (each step's parsed result + counts)
 *   - structured JSON dump to apps/server/logs/geo-smoke-<timestamp>.json
 *
 * Exit codes:
 *   0  all steps OK; mock and reality agree
 *   1  unexpected exception
 *   2  geocode returned no results (bad query / bad city hint)
 *   3  GeocoderService failed to parse a successful raw geocode response
 *      (THIS is the canary you most want to see early — means amap.types
 *      or the parser drifted from reality)
 */
import { ConfigService } from '@nestjs/config';
import { AmapClient } from '../src/modules/geo/amap/amap.client';
import { GeocoderService } from '../src/modules/geo/services/geocoder.service';
import { GEO_CONFIG } from '../src/modules/geo/geo.config';
import { parseArgs, writeJsonReport } from './lib/cli-utils';

interface StepReport {
  step: string;
  ok: boolean;
  payload: unknown;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const universityName = (flags.university as string) ?? '清华大学';
  const city = (flags.city as string) ?? undefined;

  const key = process.env.AMAP_SERVICE_KEY;
  if (!key) {
    console.error('❌ Missing env: AMAP_SERVICE_KEY');
    console.error('   Run with: AMAP_SERVICE_KEY=<your-key> pnpm ts-node scripts/geo-smoke.ts ...');
    process.exit(1);
  }

  const config = {
    get: (k: string) =>
      ({ AMAP_SERVICE_KEY: key, AMAP_RATE_LIMIT_QPS: '50' } as Record<string, string>)[k],
  } as unknown as ConfigService;

  // No RedisService -> cache layer auto-skips (@Optional() in the client).
  const client = new AmapClient(config);
  const geocoder = new GeocoderService(client);

  const report: {
    timestamp: string;
    input: { universityName: string; city?: string };
    steps: StepReport[];
    summary?: unknown;
    error?: string;
  } = {
    timestamp: new Date().toISOString(),
    input: { universityName, city },
    steps: [],
  };

  const log = (step: string, ok: boolean, payload: unknown) => {
    const tag = ok ? '✅' : '❌';
    console.log(`\n${tag} ${step}`);
    console.log(JSON.stringify(payload, null, 2));
    report.steps.push({ step, ok, payload });
  };

  try {
    // 1. Raw geocode — verifies AmapGeocode shape
    const rawGeocode = await client.geocode(universityName, { city });
    log('Step 1 · AmapClient.geocode (raw response)', rawGeocode != null, rawGeocode);
    if (!rawGeocode) {
      report.error = 'geocode returned null';
      writeJsonReport('geo-smoke', report);
      process.exit(2);
    }

    // 2. Parsed GeoResult — verifies parser handles real lng/lat string + city/district arrays
    const parsed = await geocoder.geocode(universityName, { city });
    log('Step 2 · GeocoderService.geocode (parsed GeoResult)', parsed != null, parsed);
    if (!parsed) {
      report.error = 'GeocoderService returned null despite raw geocode success';
      writeJsonReport('geo-smoke', report);
      process.exit(3);
    }
    const { latitude: lat, longitude: lng } = parsed;

    // 3. Regeocode — verifies AmapRegeocodeResponse shape
    const regeo = await client.regeocode(lng, lat);
    log('Step 3 · AmapClient.regeocode (coords -> 行政区)', regeo != null, regeo);

    // 4. POI around · subway
    const subways = await client.searchPlaceAround(lng, lat, {
      types: GEO_CONFIG.POI_TYPECODE_SUBWAY,
      radius: GEO_CONFIG.POI_RADIUS_SUBWAY,
    });
    log(
      `Step 4 · 地铁 around (typecode ${GEO_CONFIG.POI_TYPECODE_SUBWAY}, r=${GEO_CONFIG.POI_RADIUS_SUBWAY}m)`,
      true,
      { count: subways.length, first: subways[0], rawSampleKeys: subways[0] ? Object.keys(subways[0]) : [] },
    );

    // 5. POI around · mall
    const malls = await client.searchPlaceAround(lng, lat, {
      types: GEO_CONFIG.POI_TYPECODE_MALL,
      radius: GEO_CONFIG.POI_RADIUS_MALL,
    });
    log(
      `Step 5 · 商圈 around (typecode ${GEO_CONFIG.POI_TYPECODE_MALL}, r=${GEO_CONFIG.POI_RADIUS_MALL}m)`,
      true,
      { count: malls.length, first: malls[0] },
    );

    // 6. POI around · airport
    const airports = await client.searchPlaceAround(lng, lat, {
      types: GEO_CONFIG.POI_TYPECODE_AIRPORT,
      radius: GEO_CONFIG.POI_RADIUS_AIRPORT,
    });
    log(
      `Step 6 · 机场 around (typecode ${GEO_CONFIG.POI_TYPECODE_AIRPORT}, r=${GEO_CONFIG.POI_RADIUS_AIRPORT}m)`,
      true,
      { count: airports.length, first: airports[0] },
    );

    // 7. PlaceSearch text — used by GeocodeAsPoiStrategy fallback
    const textHits = await client.searchPlaceText(universityName, {
      city,
      types: '141201', // 高等院校
    });
    log('Step 7 · PlaceSearch text (高等院校 type)', true, {
      count: textHits.length,
      first: textHits[0],
    });

    report.summary = {
      ok: true,
      coords: { lat, lng },
      address: parsed.address,
      formattedAddress: parsed.formattedAddress,
      district: parsed.district,
      poiCounts: {
        subway: subways.length,
        mall: malls.length,
        airport: airports.length,
        textHits: textHits.length,
      },
      driftSuspects: collectDriftSuspects(rawGeocode, regeo, subways[0]),
    };

    console.log('\n=== ✅ Smoke OK ===');
    console.log(JSON.stringify(report.summary, null, 2));
  } catch (e) {
    console.error('\n❌ Smoke threw:', (e as Error).message);
    report.error = (e as Error).message;
  }

  const file = writeJsonReport('geo-smoke', report);
  console.log(`\nFull report: ${file}`);
}

/**
 * Inspect raw AMap responses for fields/shapes our amap.types.ts didn't anticipate.
 * Returns a list of "suspect" deviations (extra unknown keys, unexpected types).
 * Empty list = mock + reality agree.
 */
function collectDriftSuspects(
  geo: unknown,
  regeo: unknown,
  poi: unknown,
): Array<{ where: string; observation: string }> {
  const suspects: Array<{ where: string; observation: string }> = [];

  const knownGeoKeys = new Set([
    'formatted_address', 'province', 'city', 'district', 'location', 'level',
    'country', 'citycode', 'adcode', 'township', 'street', 'number',
    'building', 'neighborhood',
  ]);
  if (geo && typeof geo === 'object') {
    for (const k of Object.keys(geo as Record<string, unknown>)) {
      if (!knownGeoKeys.has(k)) {
        suspects.push({ where: 'geocode', observation: `unexpected key "${k}"` });
      }
    }
  }

  const knownPoiKeys = new Set([
    'id', 'name', 'type', 'typecode', 'location', 'address', 'distance',
    'pname', 'cityname', 'adname', 'business_area', 'tag', 'biz_ext',
    'pcode', 'citycode', 'adcode', 'tel', 'shopid', 'shopinfo',
    'parent', 'photos', 'event', 'children', 'indoor_data', 'indoor_map',
    'groupbuy_num', 'discount_num', 'gridcode', 'navi_poiid', 'entr_location',
    'exit_location', 'match', 'recommend', 'timestamp', 'alias', 'importance',
    'biz_type', 'cost',
  ]);
  if (poi && typeof poi === 'object') {
    for (const k of Object.keys(poi as Record<string, unknown>)) {
      if (!knownPoiKeys.has(k)) {
        suspects.push({ where: 'poi', observation: `unexpected key "${k}"` });
      }
    }
  }

  if (regeo && typeof regeo === 'object') {
    const rr = regeo as { addressComponent?: unknown };
    if (rr.addressComponent && typeof rr.addressComponent === 'object') {
      const ac = rr.addressComponent as Record<string, unknown>;
      const knownAcKeys = new Set([
        'province', 'city', 'district', 'country', 'citycode', 'adcode',
        'township', 'streetNumber', 'neighborhood', 'building', 'businessAreas',
      ]);
      for (const k of Object.keys(ac)) {
        if (!knownAcKeys.has(k)) {
          suspects.push({ where: 'regeocode.addressComponent', observation: `unexpected key "${k}"` });
        }
      }
    }
  }

  return suspects;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
