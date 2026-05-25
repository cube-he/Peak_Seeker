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
import { parseMainRank } from '../src/scripts/soft-rankings/parse-main-rank';

// 主榜：sheet 名 -> 体系 + 年份 + (可选)子榜名过滤
// subBoard:当 sheet 含多个独立子榜单（每个从 1 重新计数）时,只取指定子榜避免污染。
// 高职 sheet 内有 13 个子榜（综合类/理工类/师范类/...各从 1 计数 + 中国职业技术大学排名
// + 中国高职专科院校排名（总榜））——只「总榜」是真正的全国统一排序,其余是分类榜,
// 不能混入 softRanking 否则会出现「13 个学校并列 #1」的乱象。
// 本科/民办 sheet 都是单榜单（只用类别前缀编号区分专门类）,不需要 subBoard。
// rankCol：本科总榜用「办学层次」（含全院校的真实全国名次,综合类填数字「16」、
// 专门类填全国数字「66」而非前缀编号「财5」,这样财经/医药等院校才有 softRanking;
// 民办总榜的「办学层次」列虽存在但全空,只能用「排名」;高职 sheet 没有该列,用「排名」。
const MAIN_SHEETS: Record<string, { list: string; year: number; subBoard?: string; rankCol: string }> = {
  '中国大学排名（总榜）_10': { list: '本科', year: 2026, rankCol: '办学层次' },
  '中国民办高校排名（总榜）_-15': { list: '民办', year: 2026, rankCol: '排名' },
  '中国高职院校排名_2025': { list: '高职', year: 2025, subBoard: '中国高职专科院校排名（总榜）', rankCol: '排名' },
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

// 单 sheet 内多 sub-board 的类别榜：sheet 名 -> (子榜「榜单名称」-> 类别名)
// 高职 sheet 内含 9 个分类子榜（综合类/理工类/师范类/...各从 1 计数,数据干净）,
// 写到 softCategory + softCategoryRank。靠 buildBoardWhere 加 softRankList='高职'
// 跟本科类别榜区分(例如本科"财经类"=上海财经,高职"财经类"=浙江金融职业学院,
// 都用 softCategory='财经类'存储,不冲突)。
const CATEGORY_SUB_BOARDS: Record<string, Record<string, string>> = {
  '中国高职院校排名_2025': {
    '综合类高职专科院校排名': '综合类',
    '理工类高职专科院校排名': '理工类',
    '师范类高职专科院校排名': '师范类',
    '农林类高职专科院校排名': '农林类',
    '医药类高职专科院校排名': '医药类',
    '财经类高职专科院校排名': '财经类',
    '政法类高职专科院校排名': '政法类',
    '体育类高职专科院校排名': '体育类',
    '文艺类高职专科院校排名': '文艺类',
  },
};

// rank 可为 null:主榜 sheet 里专门类院校的"医1/财1/..."前缀编号会被
// parseMainRank 标为 null,触发对该院校 softRanking 的显式清空(覆盖旧
// import 留下的污染值),让它们的真实名次回到 softCategoryRank 统一兜底
interface MainRankRow { name: string; rank: number | null; list: string; year: number; }
// list: 当 category 来自专科子榜时填 '高职',让 update loop 同时设置
// softRankList='高职',避免「只在分类子榜出现、不在高职总榜」的 uni 缺 softRankList
// 而被高职类别 board 的 buildBoardWhere(filter softRankList='高职')排除
interface CategoryRankRow { name: string; rank: number; category: string; list?: string; }

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
  if (!text) return null;
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
    const rankCol = idx.get(cfg.rankCol);
    const subBoardCol = cfg.subBoard ? idx.get('榜单名称') : undefined;
    if (!nameCol || !rankCol) continue;
    if (cfg.subBoard && !subBoardCol) continue;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      // 多子榜 sheet（高职）按「榜单名称」过滤,只取「中国高职专科院校排名（总榜）」
      if (cfg.subBoard && subBoardCol) {
        const sub = toText(row.getCell(subBoardCol).value).trim();
        if (sub !== cfg.subBoard) continue;
      }
      const name = toText(row.getCell(nameCol).value);
      if (!name) continue;
      // parseMainRank 只接受纯数字;"医1/财1/..."等前缀编号返回 null,
      // 但仍要 push,让 addUpdate 把 softRanking 显式清空(否则旧 import
      // 把 toNumber("医1")=1 污染过来的值会一直留着)
      const rank = parseMainRank(row.getCell(rankCol).value);
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
      const rank = parseMainRank(row.getCell(rankCol).value);
      if (!name || rank == null) continue;
      category.push({ name, rank, category: categoryName });
    }
  }

  // 单 sheet 内多 sub-board 的处理（高职分类子榜）
  for (const [sheetName, subBoardMap] of Object.entries(CATEGORY_SUB_BOARDS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const idx = colIndexes(sheet);
    const nameCol = idx.get('学校中文名');
    const rankCol = idx.get('排名');
    const subBoardCol = idx.get('榜单名称');
    if (!nameCol || !rankCol || !subBoardCol) continue;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const sub = toText(row.getCell(subBoardCol).value).trim();
      const categoryName = subBoardMap[sub];
      if (!categoryName) continue;
      const name = toText(row.getCell(nameCol).value);
      const rank = parseMainRank(row.getCell(rankCol).value);
      // 高职分类子榜含 "242+/114+/..." 后段并列标记,parseMainRank 会返回 null;
      // 跳过这些只取有清晰序号的 unis,避免后段并列污染榜单
      if (!name || rank == null) continue;
      category.push({ name, rank, category: categoryName, list: '高职' });
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
  console.log(`xlsx 解析：主榜 ${mainRows.length} 行，类别榜 ${categoryRows.length} 行`);

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
    let unmatchedCategory = 0;
    const unmatchedMainNames: string[] = [];
    const unmatchedCategoryNames: string[] = [];

    for (const row of mainRows) {
      const ids = byName.get(normalizeUniversityName(row.name));
      if (!ids) {
        unmatched++;
        if (unmatchedMainNames.length < 20) unmatchedMainNames.push(row.name);
        continue;
      }
      for (const id of ids) {
        addUpdate(id, { softRankList: row.list, softRanking: row.rank, softRankYear: row.year });
      }
      mainMatched++;
    }
    for (const row of categoryRows) {
      const ids = byName.get(normalizeUniversityName(row.name));
      if (!ids) {
        unmatchedCategory++;
        if (unmatchedCategoryNames.length < 20) unmatchedCategoryNames.push(row.name);
        continue;
      }
      const patch: Record<string, unknown> = {
        softCategory: row.category, softCategoryRank: row.rank,
      };
      // 高职分类子榜带 list 标记,顺手把 softRankList='高职' 也写上,
      // 让纯在分类子榜出现、不在高职总榜的 uni 也能匹配 buildBoardWhere 的
      // softRankList='高职' filter
      if (row.list) patch.softRankList = row.list;
      for (const id of ids) {
        addUpdate(id, patch);
      }
      categoryMatched++;
    }

    console.log(JSON.stringify({
      file, dryRun,
      mainRows: mainRows.length, categoryRows: categoryRows.length,
      mainMatched, categoryMatched,
      unmatchedMainRows: unmatched, unmatchedCategoryRows: unmatchedCategory,
      unmatchedMainNames, unmatchedCategoryNames,
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
