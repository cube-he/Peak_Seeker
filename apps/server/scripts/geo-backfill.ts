/**
 * Backfill university and campus geo data using the GeoModule pipeline.
 *
 * Usage:
 *   pnpm ts-node scripts/geo-backfill.ts --resume
 *   pnpm ts-node scripts/geo-backfill.ts --force --filter 985,211
 *   pnpm ts-node scripts/geo-backfill.ts --dry-run --concurrency 1
 *   pnpm ts-node scripts/geo-backfill.ts --skip-poi
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GeocoderService } from '../src/modules/geo/services/geocoder.service';
import { CampusExtractor } from '../src/modules/geo/services/campus-extractor.service';
import { GeoValidator } from '../src/modules/geo/services/validator.service';
import { RetryChain } from '../src/modules/geo/services/retry-chain.service';
import { AmapClient } from '../src/modules/geo/amap/amap.client';
import { GEO_CONFIG } from '../src/modules/geo/geo.config';
import { makeBar, writeJsonReport, parseArgs } from './lib/cli-utils';

interface RunOptions {
  resume: boolean;
  force: boolean;
  dryRun: boolean;
  skipPoi: boolean;
  filter?: string[];
  concurrency: number;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const opts: RunOptions = {
    resume: flags.resume === true || (!flags.force),
    force: flags.force === true,
    dryRun: flags['dry-run'] === true,
    skipPoi: flags['skip-poi'] === true,
    filter: typeof flags.filter === 'string' ? flags.filter.split(',') : undefined,
    concurrency: Number(flags.concurrency ?? 1),
  };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const geocoder = app.get(GeocoderService);
  const extractor = app.get(CampusExtractor);
  const validator = app.get(GeoValidator);
  const retryChain = app.get(RetryChain);
  const amap = app.get(AmapClient);

  const where: any = {};
  if (opts.resume && !opts.force) where.geoStatus = 'pending';
  if (opts.filter) {
    where.OR = [];
    if (opts.filter.includes('985')) where.OR.push({ is985: true });
    if (opts.filter.includes('211')) where.OR.push({ is211: true });
    if (opts.filter.includes('dfc')) where.OR.push({ isDoubleFirstClass: true });
    if (where.OR.length === 0) delete where.OR;
  }
  const list = await prisma.university.findMany({
    where, select: { id: true },
    orderBy: { id: 'asc' },
  });

  console.log(`[backfill] target=${list.length} dryRun=${opts.dryRun} skipPoi=${opts.skipPoi}`);
  const bar = makeBar(list.length, 'backfill');
  let ok = 0, inv = 0, err = 0;
  const issueCounts: Record<string, number> = {};

  for (const { id } of list) {
    try {
      const result = await processOne(id, {
        prisma, geocoder, extractor, validator, retryChain, amap,
      }, opts);
      if (result.status === 'verified') ok += 1;
      else if (result.status === 'invalid') inv += 1;
      for (const t of result.issueTypes) issueCounts[t] = (issueCounts[t] ?? 0) + 1;
    } catch (e) {
      err += 1;
      console.error(`[backfill] error for university ${id}: ${(e as Error).message}`);
    }
    bar.increment(1, { ok, inv, err });
  }
  bar.stop();

  const report = {
    timestamp: new Date().toISOString(),
    total: list.length, verified: ok, invalid: inv, errors: err,
    issuesByType: issueCounts,
    options: opts,
  };
  const file = writeJsonReport('geo-backfill', report);
  console.log(`[backfill] done. report: ${file}`);

  await app.close();
}

interface Deps {
  prisma: PrismaService;
  geocoder: GeocoderService;
  extractor: CampusExtractor;
  validator: GeoValidator;
  retryChain: RetryChain;
  amap: AmapClient;
}

async function processOne(
  id: number,
  deps: Deps,
  opts: RunOptions,
): Promise<{ status: 'verified' | 'invalid'; issueTypes: string[] }> {
  const uni = await deps.prisma.university.findUnique({ where: { id } });
  if (!uni) return { status: 'invalid', issueTypes: [] };

  const main = await deps.geocoder.geocode(
    uni.address ?? `${uni.province ?? ''}${uni.city ?? ''}${uni.name}`,
    { city: uni.city ?? undefined },
  );

  const candidates = await deps.extractor.extract(id);

  type CampusRow = {
    name: string; isMain: boolean;
    province?: string; city?: string; district?: string | null;
    address?: string; latitude?: number; longitude?: number;
    geoStatus: 'verified' | 'invalid' | 'pending';
    geoSource?: string;
    discoveredFrom: string;
  };
  const campuses: CampusRow[] = [];

  if (candidates.length === 0 && main) {
    campuses.push({
      name: '本部', isMain: true,
      province: main.province, city: main.city, district: main.district,
      address: main.address, latitude: main.latitude, longitude: main.longitude,
      geoStatus: 'verified', geoSource: main.source,
      discoveredFrom: 'amap_search',
    });
  }
  for (const c of candidates) {
    const r = await deps.geocoder.geocodeCampus(uni.name, c.name, {
      city: c.hint?.city ?? uni.city ?? undefined,
      province: c.hint?.province ?? uni.province ?? undefined,
    });
    campuses.push({
      name: c.name, isMain: c.name === '本部' || c.name === '主校区',
      province: r?.province, city: r?.city, district: r?.district,
      address: r?.address, latitude: r?.latitude, longitude: r?.longitude,
      geoStatus: r ? 'verified' : 'invalid', geoSource: r?.source,
      discoveredFrom: c.source,
    });
  }
  if (!campuses.some((c) => c.isMain)) {
    const first = campuses.find((c) => c.geoStatus === 'verified');
    if (first) first.isMain = true;
  }

  type PoiRow = {
    campusName: string; amapId: string; name: string;
    category: 'subway' | 'mall' | 'airport';
    typecode: string; latitude: number; longitude: number;
    address?: string; distance: number; metadata?: Record<string, unknown>;
  };
  const pois: PoiRow[] = [];
  if (!opts.skipPoi) {
    for (const c of campuses) {
      if (c.geoStatus !== 'verified' || c.latitude == null || c.longitude == null) continue;
      const fetched = await fetchPoiForCampus(deps.amap, c.latitude, c.longitude);
      for (const p of fetched) pois.push({ campusName: c.name, ...p });
    }
  }

  const report = await deps.validator.validate({
    id: uni.id, name: uni.name,
    province: uni.province ?? undefined, city: uni.city ?? undefined,
    address: main?.address ?? uni.address ?? undefined,
    latitude: main?.latitude, longitude: main?.longitude,
    campuses: campuses.map((c, i) => ({
      id: i, name: c.name, isMain: c.isMain,
      province: c.province, city: c.city,
      latitude: c.latitude, longitude: c.longitude,
    })),
  });

  const status: 'verified' | 'invalid' = report.pass ? 'verified' : 'invalid';
  if (!opts.dryRun) {
    await deps.prisma.$transaction(async (tx) => {
      await tx.university.update({
        where: { id }, data: {
          address: main?.address ?? uni.address,
          latitude: main?.latitude as any, longitude: main?.longitude as any,
          geoStatus: status,
          geoSource: main?.source ?? null,
          geoUpdatedAt: new Date(),
        },
      });
      await tx.universityCampus.deleteMany({ where: { universityId: id } });
      for (const c of campuses) {
        await tx.universityCampus.create({
          data: {
            universityId: id, name: c.name, isMain: c.isMain,
            province: c.province, city: c.city, district: c.district,
            address: c.address,
            latitude: c.latitude as any, longitude: c.longitude as any,
            geoStatus: c.geoStatus, geoSource: c.geoSource,
            geoUpdatedAt: new Date(),
            discoveredFrom: c.discoveredFrom,
          },
        });
      }
      const persistedCampuses = await tx.universityCampus.findMany({
        where: { universityId: id }, select: { id: true, name: true },
      });
      const idByName = new Map(persistedCampuses.map((c) => [c.name, c.id]));
      for (const p of pois) {
        const campusId = idByName.get(p.campusName);
        if (!campusId) continue;
        await tx.universityCampusPoi.upsert({
          where: { campusId_amapId: { campusId, amapId: p.amapId } },
          update: {
            distance: p.distance, fetchedAt: new Date(),
            obsolete: false, metadata: p.metadata as any,
          },
          create: {
            campusId, amapId: p.amapId, name: p.name, category: p.category,
            typecode: p.typecode, latitude: p.latitude as any, longitude: p.longitude as any,
            address: p.address, distance: p.distance, metadata: p.metadata as any,
            fetchedAt: new Date(), source: 'amap_around',
          },
        });
      }
      for (const c of persistedCampuses) {
        const subway = pois
          .filter((p) => p.campusName === c.name && p.category === 'subway')
          .map((p) => p.distance).sort((a, b) => a - b)[0];
        const airport = pois
          .filter((p) => p.campusName === c.name && p.category === 'airport')
          .map((p) => p.distance).sort((a, b) => a - b)[0];
        await tx.universityCampus.update({
          where: { id: c.id }, data: {
            nearestSubwayMeters: subway ?? null,
            nearestAirportKm: airport != null ? (airport / 1000) as any : null,
          },
        });
      }
      for (const issue of report.issues) {
        await tx.universityGeoIssue.create({
          data: {
            universityId: id, campusId: issue.campusId ?? null,
            issueType: issue.issueType,
            detail: (issue.detail ?? null) as any,
            status: 'pending',
          },
        });
      }
    }, { timeout: 30_000 });
  }

  return { status, issueTypes: report.issues.map((i) => i.issueType) };
}

async function fetchPoiForCampus(amap: AmapClient, lat: number, lng: number) {
  const out: Array<{
    amapId: string; name: string;
    category: 'subway' | 'mall' | 'airport';
    typecode: string; latitude: number; longitude: number;
    address?: string; distance: number; metadata?: Record<string, unknown>;
  }> = [];
  const fetchSet = async (
    typecode: string,
    radius: number,
    cat: 'subway' | 'mall' | 'airport',
  ) => {
    const pois = await amap.searchPlaceAround(lng, lat, { types: typecode, radius });
    for (const p of pois.slice(0, GEO_CONFIG.POI_TOP_N)) {
      const [plng, plat] = p.location.split(',').map(Number);
      // AMap returns `[]` for missing string fields; coerce defensively.
      const distRaw = typeof p.distance === 'string' ? p.distance : '0';
      const dist = Number(distRaw);
      const address =
        typeof p.address === 'string' ? p.address
          : Array.isArray(p.address) ? p.address.filter((x): x is string => typeof x === 'string').join('') || undefined
          : undefined;
      const businessArea = typeof p.business_area === 'string' ? p.business_area : '';
      out.push({
        amapId: p.id, name: p.name, category: cat, typecode: p.typecode,
        latitude: plat, longitude: plng,
        address,
        distance: dist,
        metadata: businessArea ? { businessArea } : undefined,
      });
    }
  };
  await fetchSet(GEO_CONFIG.POI_TYPECODE_SUBWAY, GEO_CONFIG.POI_RADIUS_SUBWAY, 'subway');
  await fetchSet(GEO_CONFIG.POI_TYPECODE_MALL, GEO_CONFIG.POI_RADIUS_MALL, 'mall');
  await fetchSet(GEO_CONFIG.POI_TYPECODE_AIRPORT, GEO_CONFIG.POI_RADIUS_AIRPORT, 'airport');
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
