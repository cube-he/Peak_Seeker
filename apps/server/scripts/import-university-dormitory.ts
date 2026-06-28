/**
 * 导入 全国重点高校宿舍与设施情况汇总.xlsx (Sheet1) 的 28 个宿舍生活字段到 universities 表。
 * 用法（cd apps/server）：
 *   pnpm import:university-dormitory --file=../../data/03_专家版主表/output/全国重点高校宿舍与设施情况汇总.xlsx --dry-run
 *   pnpm import:university-dormitory --file=... --overwrite
 *
 * file1 只有院校名称没有 code → 按规范化名匹配; 同名命中多个 id 时全部 patch(校级数据)。
 * 默认增量: 只写入源文件非空字段, 绝不把已有数据抹成 NULL; --overwrite 才用源值(含空)强制覆盖。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { UniversityMatcher } from './lib/university-matcher';

// parseArgs 内联(不复用 ./lib/cli-utils): cli-utils 顶部 import 'cli-progress'(devDep),
// 生产 `pnpm install --prod` 不装 devDep → 在服务器上 npx ts-node 跑本脚本会因加载 cli-utils 而崩。
// 内联后本脚本只依赖 exceljs/@prisma(prod 依赖)+ university-matcher(无额外依赖), 生产可直跑。
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) out[k] = v;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

const SHEET_NAME = 'Sheet1';

// [prisma 字段, file1 表头(已剥离 ⭐)]
const FIELD_MAP: Array<[string, string]> = [
  ['multiCampus', '存在多校区'],
  ['loftBed', '上床下桌'],
  ['roomCapacity', '几人间'],
  ['dormAirConditioner', '宿舍空调'],
  ['privateBathroom', '独立卫浴'],
  ['hotWaterSchedule', '洗澡热水时段'],
  ['washingMachine', '洗衣机'],
  ['dormPowerLimit', '宿舍限电瓦数'],
  ['classroomAirConditioner', '教室空调'],
  ['allNightStudyRoom', '通宵自习室'],
  ['nightPowerCut', '夜间断电'],
  ['nightNetworkCut', '夜间断网'],
  ['dormInspection', '查寝情况'],
  ['curfewTime', '晚归门禁时间'],
  ['morningEveningStudy', '早晚自习'],
  ['morningRun', '晨跑要求'],
  ['runningCheckIn', '跑步打卡要求'],
  ['campusNetworkSpeed', '校园网速度'],
  ['campusNetworkPrice', '校园网价格'],
  ['freshmanComputer', '大一带电脑'],
  ['hasSubway', '地铁'],
  ['distanceToCity', '市区距离'],
  ['transportConvenience', '学校交通便利'],
  ['foodDelivery', '点外卖'],
  ['canteenPrice', '食堂价格感受'],
  ['supermarketPrice', '超市价格感受'],
  ['expressDelivery', '收发快递'],
  ['sharedBikes', '共享单车'],
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

function nullIfEmpty(value: unknown): string | null {
  const t = toText(value).trim();
  return t === '' || t === 'NaN' ? null : t;
}

// 列头去 ⭐ 后建索引(file1 有 "⭐存在多校区"/"⭐市区距离")。
function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    idx.set(toText(cell.value).replace(/⭐/g, '').trim(), col);
  });
  return idx;
}

interface DormRow {
  name: string;
  fields: Record<string, string | null>;
}

function parseRows(sheet: ExcelJS.Worksheet): DormRow[] {
  const idx = colIndexes(sheet);
  const nameCol = idx.get('院校名称');
  if (!nameCol) throw new Error('找不到列 "院校名称"');
  const rows: DormRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(row.getCell(nameCol).value).trim();
    if (!name) continue;
    const fields: Record<string, string | null> = {};
    for (const [field, header] of FIELD_MAP) {
      const c = idx.get(header);
      fields[field] = c ? nullIfEmpty(row.getCell(c).value) : null;
    }
    rows.push({ name, fields });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=/path/to/全国重点高校宿舍与设施情况汇总.xlsx');

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
      const patch: Record<string, unknown> = { ...row.fields };
      if (!overwrite) {
        for (const k of Object.keys(patch)) {
          if (patch[k] === null) delete patch[k];
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
      sampleUnmatched: report.sampleNames.slice(0, 20),
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
