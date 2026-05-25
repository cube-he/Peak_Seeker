/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "01_基础名录" 到 universities 表。
 * 用法（cd apps/server）：
 *   pnpm import:university-basic --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx
 *   pnpm import:university-basic --file=... --dry-run
 *   pnpm import:university-basic --file=... --overwrite
 *
 * 默认：NULL-safe — 只在 DB 字段为 NULL/默认 false 时填入新数据。
 * --overwrite：强制覆盖所有字段。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '01_基础名录';

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

function toFloat(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function toBool(value: unknown): boolean {
  const t = toText(value).trim();
  return t === '是' || t === 'true' || t === '1';
}

function nullIfEmpty(value: unknown): string | null {
  const t = toText(value).trim();
  return t === '' || t === 'NaN' ? null : t;
}

interface BasicRow {
  code: string | null;
  name: string;
  firstClassCategory: string | null;
  hasGradSchool: boolean;
  hasRecommendQualification: boolean;
  is101Plan: boolean;
  isQiangji: boolean;
  website: string | null;
  admissionWebsite: string | null;
  admissionPhone: string | null;
  admissionEmail: string | null;
  createdYear: string | null;
  campusArea: number | null;
  maleRatio: number | null;
  femaleRatio: number | null;
  postgradRate: string | null;
  cityTier: string | null;
  universityTier: string | null;
  universityBackground: string | null;
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): BasicRow[] {
  const idx = colIndexes(sheet);
  const get = (row: ExcelJS.Row, col: string) => {
    const c = idx.get(col);
    return c ? row.getCell(c).value : undefined;
  };
  const rows: BasicRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(get(row, '规范化名')).trim() || toText(get(row, '官方名称')).trim();
    if (!name) continue;
    rows.push({
      code: nullIfEmpty(get(row, '教育部代码'))?.replace(/\.0+$/, '') ?? null,
      name,
      firstClassCategory: nullIfEmpty(get(row, '一流大学类别')),
      hasGradSchool: toBool(get(row, '有研究生院')),
      hasRecommendQualification: toBool(get(row, '有保研资格')),
      is101Plan: toBool(get(row, '是否101计划')),
      isQiangji: toBool(get(row, '是否强基计划')),
      website: nullIfEmpty(get(row, '学校官网')),
      admissionWebsite: nullIfEmpty(get(row, '招生网址')),
      admissionPhone: nullIfEmpty(get(row, '招办电话')),
      admissionEmail: nullIfEmpty(get(row, '招办邮箱')),
      createdYear: nullIfEmpty(get(row, '建校年份'))?.replace(/\.0+$/, '') ?? null,
      campusArea: toFloat(get(row, '占地面积亩')),
      maleRatio: toInt(get(row, '男生比例')),
      femaleRatio: toInt(get(row, '女生比例')),
      postgradRate: nullIfEmpty(get(row, '保研率')),
      cityTier: nullIfEmpty(get(row, '城市等级')),
      universityTier: nullIfEmpty(get(row, '院校档次')),
      universityBackground: nullIfEmpty(get(row, '院校背景')),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=/path/to/院校全量数据_多Sheet.xlsx');

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
        firstClassCategory: row.firstClassCategory,
        hasGradSchool: row.hasGradSchool,
        hasRecommendQualification: row.hasRecommendQualification,
        is101Plan: row.is101Plan,
        isQiangji: row.isQiangji,
        website: row.website,
        admissionWebsite: row.admissionWebsite,
        admissionPhone: row.admissionPhone,
        admissionEmail: row.admissionEmail,
        createdYear: row.createdYear,
        campusArea: row.campusArea,
        maleRatio: row.maleRatio,
        femaleRatio: row.femaleRatio,
        postgradRate: row.postgradRate,
        cityTier: row.cityTier,
        universityTier: row.universityTier,
        universityBackground: row.universityBackground,
      };
      if (!overwrite) {
        for (const k of Object.keys(patch)) {
          const v = patch[k];
          if (v === null || v === '' || (typeof v === 'boolean' && v === false)) {
            delete patch[k];
          }
        }
      }
      if (Object.keys(patch).length === 0) continue;
      for (const id of ids) {
        updates.push({ id, data: patch });
      }
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
