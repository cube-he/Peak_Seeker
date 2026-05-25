/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "02_详情扩展" 到 universities 表。
 * 用法（cd apps/server）：
 *   pnpm import:university-details --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx
 *   pnpm import:university-details --file=... --dry-run
 *   pnpm import:university-details --file=... --overwrite
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '02_详情扩展';

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const r = (value as any).richText;
    if (Array.isArray(r)) return r.map((i: any) => i.text ?? '').join('');
    const t = (value as any).text;
    if (t != null) return String(t);
    const res = (value as any).result;
    if (res != null) return toText(res);
  }
  return String(value).trim();
}

function toInt(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function nullIfEmpty(value: unknown): string | null {
  const t = toText(value).trim();
  return t === '' || t === 'NaN' ? null : t;
}

interface DetailsRow {
  code: string | null;
  name: string;
  masterProgramCount: number | null;
  doctoralProgramCount: number | null;
  firstClassDisciplineCount: number | null;
  nationalFeatureMajorCount: number | null;
  nationalKeyDisciplineCount: number | null;
  aClassDisciplineCount: number | null;
  disciplineEvaluationLevel: string | null;
  furtherStudyRate: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  heatScore: number | null;
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): DetailsRow[] {
  const idx = colIndexes(sheet);
  const get = (row: ExcelJS.Row, col: string) => {
    const c = idx.get(col);
    return c ? row.getCell(c).value : undefined;
  };
  const rows: DetailsRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(get(row, '规范化名')).trim();
    if (!name) continue;
    rows.push({
      code: nullIfEmpty(get(row, '教育部代码'))?.replace(/\.0+$/, '') ?? null,
      name,
      masterProgramCount: toInt(get(row, '硕士点数')),
      doctoralProgramCount: toInt(get(row, '博士点数')),
      firstClassDisciplineCount: toInt(get(row, '双一流学科数')),
      nationalFeatureMajorCount: toInt(get(row, '国家级特色专业数')),
      nationalKeyDisciplineCount: toInt(get(row, '国家重点学科数')),
      aClassDisciplineCount: toInt(get(row, 'A类学科数')),
      disciplineEvaluationLevel: nullIfEmpty(get(row, '教育部学科评估')),
      furtherStudyRate: nullIfEmpty(get(row, '升学率')),
      description: nullIfEmpty(get(row, '学校简介')),
      logoUrl: nullIfEmpty(get(row, 'Logo地址')),
      bannerUrl: nullIfEmpty(get(row, 'Banner地址')),
      heatScore: toInt(get(row, '热度')),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=...');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`sheet "${SHEET_NAME}" 不存在`);
  const rows = parseRows(sheet);
  console.log(`xlsx 解析：${SHEET_NAME} ${rows.length} 行`);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const matcher = await UniversityMatcher.fromDb(prisma);
    const updates: Array<{ id: number; data: Record<string, unknown> }> = [];

    for (const row of rows) {
      const ids = (row.code ? matcher.matchByCode(row.code) : null) ?? matcher.matchByName(row.name);
      if (!ids) continue;
      const patch: Record<string, unknown> = {
        masterProgramCount: row.masterProgramCount,
        doctoralProgramCount: row.doctoralProgramCount,
        firstClassDisciplineCount: row.firstClassDisciplineCount,
        nationalFeatureMajorCount: row.nationalFeatureMajorCount,
        nationalKeyDisciplineCount: row.nationalKeyDisciplineCount,
        aClassDisciplineCount: row.aClassDisciplineCount,
        disciplineEvaluationLevel: row.disciplineEvaluationLevel,
        furtherStudyRate: row.furtherStudyRate,
        description: row.description,
        logoUrl: row.logoUrl,
        bannerUrl: row.bannerUrl,
        heatScore: row.heatScore,
      };
      if (!overwrite) {
        for (const k of Object.keys(patch)) {
          const v = patch[k];
          if (v === null || v === '' || v === 0) delete patch[k];
        }
      }
      if (Object.keys(patch).length === 0) continue;
      for (const id of ids) updates.push({ id, data: patch });
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: rows.length,
      universitiesToUpdate: updates.length,
      unmatched: report.totalUnmatched,
      sampleUnmatched: report.sampleNames.slice(0, 10),
    }, null, 2));

    if (dryRun) return;
    let done = 0;
    for (const u of updates) {
      await prisma.university.update({ where: { id: u.id }, data: u.data });
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${updates.length}`);
    }
    console.log(`完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
