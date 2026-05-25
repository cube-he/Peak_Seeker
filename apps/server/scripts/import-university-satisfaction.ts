/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "04_院校满意度" 到 universities 表。
 * 默认 NULL-safe（约 87% 已填充）。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '04_院校满意度';

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
function toFloat(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
function toInt(value: unknown): number | null {
  const f = toFloat(value);
  return f == null ? null : Math.round(f);
}

interface SatRow {
  name: string;
  satisfactionOverall: number | null;
  satisfactionCount: number | null;
  satisfactionLife: number | null;
  satisfactionEnviron: number | null;
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): SatRow[] {
  const idx = colIndexes(sheet);
  const get = (row: ExcelJS.Row, col: string) => {
    const c = idx.get(col);
    return c ? row.getCell(c).value : undefined;
  };
  const rows: SatRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(get(row, '规范化名')).trim();
    if (!name) continue;
    rows.push({
      name,
      satisfactionOverall: toFloat(get(row, '综合满意度')),
      satisfactionCount: toInt(get(row, '综合评价人数')),
      satisfactionLife: toFloat(get(row, '生活满意度')),
      satisfactionEnviron: toFloat(get(row, '环境满意度')),
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
      const ids = matcher.matchByName(row.name);
      if (!ids) continue;
      const patch: Record<string, unknown> = {
        satisfactionOverall: row.satisfactionOverall,
        satisfactionCount: row.satisfactionCount,
        satisfactionLife: row.satisfactionLife,
        satisfactionEnviron: row.satisfactionEnviron,
      };
      if (Object.values(patch).every((v) => v == null)) continue;
      for (const id of ids) updates.push({ id, data: patch });
    }

    if (!overwrite) {
      // NULL-safe: 批量读取当前值，只填 NULL 字段，不覆盖已有数据
      const uniqIds = Array.from(new Set(updates.map((u) => u.id)));
      const current = await prisma.university.findMany({
        where: { id: { in: uniqIds } },
        select: { id: true, satisfactionOverall: true, satisfactionCount: true, satisfactionLife: true, satisfactionEnviron: true },
      });
      const currentMap = new Map(current.map((u) => [u.id, u]));
      for (const u of updates) {
        const c = currentMap.get(u.id);
        if (!c) continue;
        for (const field of Object.keys(u.data)) {
          if ((c as any)[field] != null) delete (u.data as any)[field];
        }
      }
    }
    const effectiveUpdates = updates.filter((u) => Object.keys(u.data).length > 0);

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: rows.length,
      universitiesToUpdate: effectiveUpdates.length,
      unmatched: report.totalUnmatched,
      sampleUnmatched: report.sampleNames.slice(0, 10),
    }, null, 2));

    if (dryRun) return;
    let done = 0;
    for (const u of effectiveUpdates) {
      await prisma.university.update({ where: { id: u.id }, data: u.data });
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${effectiveUpdates.length}`);
    }
    console.log(`完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
