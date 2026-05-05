/**
 * Holdout calibration: predict 2024 using 2022/2023 history, compare to actual 2024.
 * Outputs Markdown report.
 *
 * Usage: cd apps/server && pnpm ts-node scripts/validate-rank-predictions.ts \
 *          > ../../docs/data-reports/2026-05-04-rank-prediction-validation.md
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { normalizeSubject } from '../src/scripts/etl-predict-rank/subject-normalize';
import { predictMinRank, type PredictInput } from '../src/scripts/etl-predict-rank/predict';

const PROVINCE = '四川';
const HOLDOUT_YEAR = 2024;

interface ValidationCase {
  universityId: number;
  uniName: string;
  is985: boolean;
  is211: boolean;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: '物理' | '历史';
  actual: number;
  predicted: number;
  confidence: string;
  error: number; // predicted - actual
  absError: number;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(cases: ValidationCase[]): { mae: number; mape: number; rmse: number; medAE: number; n: number } {
  if (cases.length === 0) return { mae: 0, mape: 0, rmse: 0, medAE: 0, n: 0 };
  const mae = cases.reduce((a, c) => a + c.absError, 0) / cases.length;
  const mape = cases.reduce((a, c) => a + c.absError / Math.max(1, c.actual), 0) / cases.length * 100;
  const rmse = Math.sqrt(cases.reduce((a, c) => a + c.error * c.error, 0) / cases.length);
  return { mae: Math.round(mae), mape: +mape.toFixed(2), rmse: Math.round(rmse), medAE: Math.round(median(cases.map(c => c.absError))), n: cases.length };
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  // Load 2024 actuals (target)
  const actuals = await prisma.admissionRecord.findMany({
    where: { province: PROVINCE, year: HOLDOUT_YEAR, groupMinRank: { not: null } },
    select: {
      universityId: true,
      groupCode: true,
      batch: true,
      recruitType: true,
      subjects: true,
      groupMinRank: true,
    },
  });

  // Load 2022/2023 history for prediction
  const history = await prisma.admissionRecord.findMany({
    where: { province: PROVINCE, year: { in: [2022, 2023] }, groupMinRank: { not: null } },
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

  // Plans for all 3 years
  const plans = await prisma.enrollmentPlan.findMany({
    where: { province: PROVINCE, year: { in: [2022, 2023, 2024] }, groupPlanCount: { not: null } },
    select: {
      universityId: true,
      groupCode: true,
      batch: true,
      recruitType: true,
      subjects: true,
      year: true,
      groupPlanCount: true,
    },
    orderBy: [{ id: 'asc' }],
  });

  // Pools
  const stats = await prisma.provinceYearStat.findMany({
    where: { province: PROVINCE, examType: { in: ['物理', '历史'] } },
  });
  const pools: { 物理: Record<number, number | null>; 历史: Record<number, number | null> } = { 物理: {}, 历史: {} };
  for (const s of stats) {
    // Priority chain: registrants > examineesActual > rankedCount (consistent with ETL)
    pools[s.examType as '物理' | '历史'][s.year] = s.registrants ?? s.examineesActual ?? s.rankedCount ?? null;
  }

  // Index helpers
  function key(r: { universityId: number; groupCode: string; batch: string; recruitType: string; subjects: string }): string | null {
    const subj = normalizeSubject(r.subjects);
    if (subj !== '物理' && subj !== '历史') return null;
    return [r.universityId, r.groupCode, r.batch, r.recruitType, subj].join('|');
  }

  const histByKey = new Map<string, Array<{ year: number; minRank: number; subjects: '物理' | '历史' }>>();
  for (const h of history) {
    const k = key(h); if (!k) continue;
    if (!histByKey.has(k)) histByKey.set(k, []);
    histByKey.get(k)!.push({
      year: h.year,
      minRank: h.groupMinRank!,
      subjects: normalizeSubject(h.subjects) as '物理' | '历史',
    });
  }

  const planByKey = new Map<string, Map<number, number>>();
  for (const p of plans) {
    const k = key(p); if (!k) continue;
    if (!planByKey.has(k)) planByKey.set(k, new Map());
    if (!planByKey.get(k)!.has(p.year)) planByKey.get(k)!.set(p.year, p.groupPlanCount!);
  }

  // Universities for tier breakdown
  const uniList = await prisma.university.findMany({ select: { id: true, name: true, is985: true, is211: true } });
  const uniMap = new Map<number, { name: string; is985: boolean; is211: boolean }>();
  for (const u of uniList) uniMap.set(u.id, u);

  // Build validation cases
  const cases: ValidationCase[] = [];
  for (const a of actuals) {
    const subj = normalizeSubject(a.subjects);
    if (subj !== '物理' && subj !== '历史') continue;
    const k = key(a)!;
    const hist = histByKey.get(k);
    if (!hist || hist.length < 2) continue;

    const planMap = planByKey.get(k) ?? new Map<number, number>();
    const planTarget = planMap.get(HOLDOUT_YEAR) ?? null;
    const poolTarget = pools[subj][HOLDOUT_YEAR];
    if (poolTarget == null) continue;

    const input: PredictInput = {
      history: [...hist].sort((x, y) => y.year - x.year).map(h => ({ year: h.year, minRank: h.minRank })),
      planTarget,
      planHistorical: { 2022: planMap.get(2022) ?? null, 2023: planMap.get(2023) ?? null },
      poolTarget,
      poolHistorical: { 2022: pools[subj][2022] ?? null, 2023: pools[subj][2023] ?? null },
      poolTargetIsProxy: false,
    };
    const result = predictMinRank(input);
    if (!result) continue;

    const u = uniMap.get(a.universityId);
    cases.push({
      universityId: a.universityId,
      uniName: u?.name ?? `#${a.universityId}`,
      is985: u?.is985 ?? false,
      is211: u?.is211 ?? false,
      groupCode: a.groupCode,
      batch: a.batch,
      recruitType: a.recruitType,
      subjects: subj as '物理' | '历史',
      actual: a.groupMinRank!,
      predicted: result.point,
      confidence: result.confidence,
      error: result.point - a.groupMinRank!,
      absError: Math.abs(result.point - a.groupMinRank!),
    });
  }

  // Output Markdown
  const lines: string[] = [];
  lines.push(`# 预估位次模型校准报告 — 2024 holdout`);
  lines.push(``);
  lines.push(`**生成时间**: ${new Date().toISOString()}`);
  lines.push(`**Holdout 年份**: ${HOLDOUT_YEAR}`);
  lines.push(`**训练集**: 2022/2023 admission_records + 2024 plans + 2024 ProvinceYearStat`);
  lines.push(`**样本数**: ${cases.length}`);
  lines.push(``);

  const overall = summarize(cases);
  lines.push(`## 整体指标`);
  lines.push(``);
  lines.push(`| 指标 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| MAE | ${overall.mae} |`);
  lines.push(`| MAPE | ${overall.mape}% |`);
  lines.push(`| RMSE | ${overall.rmse} |`);
  lines.push(`| Median AE | ${overall.medAE} |`);
  lines.push(`| n | ${overall.n} |`);
  lines.push(``);

  lines.push(`### 验收阈值`);
  lines.push(``);
  lines.push(`- 整体 MAE < 3000 → ${overall.mae < 3000 ? '✅' : '❌'} (实际 ${overall.mae})`);
  const highConf = cases.filter(c => c.confidence === 'high');
  const highSummary = summarize(highConf);
  lines.push(`- High confidence MAE < 1500 → ${highSummary.mae < 1500 ? '✅' : '❌'} (实际 ${highSummary.mae}, n=${highSummary.n})`);
  const tier1 = cases.filter(c => c.actual < 10000);
  const tier1Summary = summarize(tier1);
  lines.push(`- 0-10000 段 MAE < 800 → ${tier1Summary.mae < 800 ? '✅' : '❌'} (实际 ${tier1Summary.mae}, n=${tier1Summary.n})`);
  lines.push(``);

  lines.push(`## 按层次分组`);
  lines.push(``);
  lines.push(`| 层次 | n | MAE | MAPE | Median AE |`);
  lines.push(`|---|---|---|---|---|`);
  const tiers: Array<[string, (c: ValidationCase) => boolean]> = [
    ['985', c => c.is985],
    ['211 (非 985)', c => c.is211 && !c.is985],
    ['普通本科', c => !c.is985 && !c.is211 && !c.batch.includes('专科')],
    ['专科', c => c.batch.includes('专科')],
  ];
  for (const [name, pred] of tiers) {
    const sub = cases.filter(pred);
    const s = summarize(sub);
    lines.push(`| ${name} | ${s.n} | ${s.mae} | ${s.mape}% | ${s.medAE} |`);
  }
  lines.push(``);

  lines.push(`## 按选科分组`);
  lines.push(``);
  lines.push(`| 选科 | n | MAE | MAPE |`);
  lines.push(`|---|---|---|---|`);
  for (const subj of ['物理', '历史'] as const) {
    const s = summarize(cases.filter(c => c.subjects === subj));
    lines.push(`| ${subj} | ${s.n} | ${s.mae} | ${s.mape}% |`);
  }
  lines.push(``);

  lines.push(`## 按位次段分组`);
  lines.push(``);
  lines.push(`| 位次段 | n | MAE | MAPE |`);
  lines.push(`|---|---|---|---|`);
  const buckets: Array<[string, (r: number) => boolean]> = [
    ['0-10000', r => r < 10000],
    ['10000-50000', r => r >= 10000 && r < 50000],
    ['50000-100000', r => r >= 50000 && r < 100000],
    ['100000+', r => r >= 100000],
  ];
  for (const [name, pred] of buckets) {
    const s = summarize(cases.filter(c => pred(c.actual)));
    lines.push(`| ${name} | ${s.n} | ${s.mae} | ${s.mape}% |`);
  }
  lines.push(``);

  lines.push(`## 按 confidence 分组`);
  lines.push(``);
  lines.push(`| confidence | n | MAE | MAPE |`);
  lines.push(`|---|---|---|---|`);
  for (const conf of ['high', 'medium', 'low'] as const) {
    const s = summarize(cases.filter(c => c.confidence === conf));
    lines.push(`| ${conf} | ${s.n} | ${s.mae} | ${s.mape}% |`);
  }
  lines.push(``);

  lines.push(`## Top 20 误差最大案例`);
  lines.push(``);
  lines.push(`| 院校 | 组 | 批次 | 选科 | actual | predicted | absError |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const c of [...cases].sort((a, b) => b.absError - a.absError).slice(0, 20)) {
    lines.push(`| ${c.uniName} | ${c.groupCode} | ${c.batch} | ${c.subjects} | ${c.actual} | ${c.predicted} | ${c.absError} |`);
  }

  console.log(lines.join('\n'));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
