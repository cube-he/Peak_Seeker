/**
 * Sanity check on the current rank_predictions table.
 *
 * NOTE: This is NOT a strict holdout calibration — strict calibration requires
 * ≥3 years of group-level data, but 2022/2023 admission_records have 0 rows
 * with groupMinRank (old gaokao predates 专业组). Only 2024 and 2025 have
 * group-level data, which is insufficient for train/test split.
 *
 * Instead this report compares each prediction's `point` against the matching
 * 2025 actual `groupMinRank`. The diff is NOT prediction error in the
 * statistical sense — it's "model output vs naively using 2025 data alone".
 * Small diff = model contributes little (basically mean of [2024, 2025] with
 * pool/plan adjustments not changing much). Large diff = pool/plan adjustments
 * meaningfully shifted the prediction.
 *
 * Outputs Markdown to stdout.
 *
 * Usage: cd apps/server && pnpm ts-node scripts/sanity-check-current-predictions.ts \
 *          > ../../docs/data-reports/2026-05-04-rank-prediction-sanity.md
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const PROVINCE = '四川';
const TARGET_YEAR = 2026;
const REFERENCE_YEAR = 2025;

interface Row {
  uniName: string;
  is985: boolean;
  is211: boolean;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: string;
  point: number;
  conservative: number;
  optimistic: number;
  actualRef: number | null;
  diff: number | null;
}

function keyOf(o: { universityId: number; groupCode: string; batch: string; recruitType: string; subjects: string }): string {
  return [o.universityId, o.groupCode, o.batch, o.recruitType, o.subjects].join('|');
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(rows: Row[]): { n: number; mae: number; mape: number; medAE: number } {
  const matched = rows.filter((r) => r.diff !== null);
  if (matched.length === 0) return { n: 0, mae: 0, mape: 0, medAE: 0 };
  const absDiffs = matched.map((r) => Math.abs(r.diff!));
  const mae = absDiffs.reduce((a, b) => a + b, 0) / matched.length;
  const mape = matched.reduce((a, r) => a + Math.abs(r.diff!) / Math.max(1, r.actualRef!), 0) / matched.length * 100;
  return { n: matched.length, mae: Math.round(mae), mape: +mape.toFixed(2), medAE: Math.round(median(absDiffs)) };
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  const preds = await prisma.rankPrediction.findMany({
    where: { targetYear: TARGET_YEAR },
    include: { university: { select: { name: true, is985: true, is211: true } } },
  });

  const actuals = await prisma.admissionRecord.findMany({
    where: { province: PROVINCE, year: REFERENCE_YEAR, groupMinRank: { not: null } },
    select: { universityId: true, groupCode: true, batch: true, recruitType: true, subjects: true, groupMinRank: true },
  });
  const actualMap = new Map<string, number>();
  for (const a of actuals) {
    const k = keyOf({ universityId: a.universityId, groupCode: a.groupCode, batch: a.batch, recruitType: a.recruitType, subjects: a.subjects });
    if (!actualMap.has(k)) actualMap.set(k, a.groupMinRank!);
  }

  const rows: Row[] = preds.map((p) => {
    const k = keyOf({ universityId: p.universityId, groupCode: p.groupCode, batch: p.batch, recruitType: p.recruitType, subjects: p.subjects });
    const actualRef = actualMap.get(k) ?? null;
    return {
      uniName: p.university.name,
      is985: p.university.is985,
      is211: p.university.is211,
      groupCode: p.groupCode,
      batch: p.batch,
      recruitType: p.recruitType,
      subjects: p.subjects,
      point: p.pointRank!,
      conservative: p.conservativeRank!,
      optimistic: p.optimisticRank!,
      actualRef,
      diff: actualRef !== null ? p.pointRank! - actualRef : null,
    };
  });

  const lines: string[] = [];
  lines.push(`# 预估位次模型 — 现状合理性报告`);
  lines.push(``);
  lines.push(`**生成时间**: ${new Date().toISOString()}`);
  lines.push(`**target_year**: ${TARGET_YEAR}`);
  lines.push(`**reference_year (用于差距计算)**: ${REFERENCE_YEAR}`);
  lines.push(`**预测总数**: ${rows.length}`);
  lines.push(``);

  // Invariant check
  const violated = rows.filter((r) => !(r.optimistic <= r.point && r.point <= r.conservative));
  lines.push(`## 不变量检查: optimistic ≤ point ≤ conservative`);
  lines.push(``);
  lines.push(`- 满足: ${rows.length - violated.length} / ${rows.length}`);
  lines.push(`- 违反: ${violated.length} (${(violated.length / rows.length * 100).toFixed(2)}%)`);
  if (violated.length > 0) {
    lines.push(`### Top 5 violators`);
    lines.push(``);
    for (const r of violated.slice(0, 5)) {
      lines.push(`- ${r.uniName} ${r.groupCode}/${r.batch}: o=${r.optimistic}, p=${r.point}, c=${r.conservative}`);
    }
  }
  lines.push(``);

  // Range width
  const ranges = rows.map((r) => r.conservative - r.optimistic);
  lines.push(`## 区间宽度 (conservative - optimistic)`);
  lines.push(``);
  lines.push(`- median: ${median(ranges)}`);
  lines.push(`- mean: ${Math.round(ranges.reduce((a, b) => a + b, 0) / ranges.length)}`);
  lines.push(``);

  // Diff vs reference year
  const matched = rows.filter((r) => r.diff !== null);
  lines.push(`## point vs ${REFERENCE_YEAR} 实际 groupMinRank`);
  lines.push(``);
  lines.push(`匹配到 ${REFERENCE_YEAR} 实际数据的预测: ${matched.length} / ${rows.length}`);
  lines.push(``);

  if (matched.length > 0) {
    const overall = summarize(matched);
    lines.push(`### 整体`);
    lines.push(``);
    lines.push(`| 指标 | 值 |`);
    lines.push(`|---|---|`);
    lines.push(`| n | ${overall.n} |`);
    lines.push(`| MAE | ${overall.mae} |`);
    lines.push(`| MAPE | ${overall.mape}% |`);
    lines.push(`| Median AE | ${overall.medAE} |`);
    lines.push(``);

    lines.push(`### 按层次分组`);
    lines.push(``);
    lines.push(`| 层次 | n | MAE | MAPE | Median AE |`);
    lines.push(`|---|---|---|---|---|`);
    const tiers: Array<[string, (r: Row) => boolean]> = [
      ['985', (r) => r.is985],
      ['211 (非985)', (r) => r.is211 && !r.is985],
      ['普通本科', (r) => !r.is985 && !r.is211 && !r.batch.includes('专科')],
      ['专科', (r) => r.batch.includes('专科')],
    ];
    for (const [name, pred] of tiers) {
      const s = summarize(matched.filter(pred));
      lines.push(`| ${name} | ${s.n} | ${s.mae} | ${s.mape}% | ${s.medAE} |`);
    }
    lines.push(``);

    lines.push(`### 按选科分组`);
    lines.push(``);
    lines.push(`| 选科 | n | MAE | MAPE |`);
    lines.push(`|---|---|---|---|`);
    for (const subj of ['物理', '历史']) {
      const s = summarize(matched.filter((r) => r.subjects === subj));
      lines.push(`| ${subj} | ${s.n} | ${s.mae} | ${s.mape}% |`);
    }
    lines.push(``);

    lines.push(`### 按 ${REFERENCE_YEAR} 实际位次段分组`);
    lines.push(``);
    lines.push(`| 位次段 | n | MAE | MAPE |`);
    lines.push(`|---|---|---|---|`);
    const buckets: Array<[string, (r: number) => boolean]> = [
      ['0-10000', (r) => r < 10000],
      ['10000-50000', (r) => r >= 10000 && r < 50000],
      ['50000-100000', (r) => r >= 50000 && r < 100000],
      ['100000+', (r) => r >= 100000],
    ];
    for (const [name, pred] of buckets) {
      const s = summarize(matched.filter((r) => pred(r.actualRef!)));
      lines.push(`| ${name} | ${s.n} | ${s.mae} | ${s.mape}% |`);
    }
    lines.push(``);

    lines.push(`## Top 20 偏移最大案例`);
    lines.push(``);
    lines.push(`| 院校 | 组 | 批次 | 选科 | actual_${REFERENCE_YEAR} | predicted | absDiff |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    const sorted = [...matched].sort((a, b) => Math.abs(b.diff!) - Math.abs(a.diff!));
    for (const r of sorted.slice(0, 20)) {
      lines.push(`| ${r.uniName} | ${r.groupCode} | ${r.batch} | ${r.subjects} | ${r.actualRef} | ${r.point} | ${Math.abs(r.diff!)} |`);
    }
    lines.push(``);
  }

  lines.push(`## 解读`);
  lines.push(``);
  lines.push(`**为什么不能做严格 holdout MAE**`);
  lines.push(``);
  lines.push(`- 严格 holdout 需要 ≥3 年同口径数据：用 N-2 / N-1 训练，预测 N，比对实际`);
  lines.push(`- 当前数据：2022/2023 没有 \`groupMinRank\`（旧高考无专业组概念），仅 2024/2025 两年`);
  lines.push(``);
  lines.push(`**本报告的 MAE 含义**`);
  lines.push(``);
  lines.push(`- target=2026 的预测使用 history=[2024, 2025]，所以 \`point\` ≈ 这两年的加权平均后再用 N_target/P_target 调整`);
  lines.push(`- 与 2025 实际比对的 MAE 不是预测误差，而是"模型相对单纯使用 2025 数值的偏移程度"`);
  lines.push(`- 偏移小 = 模型贡献小（基本是 2024/2025 平均 + 微调）；偏移大 = 池子/计划权重起了显著作用`);
  lines.push(`- 区间宽度的 median 与 mean 反映 (optimistic, conservative) 的张开程度，间接体现 2024 与 2025 的差异`);
  lines.push(``);
  lines.push(`**推进 spec-1 染色的判断**`);
  lines.push(``);
  lines.push(`- 不变量违反率应为 0% — 否则 \`point\` 算法或 round 边界有 bug`);
  lines.push(`- Top 20 偏移案例若都来自同一类异常（计划骤减/批次合并），说明这类已被识别；UI 可以通过 confidence='low' 标签传达不确定性`);
  lines.push(`- spec-1 可以推进，染色基于 \`point\`，UI 显示置信度标，等 2026 真实数据完整后做严格校准`);

  console.log(lines.join('\n'));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
