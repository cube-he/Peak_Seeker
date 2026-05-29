/**
 * 用国标专业目录补全线上 majors 表
 *
 * 背景: 专业库应以 01_专业字典(国标专业目录,1901 个)为主体,招生数据为辅。
 *       线上 majors 表是「四川招生专业项」,缺了大量国标专业(尤其 2026 新增 38 个,
 *       四川还没招生)。本脚本把 01_专业字典 里 majors 表没有的专业补进去。
 *
 * 补进来的专业带专业目录信息(代码/名称/门类/增设年份/介绍字段);
 * 它们没有招生计划关联——招生数据为辅,有则显示、无则空。
 *
 * 用法:
 *   dry-run(只统计):  EXCEL_PATH=... npx tsx scripts/backfill-catalog-majors.ts
 *   真插入:           APPLY=1 EXCEL_PATH=... npx tsx scripts/backfill-catalog-majors.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

if (!process.env.DATABASE_URL) {
  for (const envPath of [
    path.resolve(__dirname, '../apps/server/.env'),
    path.resolve(__dirname, '../.env'),
  ]) {
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
      break;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL 未设置');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(DATABASE_URL) } as any);

const EXCEL = process.env.EXCEL_PATH
  ? path.resolve(process.env.EXCEL_PATH)
  : path.resolve(__dirname, '../data/03_专家版主表/output/专业全量数据_多Sheet.xlsx');
const APPLY = process.env.APPLY === '1';

// 01_专业字典 层次 -> majors 表 level（专业库筛选只有 本科/专科）
const LEVEL_MAP: Record<string, string> = {
  本科: '本科',
  高职本科: '本科',
  高职: '专科',
};

function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}
function splitList(v: unknown): string[] | null {
  const s = toStr(v);
  if (!s) return null;
  const arr = s.split(/[；;、,，]/).map((x) => x.trim()).filter(Boolean);
  return arr.length > 0 ? arr : null;
}

function readSheet(name: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet 不存在: ${name}`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

async function main() {
  console.log('=== 补全 majors 表的国标专业 ===');
  console.log(`Excel: ${EXCEL} | 模式: ${APPLY ? '真插入' : 'dry-run'}`);

  const rows = readSheet('01_专业字典').filter((r) => toStr(r['专业名称']));
  console.log(`\n01_专业字典: ${rows.length} 个专业`);

  const existing = await prisma.major.findMany({ select: { name: true } });
  const existNames = new Set(existing.map((m) => m.name));
  console.log(`majors 表: ${existing.length} 行, ${existNames.size} 个不同名称`);

  const missing = rows.filter((r) => !existNames.has(String(r['专业名称']).trim()));
  console.log(`\n缺失待补: ${missing.length} 个`);

  const byLevel: Record<string, number> = {};
  let new2026 = 0;
  for (const r of missing) {
    const lv = String(r['层次'] ?? '空');
    byLevel[lv] = (byLevel[lv] || 0) + 1;
    if (toInt(r['增设年份']) === 2026) new2026++;
  }
  console.log(`  按层次: ${JSON.stringify(byLevel)}`);
  console.log(`  其中 2026 新增专业: ${new2026} 个`);
  console.log(`  样本: ${missing.slice(0, 12).map((r) => r['专业名称']).join('、')}`);

  if (!APPLY) {
    console.log('\n[dry-run] 未写入。确认无误后用 APPLY=1 重跑。');
    return;
  }

  const data = missing.map((r) => ({
    name: String(r['专业名称']).trim(),
    code: toStr(r['专业代码']),
    category: toStr(r['学科门类']),
    level: LEVEL_MAP[String(r['层次'] ?? '')] ?? toStr(r['层次']),
    discipline: toStr(r['专业类']),
    degree: toStr(r['授予学位']),
    standardDuration: toStr(r['修业年限']),
    setupYear: toInt(r['增设年份']),
    notes: toStr(r['教育部备注']),
    description: toStr(r['专业描述']) ?? toStr(r['专业简介']),
    firstImpression: toStr(r['第一印象']),
    electiveAdvice: toStr(r['选考建议']),
    whatIs: toStr(r['专业是什么']),
    whatStudy: toStr(r['专业学什么']),
    whatDo: toStr(r['专业干什么']),
    employmentProspects: toStr(r['就业去向']),
    trainingObjective: toStr(r['培养目标']),
    trainingRequirements: toStr(r['培养要求']),
    disciplineReq: toStr(r['学科要求']),
    knowledgeAbility: toStr(r['知识能力']),
    internshipDesc: toStr(r['实习']),
    postUpgradeDirection: toStr(r['专升本方向']),
    similarMajors: splitList(r['相近专业']) as any,
    famousPeople: splitList(r['社会名人']) as any,
    professionalCerts: splitList(r['职业资格证书']) as any,
    coreCourses: splitList(r['主要课程']) as any,
    postgraduateDirections: splitList(r['考研方向']) as any,
  }));

  // 分批插入,避免单条 SQL 过大
  let inserted = 0;
  const batch = 100;
  for (let i = 0; i < data.length; i += batch) {
    const r = await prisma.major.createMany({ data: data.slice(i, i + batch) });
    inserted += r.count;
  }
  console.log(`\n已插入 ${inserted} 个专业到 majors 表`);
}

main()
  .catch((e) => {
    console.error('失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
