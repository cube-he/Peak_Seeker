/**
 * Compute RankPrediction for every (uniId, groupCode, batch, recruitType, subjects)
 * combination with sufficient history, for the configured target year.
 *
 * Usage: cd apps/server && pnpm ts-node scripts/etl-predict-rank.ts [targetYear]
 *        Defaults to value in config/rank-prediction.json.
 */
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { normalizeSubject } from '../src/scripts/etl-predict-rank/subject-normalize';
import { predictMinRank, type PredictInput } from '../src/scripts/etl-predict-rank/predict';

const PROVINCE = '四川';
const HISTORY_YEARS = 3;

function getTargetYear(): number {
  const cliYear = process.argv[2] ? Number(process.argv[2]) : null;
  if (cliYear) return cliYear;
  const configPath = path.resolve(__dirname, '../../../config/rank-prediction.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')).targetYear;
  }
  return new Date().getFullYear();
}

interface PoolMap { [year: number]: number | null }

async function loadPools(prisma: PrismaClient): Promise<{ 物理: PoolMap; 历史: PoolMap }> {
  const stats = await prisma.provinceYearStat.findMany({
    where: { province: PROVINCE, examType: { in: ['物理', '历史'] } },
  });
  const out: { 物理: PoolMap; 历史: PoolMap } = { 物理: {}, 历史: {} };
  for (const s of stats) {
    const subj = s.examType as '物理' | '历史';
    // Priority chain: registrants > examineesActual > rankedCount.
    // examineesActual is fully populated for 2024/2025 even when registrants is null
    // (old gaokao didn't publish 文/理 split of registrants), so it's the most-populated A/B-tier source.
    out[subj][s.year] = s.registrants ?? s.examineesActual ?? s.rankedCount ?? null;
  }
  return out;
}

interface HistoryKey {
  universityId: number;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: '物理' | '历史';
}
interface HistoryRow extends HistoryKey {
  year: number;
  groupMinRank: number;
}

function keyOf(k: HistoryKey): string {
  return [k.universityId, k.groupCode, k.batch, k.recruitType, k.subjects].join('|');
}

async function loadHistory(prisma: PrismaClient, targetYear: number): Promise<Map<string, HistoryRow[]>> {
  const records = await prisma.admissionRecord.findMany({
    where: {
      province: PROVINCE,
      year: { gte: targetYear - HISTORY_YEARS, lt: targetYear },
      groupMinRank: { not: null },
    },
    select: {
      universityId: true,
      groupCode: true,
      batch: true,
      recruitType: true,
      subjects: true,
      year: true,
      groupMinRank: true,
    },
  });
  // group by (uni, group, batch, recruitType, subjects); for each year keep one row
  const grouped = new Map<string, Map<number, HistoryRow>>();
  for (const r of records) {
    const subj = normalizeSubject(r.subjects);
    if (subj !== '物理' && subj !== '历史') continue;
    const k: HistoryKey = {
      universityId: r.universityId,
      groupCode: r.groupCode,
      batch: r.batch,
      recruitType: r.recruitType,
      subjects: subj,
    };
    const key = keyOf(k);
    if (!grouped.has(key)) grouped.set(key, new Map());
    const yearMap = grouped.get(key)!;
    if (!yearMap.has(r.year)) {
      yearMap.set(r.year, { ...k, year: r.year, groupMinRank: r.groupMinRank! });
    }
  }
  // flatten to sorted arrays (desc by year)
  const out = new Map<string, HistoryRow[]>();
  for (const [key, yearMap] of grouped) {
    const arr = [...yearMap.values()].sort((a, b) => b.year - a.year).slice(0, HISTORY_YEARS);
    out.set(key, arr);
  }
  return out;
}

