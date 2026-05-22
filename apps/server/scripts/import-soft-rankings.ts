/**
 * 导入软科院校排名 xlsx 到 University 表（softRankList/softRanking/softRankYear/softCategory/softCategoryRank）。
 * 用法（在 apps/server，需 DATABASE_URL）：
 *   pnpm import:soft-rankings --file=../../data/院校级数据/学校排名.xlsx
 *   pnpm import:soft-rankings --file=... --dry-run
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';

// 主榜：sheet 名 -> 体系 + 年份
const MAIN_SHEETS: Record<string, { list: string; year: number }> = {
  '中国大学排名（总榜）_10': { list: '本科', year: 2026 },
  '中国民办高校排名（总榜）_-15': { list: '民办', year: 2026 },
  '中国高职院校排名_2025': { list: '高职', year: 2025 },
};

// 类别榜：sheet 名 -> 类别名（仅公办本科专门类别榜）
const CATEGORY_SHEETS: Record<string, string> = {
  '中国医药类大学排名_21': '医药类',
  '中国中医药大学排名_745': '中医药类',
  '中国财经类大学排名_22': '财经类',
  '中国语言类大学排名_23': '语言类',
  '中国政法类大学排名_25': '政法类',
  '中国民族类大学排名_24': '民族类',
  '中国体育类大学排名_26': '体育类',
};

interface MainRankRow { name: string; rank: number; list: string; year: number; }
interface CategoryRankRow { name: string; rank: number; category: string; }

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) return richText.map((i) => i.text ?? '').join('');
    const text = (value as { text?: string }).text;
    if (text != null) return String(text);
    const result = (value as { result?: unknown }).result;
    if (result != null) return toText(result);
  }
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  const text = toText(value).replace(/,/g, '').trim();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

// 校名匹配规范化：去括号内容、去空格（与 import-supplementary-xlsx.ts 一致）
function normalizeUniversityName(name: string): string {
  return name.replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '').trim();
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const indexes = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => indexes.set(toText(cell.value), col));
  return indexes;
}

function parseWorkbook(workbook: ExcelJS.Workbook): {
  main: MainRankRow[];
  category: CategoryRankRow[];
} {
  const main: MainRankRow[] = [];
  const category: CategoryRankRow[] = [];

  for (const [sheetName, cfg] of Object.entries(MAIN_SHEETS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const idx = colIndexes(sheet);
    const nameCol = idx.get('学校中文名');
    const rankCol = idx.get('排名');
    if (!nameCol || !rankCol) continue;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = toText(row.getCell(nameCol).value);
      const rank = toNumber(row.getCell(rankCol).value);
      if (!name || rank == null) continue;
      main.push({ name, rank, list: cfg.list, year: cfg.year });
    }
  }

  for (const [sheetName, categoryName] of Object.entries(CATEGORY_SHEETS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const idx = colIndexes(sheet);
    const nameCol = idx.get('学校中文名');
    const rankCol = idx.get('排名');
    if (!nameCol || !rankCol) continue;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = toText(row.getCell(nameCol).value);
      const rank = toNumber(row.getCell(rankCol).value);
      if (!name || rank == null) continue;
      category.push({ name, rank, category: categoryName });
    }
  }

  return { main, category };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  if (!file) throw new Error('缺少 --file=/path/to/学校排名.xlsx');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const { main: mainRows, category: categoryRows } = parseWorkbook(workbook);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const universities = await prisma.university.findMany({ select: { id: true, name: true } });
    const byName = new Map<string, number[]>();
    for (const u of universities) {
      const key = normalizeUniversityName(u.name);
      const arr = byName.get(key);
      if (arr) arr.push(u.id);
      else byName.set(key, [u.id]);
    }

    const updates = new Map<number, Record<string, unknown>>();
    const addUpdate = (id: number, patch: Record<string, unknown>) => {
      updates.set(id, { ...(updates.get(id) ?? {}), ...patch });
    };
    let mainMatched = 0;
    let categoryMatched = 0;
    let unmatched = 0;

    for (const row of mainRows) {
      const ids = byName.get(normalizeUniversityName(row.name));
      if (!ids) { unmatched++; continue; }
      for (const id of ids) {
        addUpdate(id, { softRankList: row.list, softRanking: row.rank, softRankYear: row.year });
      }
      mainMatched++;
    }
    for (const row of categoryRows) {
      const ids = byName.get(normalizeUniversityName(row.name));
      if (!ids) continue;
      for (const id of ids) {
        addUpdate(id, { softCategory: row.category, softCategoryRank: row.rank });
      }
      categoryMatched++;
    }

    console.log(JSON.stringify({
      file, dryRun,
      mainRows: mainRows.length, categoryRows: categoryRows.length,
      mainMatched, categoryMatched, unmatchedMainRows: unmatched,
      universitiesToUpdate: updates.size,
    }, null, 2));

    if (dryRun) return;

    let done = 0;
    for (const [id, data] of updates) {
      await prisma.university.update({ where: { id }, data });
      done += 1;
      if (done % 200 === 0) console.log(`  ${done}/${updates.size}`);
    }
    console.log(`导入完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败：', e);
  process.exit(1);
});
