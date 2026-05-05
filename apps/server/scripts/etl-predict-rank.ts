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
import { normalizeSubject, decidePoolKey, type CanonicalSubject } from '../src/scripts/etl-predict-rank/subject-normalize';
import { predictMinRank, type PredictInput } from '../src/scripts/etl-predict-rank/predict';

const PROVINCE = '四川';
const HISTORY_YEARS = 3;

function getTargetYear(): number {
  if (process.argv[2]) {
    const cliYear = Number(process.argv[2]);
    if (!Number.isInteger(cliYear) || cliYear < 2017 || cliYear > 2099) {
      throw new Error(`Invalid CLI targetYear: ${process.argv[2]}. Must be integer in [2017, 2099].`);
    }
    return cliYear;
  }
  const configPath = path.resolve(__dirname, '../../../config/rank-prediction.json');
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const y = cfg.targetYear;
    if (!Number.isInteger(y) || y < 2017 || y > 2099) {
      throw new Error(`Invalid config targetYear: ${y}. Must be integer in [2017, 2099].`);
    }
    return y;
  }
  return new Date().getFullYear();
}

interface PoolMap { [year: number]: number | null }
type Pools = { 物理: PoolMap; 历史: PoolMap; 物理化学: PoolMap };

async function loadPools(prisma: PrismaClient): Promise<Pools> {
  const stats = await prisma.provinceYearStat.findMany({
    where: { province: PROVINCE, examType: { in: ['物理', '历史', '物理化学'] } },
  });
  const out: Pools = { 物理: {}, 历史: {}, 物理化学: {} };
  for (const s of stats) {
    if (s.examType !== '物理' && s.examType !== '历史' && s.examType !== '物理化学') continue;
    // Priority chain: registrants > examineesActual > rankedCount.
    // examineesActual is fully populated for 2024/2025 even when registrants is null
    // (old gaokao didn't publish 文/理 split of registrants), so it's the most-populated A/B-tier source.
    out[s.examType][s.year] = s.registrants ?? s.examineesActual ?? s.rankedCount ?? null;
  }
  return out;
}

/**
 * Look up pool size for (poolKey, year) with fallback chain:
 * - 物理化学 / year missing → fall back to 物理 / year (subset → parent pool)
 * - 历史 / year missing → no fallback (历史 has no subset)
 * Returns null if even the parent pool is missing.
 */
function lookupPool(pools: Pools, poolKey: CanonicalSubject, year: number): number | null {
  if (poolKey === '物理化学') {
    return pools.物理化学[year] ?? pools.物理[year] ?? null;
  }
  if (poolKey === '物理' || poolKey === '历史') {
    return pools[poolKey][year] ?? null;
  }
  return null;
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

async function loadHistory(prisma: PrismaClient, targetYear: number): Promise<{
  history: Map<string, HistoryRow[]>;
  unsupportedSubjectCount: number;
}> {
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
  let unsupportedSubjectCount = 0;
  for (const r of records) {
    const subj = normalizeSubject(r.subjects);
    if (subj !== '物理' && subj !== '历史') {
      unsupportedSubjectCount++;
      continue;
    }
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
  return { history: out, unsupportedSubjectCount };
}

async function loadPlans(prisma: PrismaClient, years: number[]): Promise<{
  plans: Map<string, Map<number, number>>;
  /** key → poolKey decided by checking subjectRequirements across all loaded years.
   * If any year of this key requires 化学 (and subject=物理), the key uses 物理化学 pool;
   * otherwise it uses the parent 物理 / 历史 pool. Subject requirements rarely change
   * across years for the same group, so a single per-key decision is correct in practice.
   */
  poolKeyByKey: Map<string, CanonicalSubject>;
  unsupportedSubjectCount: number;
}> {
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
      subjectRequirements: true,
      year: true,
      groupPlanCount: true,
    },
    orderBy: [{ id: 'asc' }],
  });
  const out = new Map<string, Map<number, number>>();
  const poolKeyByKey = new Map<string, CanonicalSubject>();
  let unsupportedSubjectCount = 0;
  for (const p of plans) {
    const subj = normalizeSubject(p.subjects);
    if (subj !== '物理' && subj !== '历史') {
      unsupportedSubjectCount++;
      continue;
    }
    const key = keyOf({
      universityId: p.universityId,
      groupCode: p.groupCode,
      batch: p.batch,
      recruitType: p.recruitType,
      subjects: subj,
    });
    if (!out.has(key)) out.set(key, new Map());
    // groupPlanCount may differ between rows of same group (data integrity quirk).
    // orderBy id asc above makes "take first" deterministic across re-runs.
    const yearMap = out.get(key)!;
    if (!yearMap.has(p.year)) yearMap.set(p.year, p.groupPlanCount!);

    // Decide pool key: if any year/major in this group requires 化学, the whole key uses 物理化学
    const decided = decidePoolKey(p.subjects, p.subjectRequirements);
    if (decided === '物理化学') {
      poolKeyByKey.set(key, '物理化学');
    } else if (!poolKeyByKey.has(key)) {
      poolKeyByKey.set(key, subj);
    }
  }
  return { plans: out, poolKeyByKey, unsupportedSubjectCount };
}

async function main() {
  const targetYear = getTargetYear();
  console.log(`[etl-predict-rank] targetYear=${targetYear}`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  console.log('Loading pool stats...');
  const pools = await loadPools(prisma);

  console.log('Loading admission history...');
  const { history: historyByKey, unsupportedSubjectCount: histUnsupported } = await loadHistory(prisma, targetYear);
  console.log(`  ${historyByKey.size} unique keys; ${histUnsupported} rows skipped (subject not 物理/历史)`);

  console.log('Loading enrollment plans...');
  const yearsNeeded = [targetYear, ...Array.from({ length: HISTORY_YEARS }, (_, i) => targetYear - 1 - i)];
  const { plans: plansByKey, poolKeyByKey, unsupportedSubjectCount: planUnsupported } = await loadPlans(prisma, yearsNeeded);
  console.log(`  ${planUnsupported} plan rows skipped (subject not 物理/历史)`);
  let chemKeysCount = 0;
  for (const v of poolKeyByKey.values()) if (v === '物理化学') chemKeysCount++;
  console.log(`  ${chemKeysCount} keys use 物理化学 subset pool (subjectRequirements contains 化学)`);

  let written = 0;
  let skippedInsufficient = 0;
  let skippedNoPool = 0;

  for (const [key, history] of historyByKey) {
    if (history.length < 2) { skippedInsufficient++; continue; }

    const sample = history[0];
    const subj = sample.subjects;
    // Decide pool key: 物理化学 (if any plan year required 化学) OR fall back to subj.
    // If poolKeyByKey doesn't have this key (no plan data for any year), fall back to subj.
    const poolKey: CanonicalSubject = poolKeyByKey.get(key) ?? subj;

    let poolTarget = lookupPool(pools, poolKey, targetYear);
    let poolTargetIsProxy = false;
    if (poolTarget == null) {
      poolTarget = lookupPool(pools, poolKey, targetYear - 1);
      poolTargetIsProxy = poolTarget != null;
    }
    if (poolTarget == null) { skippedNoPool++; continue; }

    const planMap = plansByKey.get(key) ?? new Map<number, number>();
    const planTarget = planMap.get(targetYear) ?? null;
    const planHistorical: Record<number, number | null> = {};
    const poolHistorical: Record<number, number | null> = {};
    for (const h of history) {
      planHistorical[h.year] = planMap.get(h.year) ?? null;
      poolHistorical[h.year] = lookupPool(pools, poolKey, h.year);
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
