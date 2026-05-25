/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "05_招生章程" 到 universities.charterInfo (JSON)。
 * 14 个章程字段打包成对象存储。默认 NULL-safe（charterInfo 非空时跳过）。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '05_招生章程';

const CHARTER_FIELDS = [
  '是否有章程', '章程字数', '调档比例', '专业分配规则', '同分规则',
  '外语要求', '单科要求', '体检限制', '加分政策', '学费',
  '转专业限制', '服从调剂', '来源网址', '采集时间',
];

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

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
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
  const idx = colIndexes(sheet);
  const nameCol = idx.get('规范化名');
  if (!nameCol) throw new Error('sheet 缺少必要列 "规范化名"');

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const matcher = await UniversityMatcher.fromDb(prisma);
    let parsed = 0;
    const updates: Array<{ id: number; data: { charterInfo: Record<string, string> } }> = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = toText(row.getCell(nameCol).value).trim();
      if (!name) continue;
      parsed++;
      const charterInfo: Record<string, string> = {};
      for (const field of CHARTER_FIELDS) {
        const c = idx.get(field);
        if (!c) continue;
        const v = toText(row.getCell(c).value).trim();
        if (v && v !== 'NaN') charterInfo[field] = v;
      }
      if (Object.keys(charterInfo).length === 0) continue;
      const ids = matcher.matchByName(name);
      if (!ids) continue;
      for (const id of ids) updates.push({ id, data: { charterInfo } });
    }

    if (!overwrite) {
      const uniqIds = Array.from(new Set(updates.map((u) => u.id)));
      const current = await prisma.university.findMany({
        where: { id: { in: uniqIds } },
        select: { id: true, charterInfo: true },
      });
      const filledIds = new Set(current.filter((c) => c.charterInfo != null).map((c) => c.id));
      for (let i = updates.length - 1; i >= 0; i--) {
        if (filledIds.has(updates[i].id)) updates.splice(i, 1);
      }
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: parsed,
      universitiesToUpdate: updates.length,
      unmatched: report.totalUnmatched,
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
