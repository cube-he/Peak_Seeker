/**
 * Re-runs GeoValidator against existing DB rows. Does not call AMap (except
 * for the regeocode-based province check, which is necessary).
 *
 * Usage:
 *   pnpm ts-node scripts/geo-validate.ts [--filter 985,211]
 */
import { NestFactory } from '@nestjs/core';
import { GeoCliModule } from './geo-cli.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GeoValidator } from '../src/modules/geo/services/validator.service';
import { makeBar, writeJsonReport, parseArgs } from './lib/cli-utils';

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const filter = typeof flags.filter === 'string' ? flags.filter.split(',') : undefined;

  const app = await NestFactory.createApplicationContext(GeoCliModule, { logger: false });
  const prisma = app.get(PrismaService);
  const validator = app.get(GeoValidator);

  const where: any = {};
  if (filter) {
    where.OR = [];
    if (filter.includes('985')) where.OR.push({ is985: true });
    if (filter.includes('211')) where.OR.push({ is211: true });
    if (filter.includes('dfc')) where.OR.push({ isDoubleFirstClass: true });
    if (where.OR.length === 0) delete where.OR;
  }
  const list = await prisma.university.findMany({
    where,
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const bar = makeBar(list.length, 'validate');
  let ok = 0, inv = 0, err = 0;
  const issueDiff = { newIssues: 0, resolvedIssues: 0 };

  for (const { id } of list) {
    try {
      const uni = await prisma.university.findUnique({
        where: { id },
        include: { campuses: true, geoIssues: true },
      });
      if (!uni) continue;

      const report = await validator.validate({
        id: uni.id, name: uni.name,
        province: uni.province, city: uni.city,
        address: uni.address,
        latitude: uni.latitude == null ? undefined : Number(uni.latitude),
        longitude: uni.longitude == null ? undefined : Number(uni.longitude),
        campuses: uni.campuses.map((c) => ({
          id: c.id, name: c.name, isMain: c.isMain,
          city: c.city, province: c.province,
          latitude: c.latitude == null ? undefined : Number(c.latitude),
          longitude: c.longitude == null ? undefined : Number(c.longitude),
        })),
      });

      const previousTypes: Set<string> = new Set(uni.geoIssues
        .filter((i) => i.status === 'pending').map((i) => i.issueType));
      const newTypes: Set<string> = new Set(report.issues.map((i) => i.issueType as string));
      for (const t of newTypes) if (!previousTypes.has(t)) issueDiff.newIssues += 1;
      for (const t of previousTypes) if (!newTypes.has(t)) issueDiff.resolvedIssues += 1;

      report.pass ? (ok += 1) : (inv += 1);
    } catch (e) {
      err += 1;
      console.error(`[validate] error for university ${id}: ${(e as Error).message}`);
    }
    bar.increment(1, { ok, inv, err });
  }
  bar.stop();

  const file = writeJsonReport('geo-validate', {
    timestamp: new Date().toISOString(),
    total: list.length, verified: ok, invalid: inv, errors: err,
    issueDiff,
  });
  console.log(`[validate] done. report: ${file}`);
  await app.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
