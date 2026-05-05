/**
 * Re-fetches POI for campuses whose POI data is older than --max-age days
 * (default 30). New POIs are inserted; missing POIs are marked obsolete=true.
 *
 * Usage: pnpm ts-node scripts/geo-refresh-poi.ts --max-age 30
 */
import { NestFactory } from '@nestjs/core';
import { GeoCliModule } from './geo-cli.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmapClient } from '../src/modules/geo/amap/amap.client';
import { GEO_CONFIG } from '../src/modules/geo/geo.config';
import { makeBar, writeJsonReport, parseArgs } from './lib/cli-utils';

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const maxAge = Number(flags['max-age'] ?? 30);
  const cutoff = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);

  const app = await NestFactory.createApplicationContext(GeoCliModule, { logger: false });
  const prisma = app.get(PrismaService);
  const amap = app.get(AmapClient);

  const campuses = await prisma.universityCampus.findMany({
    where: {
      geoStatus: 'verified', latitude: { not: null }, longitude: { not: null },
      OR: [
        { pois: { none: {} } },
        { pois: { some: { fetchedAt: { lt: cutoff } } } },
      ],
    },
    select: { id: true, latitude: true, longitude: true, name: true },
    orderBy: { id: 'asc' },
  });

  const bar = makeBar(campuses.length, 'refresh-poi');
  let ok = 0, err = 0, marked = 0;
  for (const c of campuses) {
    try {
      const lat = Number(c.latitude); const lng = Number(c.longitude);
      const newPois: Array<{
        amapId: string; name: string; category: 'subway'|'mall'|'airport';
        typecode: string; latitude: number; longitude: number;
        address?: string; distance: number;
      }> = [];
      const grab = async (typecode: string, radius: number, cat: 'subway'|'mall'|'airport') => {
        const items = await amap.searchPlaceAround(lng, lat, { types: typecode, radius });
        for (const p of items.slice(0, GEO_CONFIG.POI_TOP_N)) {
          const [plng, plat] = p.location.split(',').map(Number);
          newPois.push({
            amapId: p.id, name: p.name, category: cat, typecode: p.typecode,
            latitude: plat, longitude: plng,
            address: typeof p.address === 'string' ? p.address : undefined,
            distance: Number(p.distance ?? 0),
          });
        }
      };
      await grab(GEO_CONFIG.POI_TYPECODE_SUBWAY, GEO_CONFIG.POI_RADIUS_SUBWAY, 'subway');
      await grab(GEO_CONFIG.POI_TYPECODE_MALL, GEO_CONFIG.POI_RADIUS_MALL, 'mall');
      await grab(GEO_CONFIG.POI_TYPECODE_AIRPORT, GEO_CONFIG.POI_RADIUS_AIRPORT, 'airport');

      const newIds = new Set(newPois.map((p) => p.amapId));
      const stale = await prisma.universityCampusPoi.findMany({
        where: { campusId: c.id, obsolete: false },
        select: { id: true, amapId: true },
      });
      for (const s of stale) {
        if (!newIds.has(s.amapId)) {
          await prisma.universityCampusPoi.update({ where: { id: s.id }, data: { obsolete: true } });
          marked += 1;
        }
      }
      for (const p of newPois) {
        await prisma.universityCampusPoi.upsert({
          where: { campusId_amapId: { campusId: c.id, amapId: p.amapId } },
          update: { distance: p.distance, fetchedAt: new Date(), obsolete: false },
          create: {
            campusId: c.id, amapId: p.amapId, name: p.name, category: p.category,
            typecode: p.typecode, latitude: p.latitude as any, longitude: p.longitude as any,
            address: p.address, distance: p.distance, fetchedAt: new Date(),
          },
        });
      }
      ok += 1;
    } catch (e) {
      err += 1;
      console.error(`[refresh-poi] error for campus ${c.id}: ${(e as Error).message}`);
    }
    bar.increment(1, { ok, inv: marked, err });
  }
  bar.stop();
  const file = writeJsonReport('geo-refresh-poi', {
    timestamp: new Date().toISOString(),
    campusesScanned: campuses.length, refreshed: ok, errors: err, markedObsolete: marked,
    cutoff,
  });
  console.log(`[refresh-poi] done. report: ${file}`);
  await app.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
