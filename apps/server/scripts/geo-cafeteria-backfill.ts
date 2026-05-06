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
    ...(limit !== undefined ? { take: limit } : {}),
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
