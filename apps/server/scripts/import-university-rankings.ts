/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "03_历年排名" 到 universities 表
 * (rankingAlumni/rankingQS/rankingUSNews/rankingTimes). 每院校每榜单只存最新年。
 * 软科已由 import-soft-rankings 处理,本脚本跳过。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '03_历年排名';

const BOARD_TO_FIELD: Record<string, string> = {
  '校友会': 'rankingAlumni',
  'QS': 'rankingQS',
  'U.S.News': 'rankingUSNews',
  '泰晤士': 'rankingTimes',
};

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

interface RankRow { name: string; year: number; board: string; rank: number; }

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): RankRow[] {
  const idx = colIndexes(sheet);
  const nameCol = idx.get('规范化名');
  const yearCol = idx.get('年份');
  const boardCol = idx.get('榜单');
  const rankCol = idx.get('排名') ?? idx.get('排名数值');
  if (!nameCol || !yearCol || !boardCol || !rankCol) {
    throw new Error('sheet 缺少必要列 (规范化名/年份/榜单/排名)');
  }
  const rows: RankRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(row.getCell(nameCol).value).trim();
    const year = toInt(row.getCell(yearCol).value);
    const board = toText(row.getCell(boardCol).value).trim();
    const rank = toInt(row.getCell(rankCol).value);
    if (!name || year == null || !board || rank == null) continue;
    if (!BOARD_TO_FIELD[board]) continue;
    rows.push({ name, year, board, rank });
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
  console.log(`xlsx 解析：${SHEET_NAME} ${rows.length} 行（已过滤为 4 个非软科榜单）`);

  // 按 (name, board) 取最新年
  const latestByKey = new Map<string, RankRow>();
  for (const row of rows) {
    const key = `${row.name}|${row.board}`;
    const cur = latestByKey.get(key);
    if (!cur || row.year > cur.year) latestByKey.set(key, row);
  }
  console.log(`按 (院校, 榜单) 取最新年: ${latestByKey.size} 条`);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const matcher = await UniversityMatcher.fromDb(prisma);
    const updatesByUni = new Map<number, Record<string, unknown>>();

    for (const row of latestByKey.values()) {
      const ids = matcher.matchByName(row.name);
      if (!ids) continue;
      const field = BOARD_TO_FIELD[row.board];
      for (const id of ids) {
        const cur = updatesByUni.get(id) ?? {};
        cur[field] = row.rank;
        updatesByUni.set(id, cur);
      }
    }

    if (!overwrite) {
      // NULL-safe: 读当前值，跳过已非空的字段
      const ids = Array.from(updatesByUni.keys());
      const current = await prisma.university.findMany({
        where: { id: { in: ids } },
        select: { id: true, rankingAlumni: true, rankingQS: true, rankingUSNews: true, rankingTimes: true },
      });
      const currentMap = new Map(current.map((u) => [u.id, u]));
      for (const [id, patch] of updatesByUni) {
        const c = currentMap.get(id);
        if (!c) continue;
        for (const field of Object.keys(patch)) {
          if ((c as any)[field] != null) delete patch[field];
        }
        if (Object.keys(patch).length === 0) updatesByUni.delete(id);
      }
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalLatestRows: latestByKey.size,
      universitiesToUpdate: updatesByUni.size,
      unmatched: report.totalUnmatched,
      sampleUnmatched: report.sampleNames.slice(0, 10),
    }, null, 2));

    if (dryRun) return;
    let done = 0;
    for (const [id, data] of updatesByUni) {
      await prisma.university.update({ where: { id }, data });
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${updatesByUni.size}`);
    }
    console.log(`完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