async function loadPlans(prisma: PrismaClient, years: number[]): Promise<Map<string, Map<number, number>>> {
  const plans = await prisma.enrollmentPlan.findMany({
    where: {
      province: PROVINCE,
      year: { in: years },
      groupPlanCount: { not: null },
    },
    select: {
      universityId: true,
      groupCode: true,
      batch: true,
      recruitType: true,
      subjects: true,
      year: true,
      groupPlanCount: true,
    },
  });
  const out = new Map<string, Map<number, number>>();
  for (const p of plans) {
    const subj = normalizeSubject(p.subjects);
    if (subj !== '物理' && subj !== '历史') continue;
    const key = keyOf({
      universityId: p.universityId,
      groupCode: p.groupCode,
      batch: p.batch,
      recruitType: p.recruitType,
      subjects: subj,
    });
    if (!out.has(key)) out.set(key, new Map());
    // groupPlanCount may differ between rows of same group (shouldn't, but defensive — take first)
    const yearMap = out.get(key)!;
    if (!yearMap.has(p.year)) yearMap.set(p.year, p.groupPlanCount!);
  }
  return out;
}

async function main() {
  const targetYear = getTargetYear();
  console.log(`[etl-predict-rank] targetYear=${targetYear}`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  console.log('Loading pool stats...');
  const pools = await loadPools(prisma);

  console.log('Loading admission history...');
  const historyByKey = await loadHistory(prisma, targetYear);
  console.log(`  ${historyByKey.size} unique (uni,group,batch,recruitType,subjects) keys`);

  console.log('Loading enrollment plans...');
  const yearsNeeded = [targetYear, ...Array.from({ length: HISTORY_YEARS }, (_, i) => targetYear - 1 - i)];
  const plansByKey = await loadPlans(prisma, yearsNeeded);

  let written = 0;
  let skippedInsufficient = 0;
  let skippedNoPool = 0;

  for (const [key, history] of historyByKey) {
    if (history.length < 2) { skippedInsufficient++; continue; }

    const sample = history[0];
    const subj = sample.subjects;
    let poolTarget = pools[subj][targetYear] ?? null;
    let poolTargetIsProxy = false;
    if (poolTarget == null) {
      poolTarget = pools[subj][targetYear - 1] ?? null;
      poolTargetIsProxy = poolTarget != null;
    }
    if (poolTarget == null) { skippedNoPool++; continue; }

    const planMap = plansByKey.get(key) ?? new Map<number, number>();
    const planTarget = planMap.get(targetYear) ?? null;
    const planHistorical: Record<number, number | null> = {};
    const poolHistorical: Record<number, number | null> = {};
    for (const h of history) {
      planHistorical[h.year] = planMap.get(h.year) ?? null;
      poolHistorical[h.year] = pools[subj][h.year] ?? null;
    }

    const input: PredictInput = {
      history: history.map((h) => ({ year: h.year, minRank: h.groupMinRank })),
      planTarget,
      planHistorical,
      poolTarget,
      poolHistorical,
      poolTargetIsProxy,
    };

    const result = predictMinRank(input);
    if (!result) { skippedInsufficient++; continue; }

    await prisma.rankPrediction.upsert({
      where: {
        rank_pred_natural_key: {
          universityId: sample.universityId,
          groupCode: sample.groupCode,
          batch: sample.batch,
          recruitType: sample.recruitType,
          subjects: sample.subjects,
          targetYear,
        },
      },
      create: {
        universityId: sample.universityId,
        groupCode: sample.groupCode,
        batch: sample.batch,
        recruitType: sample.recruitType,
        subjects: sample.subjects,
        targetYear,
        pointRank: result.point,
        conservativeRank: result.conservative,
        optimisticRank: result.optimistic,
        basisYears: result.basisYears as any,
        confidence: result.confidence,
      },
      update: {
        pointRank: result.point,
        conservativeRank: result.conservative,
        optimisticRank: result.optimistic,
        basisYears: result.basisYears as any,
        confidence: result.confidence,
        computedAt: new Date(),
      },
    });
    written++;
    if (written % 1000 === 0) console.log(`  written ${written}`);
  }

  console.log(`[etl-predict-rank] done: written=${written}, skippedInsufficient=${skippedInsufficient}, skippedNoPool=${skippedNoPool}`);

  // Summary by confidence
  const byConfidence = await prisma.rankPrediction.groupBy({
    by: ['confidence'],
    where: { targetYear },
    _count: true,
  });
  console.log(`[etl-predict-rank] by confidence:`, byConfidence);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
