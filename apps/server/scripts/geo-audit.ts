/**
 * Verifies post-backfill data quality. Asserts:
 *   - 985/211 verified rate = 100%
 *   - Overall verified rate ≥ 90%
 *   - Known multi-campus universities have campuses.length ≥ 2
 *
 * Usage: pnpm ts-node scripts/geo-audit.ts
 *
 * Exits non-zero on any failed assertion.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { writeJsonReport } from './lib/cli-utils';

const KNOWN_MULTI_CAMPUS = [
  '哈尔滨工业大学', '电子科技大学', '东南大学', '中山大学', '北京师范大学',
  '北京理工大学', '武汉大学', '北京交通大学', '上海交通大学',
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  const findings: Array<{ check: string; pass: boolean; detail: unknown }> = [];

  const elite = await prisma.university.findMany({
    where: { OR: [{ is985: true }, { is211: true }] },
    select: { id: true, name: true, geoStatus: true },
  });
  const eliteUnverified = elite.filter((u) => u.geoStatus !== 'verified');
  findings.push({
    check: '985/211 verified rate = 100%',
    pass: eliteUnverified.length === 0,
    detail: { total: elite.length, unverified: eliteUnverified.length, samples: eliteUnverified.slice(0, 10) },
  });

  const total = await prisma.university.count();
  const verified = await prisma.university.count({ where: { geoStatus: 'verified' } });
  const rate = total ? verified / total : 0;
  findings.push({
    check: 'overall verified rate ≥ 90%',
    pass: rate >= 0.9,
    detail: { total, verified, rate: Number(rate.toFixed(4)) },
  });

  const multi = await prisma.university.findMany({
    where: { name: { in: KNOWN_MULTI_CAMPUS } },
    include: { campuses: true },
  });
  const multiBelow = multi.filter((u) => u.campuses.length < 2);
  findings.push({
    check: 'known multi-campus universities have ≥ 2 campuses',
    pass: multiBelow.length === 0,
    detail: {
      checked: multi.length,
      below: multiBelow.length,
      offenders: multiBelow.map((u) => ({ id: u.id, name: u.name, campusCount: u.campuses.length })),
    },
  });

  for (const f of findings) {
    const tag = f.pass ? '✓' : '✗';
    console.log(`${tag}  ${f.check}`);
    if (!f.pass) console.log('   detail:', JSON.stringify(f.detail));
  }
  const file = writeJsonReport('geo-audit', { timestamp: new Date().toISOString(), findings });
  console.log(`[audit] report: ${file}`);
  await app.close();
  if (findings.some((f) => !f.pass)) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
