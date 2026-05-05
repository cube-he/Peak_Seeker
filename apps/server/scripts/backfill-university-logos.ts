/**
 * One-shot backfill: import university.logoUrl from enriched JSON.
 *
 * Source: scripts/data-processing/output/universities_enriched.json
 * Match key: university.code (e.g. "10001" for 北京大学)
 * Idempotent — re-running just overwrites with same values.
 *
 * Usage: cd apps/server && pnpm ts-node scripts/backfill-university-logos.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

interface EnrichedRow {
  code?: string | number;
  enrollCode?: string | number;
  name?: string;
  logoUrl?: string | null;
}

const SRC = path.resolve(
  __dirname,
  '../../../scripts/data-processing/output/universities_enriched.json',
);

async function main() {
  console.log(`[backfill-logos] reading ${SRC}`);
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf-8')) as EnrichedRow[];
  console.log(`[backfill-logos] ${raw.length} rows in source`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  let matched = 0;
  let updated = 0;
  let skippedNoLogo = 0;
  let skippedNoMatch = 0;

  for (const r of raw) {
    if (!r.logoUrl) { skippedNoLogo++; continue; }
    // DB universities.code stores enrollCode (招生代码: 1, 2, 3...), not the national 10001-style code.
    // Source enriched JSON has both fields; match on enrollCode against DB.code.
    const enrollCode = r.enrollCode != null ? String(r.enrollCode) : null;
    if (!enrollCode) { skippedNoMatch++; continue; }

    const target = await prisma.university.findFirst({ where: { code: enrollCode } });
    if (!target) { skippedNoMatch++; continue; }
    matched++;

    if (target.logoUrl !== r.logoUrl) {
      await prisma.university.update({ where: { id: target.id }, data: { logoUrl: r.logoUrl } });
      updated++;
    }
    if (matched % 200 === 0) console.log(`  matched ${matched}, updated ${updated}`);
  }

  console.log(`[backfill-logos] done: matched=${matched}, updated=${updated}, skippedNoLogo=${skippedNoLogo}, skippedNoMatch=${skippedNoMatch}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
