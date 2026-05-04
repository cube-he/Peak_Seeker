/**
 * Seed province_year_stats from researched data + score_segments.
 * Idempotent (upsert).
 *
 * Usage: cd apps/server && pnpm ts-node scripts/seed-province-stats.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PROVINCE_YEAR_STATS } from './fetch-province-stats/seed-data';
import { normalizeSubject } from '../src/scripts/etl-predict-rank/subject-normalize';

async function computeRankedCount(
  prisma: PrismaClient,
  year: number,
  canonicalExamType: string,
): Promise<number | null> {
  // score_segments.exam_type may be 物理类/理科/历史类/文科/etc — query all rows for the year
  // and filter by normalizing each row's examType to canonical.
  const segments = await prisma.scoreSegment.findMany({
    where: { year, province: '四川' },
    select: { examType: true, cumulativeCount: true },
  });
  const matched = segments.filter((s) => normalizeSubject(s.examType) === canonicalExamType);
  if (matched.length === 0) return null;
  return Math.max(...matched.map((s) => s.cumulativeCount));
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });
  const fetchedDate = new Date();

  let upserted = 0;
  for (const row of PROVINCE_YEAR_STATS) {
    const rankedCount = await computeRankedCount(prisma, row.year, row.examType);
    await prisma.provinceYearStat.upsert({
      where: {
        province_year_examType: {
          province: row.province,
          year: row.year,
          examType: row.examType,
        },
      },
      create: {
        province: row.province,
        year: row.year,
        examType: row.examType,
        registrants: row.registrants,
        examineesActual: row.examineesActual,
        rankedCount,
        source: row.source,
        fetchedDate,
        notes: row.notes,
      },
      update: {
        registrants: row.registrants,
        examineesActual: row.examineesActual,
        rankedCount,
        source: row.source,
        fetchedDate,
        notes: row.notes,
      },
    });
    upserted++;
    const parts: string[] = [];
    if (row.registrants != null) parts.push(`registrants=${row.registrants}`);
    if (row.examineesActual != null) parts.push(`examineesActual=${row.examineesActual}`);
    if (rankedCount != null) parts.push(`rankedCount=${rankedCount}`);
    console.log(`  upserted ${row.province}/${row.year}/${row.examType}: ${parts.join(', ') || 'all null'}`);
  }
  console.log(`[seed-province-stats] ${upserted} rows upserted`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
