/**
 * Import supplementary volunteer collection data from the merged XLSX.
 *
 * Usage:
 *   cd apps/server
 *   pnpm ts-node scripts/import-supplementary-xlsx.ts --file=/path/to/supplementary.xlsx --replace
 *   pnpm ts-node scripts/import-supplementary-xlsx.ts --file=/path/to/supplementary.xlsx --dry-run
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';

interface ParsedSupplementaryRecord {
  year: number;
  province: string;
  batch: string;
  roundNumber: number;
  universityId: number;
  universityName: string;
  subject: string | null;
  groupCode: string | null;
  majorCode: string | null;
  majorName: string | null;
  planCount: number | null;
  requirements: string | null;
  filingMinScore: number | null;
  filingMinRank: number | null;
}

interface UniversityRef {
  id: number;
  name: string;
  code: string | null;
}

const PROVINCE = '四川';
const ROUND_PLAN_HEADERS = [
  '第1次专业计划数',
  '第2次专业计划数',
  '第3次专业计划数',
  '第4次专业计划数',
];

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) return richText.map((item) => item.text ?? '').join('');
    const text = (value as { text?: string }).text;
    if (text != null) return String(text);
    const result = (value as { result?: unknown }).result;
    if (result != null) return toText(result);
  }
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  const text = toText(value).replace(/,/g, '').trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function normalizeCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed.replace(/^0+/, '');
}

function normalizeUniversityName(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function normalizeBatch(rawBatch: string, recruitType: string): string {
  const text = `${rawBatch} ${recruitType}`;
  if (text.includes('区域教育均衡')) return '本科批(区域教育均衡发展专项)';
  if (text.includes('高校专项')) return '本科批(高校专项)';
  if (text.includes('少数民族预科') || text.includes('预科')) return '本科批(省属高校少数民族预科)';
  if (text.includes('专科') && text.includes('提前')) return '高职(专科)提前批';
  if (text.includes('高职') || text.includes('专科批')) return '高职(专科)批';
  if (text.includes('提前批B段')) return '本科提前批B段';
  if (text.includes('提前批A段') || text.includes('本科提前批')) return '本科提前批A段';
  if (text.includes('本科二批') || text.includes('本科批B段') || text.includes('B段')) return '本科批B段';
  if (
    text.includes('本科一批') ||
    text.includes('本科批A段') ||
    text.includes('国家专项') ||
    text.includes('地方专项')
  ) {
    return '本科批A段';
  }
  return rawBatch.trim();
}

function buildUniversityMaps(universities: UniversityRef[]) {
  const byCode = new Map<string, UniversityRef>();
  const byName = new Map<string, UniversityRef>();
  for (const university of universities) {
    if (university.code) byCode.set(normalizeCode(university.code), university);
    byName.set(normalizeUniversityName(university.name), university);
  }
  return { byCode, byName };
}

function findUniversity(
  maps: ReturnType<typeof buildUniversityMaps>,
  code: string,
  name: string,
): UniversityRef | null {
  const codeKey = normalizeCode(code);
  if (codeKey && maps.byCode.has(codeKey)) return maps.byCode.get(codeKey)!;
  const nameKey = normalizeUniversityName(name);
  return maps.byName.get(nameKey) ?? null;
}

function getCell(row: ExcelJS.Row, indexes: Map<string, number>, header: string): unknown {
  const index = indexes.get(header);
  return index ? row.getCell(index).value : null;
}

function buildRequirements(parts: string[]): string | null {
  const text = parts.map((part) => part.trim()).filter(Boolean).join('；');
  return text || null;
}

async function parseWorkbook(
  filePath: string,
  universities: UniversityRef[],
): Promise<{
  records: ParsedSupplementaryRecord[];
  sheetRows: number;
  skippedNoPlan: number;
  skippedNoUniversity: number;
  skippedInvalid: number;
  unmatchedUniversities: Array<{ code: string; name: string; count: number }>;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`Empty workbook: ${filePath}`);

  const headerRow = sheet.getRow(1);
  const indexes = new Map<string, number>();
  headerRow.eachCell((cell, column) => {
    indexes.set(toText(cell.value), column);
  });

  const maps = buildUniversityMaps(universities);
  const records: ParsedSupplementaryRecord[] = [];
  const unmatched = new Map<string, { code: string; name: string; count: number }>();
  let skippedNoPlan = 0;
  let skippedNoUniversity = 0;
  let skippedInvalid = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const year = toNumber(getCell(row, indexes, '年份'));
    const rawBatch = toText(getCell(row, indexes, '录取批次'));
    const recruitType = toText(getCell(row, indexes, '招生类型'));
    const universityCode = toText(getCell(row, indexes, '院校代码'));
    const universityName = toText(getCell(row, indexes, '院校名称'));
    const majorName = toText(getCell(row, indexes, '专业名称')) || null;
    // 候选卡可见性依赖这三列(loadSupplementaryByGroup 按 groupCode 聚合 + subject 过滤); 源缺列时 getCell→null
    const subject = toText(getCell(row, indexes, '科类')) || toText(getCell(row, indexes, '首选科目')) || null;
    const groupCode = toText(getCell(row, indexes, '专业组代码')) || null;
    const majorCode = toText(getCell(row, indexes, '专业代码')) || null;
    if (!year || !rawBatch || !universityName) {
      skippedInvalid++;
      continue;
    }

    const university = findUniversity(maps, universityCode, universityName);
    if (!university) {
      skippedNoUniversity++;
      const key = `${universityCode}|${universityName}`;
      const current = unmatched.get(key) ?? { code: universityCode, name: universityName, count: 0 };
      current.count++;
      unmatched.set(key, current);
      continue;
    }

    const batch = normalizeBatch(rawBatch, recruitType);
    const requirements = buildRequirements([
      toText(getCell(row, indexes, '再选科目要求')),
      toText(getCell(row, indexes, '专业备注')),
      toText(getCell(row, indexes, '院校备注')),
      toText(getCell(row, indexes, '降分政策')),
    ]);
    const filingMinScore = toNumber(getCell(row, indexes, '调档线'));
    let hasAnyPlan = false;

    ROUND_PLAN_HEADERS.forEach((header, index) => {
      const planCount = toNumber(getCell(row, indexes, header));
      if (!planCount || planCount <= 0) return;
      hasAnyPlan = true;
      records.push({
        year,
        province: PROVINCE,
        batch,
        roundNumber: index + 1,
        universityId: university.id,
        universityName: university.name,
        subject,
        groupCode,
        majorCode,
        majorName,
        planCount,
        requirements,
        filingMinScore,
        filingMinRank: null,
      });
    });

    if (!hasAnyPlan) skippedNoPlan++;
  }

  return {
    records,
    sheetRows: Math.max(sheet.rowCount - 1, 0),
    skippedNoPlan,
    skippedNoUniversity,
    skippedInvalid,
    unmatchedUniversities: Array.from(unmatched.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  };
}

async function refreshSummaries(prisma: PrismaClient): Promise<number> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE supplementary_summaries');
  const inserted = await prisma.$executeRawUnsafe(`
    INSERT INTO supplementary_summaries
      (created_at, year, province, batch, university_id, total_rounds, total_plan_count, supplementary_rate)
    SELECT
      NOW(),
      sr.year,
      sr.province,
      sr.batch,
      sr.university_id,
      COUNT(DISTINCT sr.round_number) AS total_rounds,
      COALESCE(SUM(sr.plan_count), 0) AS total_plan_count,
      CASE
        WHEN ep_total.total_plan > 0
        THEN LEAST(999.99, ROUND(COALESCE(SUM(sr.plan_count), 0) * 100.0 / ep_total.total_plan, 2))
        ELSE NULL
      END AS supplementary_rate
    FROM supplementary_records sr
    LEFT JOIN (
      SELECT
        ep.university_id,
        ep.year,
        ep.province,
        ep.batch,
        SUM(ep.plan_count) AS total_plan
      FROM enrollment_plans ep
      GROUP BY ep.university_id, ep.year, ep.province, ep.batch
    ) ep_total
      ON ep_total.university_id = sr.university_id
      AND ep_total.year = sr.year
      AND ep_total.province = sr.province
      AND ep_total.batch = sr.batch
    GROUP BY sr.year, sr.province, sr.batch, sr.university_id, ep_total.total_plan
  `);
  return Number(inserted);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const replace = Boolean(args.replace);
  if (!file) throw new Error('Missing --file=/path/to/supplementary.xlsx');

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const universities = await prisma.university.findMany({
      select: { id: true, name: true, code: true },
    });
    const parsed = await parseWorkbook(file, universities);
    console.log(JSON.stringify({
      file,
      dryRun,
      replace,
      sheetRows: parsed.sheetRows,
      expandedRecords: parsed.records.length,
      skippedNoPlan: parsed.skippedNoPlan,
      skippedNoUniversity: parsed.skippedNoUniversity,
      skippedInvalid: parsed.skippedInvalid,
      unmatchedUniversities: parsed.unmatchedUniversities,
    }, null, 2));

    if (dryRun) return;
    if (replace) {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE supplementary_summaries');
      await prisma.$executeRawUnsafe('TRUNCATE TABLE supplementary_records');
    }

    let imported = 0;
    for (let index = 0; index < parsed.records.length; index += 1000) {
      const chunk = parsed.records.slice(index, index + 1000);
      const result = await prisma.supplementaryRecord.createMany({ data: chunk });
      imported += result.count;
      console.log(`imported ${imported}/${parsed.records.length}`);
    }
    const summaries = await refreshSummaries(prisma);
    console.log(JSON.stringify({ imported, summaries }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
