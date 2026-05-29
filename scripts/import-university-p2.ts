/**
 * P2 院校增强数据导入
 *
 * 来源: data/03_专家版主表/output/院校全量数据_多Sheet.xlsx
 *   - 03_历年排名 (4293 行) -> university_rankings 新表
 *   - 04_院校满意度 (3835 行) -> universities 新列 (satisfaction_distribution + 6 个网络满意度字段)
 *
 * 匹配: 用「规范化名」精确匹配 University.name
 *
 * 用法:
 *   EXCEL_PATH=... DATABASE_URL=... npx tsx scripts/import-university-p2.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// === env 加载 ===
if (!process.env.DATABASE_URL) {
  const candidates = [
    path.resolve(__dirname, '../apps/server/.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
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
const adapter = new PrismaMariaDb(DATABASE_URL);
const prisma = new PrismaClient({ adapter } as any);

const EXCEL_PATH = process.env.EXCEL_PATH
  ? path.resolve(process.env.EXCEL_PATH)
  : path.resolve(__dirname, '../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx');

// ==================== 工具 ====================

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

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

type RowDict = Record<string, unknown>;

function readSheet(sheetName: string): RowDict[] {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet 不存在: ${sheetName}`);
  return XLSX.utils.sheet_to_json<RowDict>(ws, { defval: null });
}

// ==================== Phase A: 满意度分布 ====================

async function importSatisfactionDistribution() {
  console.log('\n[A] 读取 04_院校满意度 ...');
  const rows = readSheet('04_院校满意度');
  console.log(`  共 ${rows.length} 行`);

  let updated = 0;
  let notFound = 0;
  for (const row of rows) {
    const name = toStr(row['规范化名']);
    if (!name) continue;

    // 1-5 星人数对象（任一为空则置 null）
    const dist = {
      overall: {
        count: toInt(row['综合评价人数']),
        1: toInt(row['综合1星人数']),
        2: toInt(row['综合2星人数']),
        3: toInt(row['综合3星人数']),
        4: toInt(row['综合4星人数']),
        5: toInt(row['综合5星人数']),
      },
      life: {
        count: toInt(row['生活评价人数']),
        1: toInt(row['生活1星人数']),
        2: toInt(row['生活2星人数']),
        3: toInt(row['生活3星人数']),
        4: toInt(row['生活4星人数']),
        5: toInt(row['生活5星人数']),
      },
      environ: {
        count: toInt(row['环境评价人数']),
        1: toInt(row['环境1星人数']),
        2: toInt(row['环境2星人数']),
        3: toInt(row['环境3星人数']),
        4: toInt(row['环境4星人数']),
        5: toInt(row['环境5星人数']),
      },
    };

    // 仅当至少一个维度有数据时才写
    const hasAny =
      Object.values(dist.overall).some((v) => v != null) ||
      Object.values(dist.life).some((v) => v != null) ||
      Object.values(dist.environ).some((v) => v != null);

    // 现场满意度总分（04 表的综合/生活/环境满意度列）；仅在有值时覆盖，避免抹掉旧数据
    const overallScore = toFloat(row['综合满意度']);
    const lifeScore = toFloat(row['生活满意度']);
    const environScore = toFloat(row['环境满意度']);
    const overallCount = toInt(row['综合评价人数']);

    const result = await prisma.university.updateMany({
      where: { name },
      data: {
        ...(hasAny && { satisfactionDistribution: dist as any }),
        ...(overallScore != null && { satisfactionOverall: overallScore }),
        ...(lifeScore != null && { satisfactionLife: lifeScore }),
        ...(environScore != null && { satisfactionEnviron: environScore }),
        ...(overallCount != null && { satisfactionCount: overallCount }),
        satisfactionOnlineOverall: toFloat(row['网络综合满意度']),
        satisfactionOnlineOverallCount: toInt(row['网络综合评价人数']),
        satisfactionOnlineLife: toFloat(row['网络生活满意度']),
        satisfactionOnlineLifeCount: toInt(row['网络生活评价人数']),
        satisfactionOnlineEnviron: toFloat(row['网络环境满意度']),
        satisfactionOnlineEnvironCount: toInt(row['网络环境评价人数']),
      },
    });

    if (result.count > 0) updated += result.count;
    else notFound++;
  }
  console.log(`  Updated ${updated} universities (${notFound} 未匹配)`);
}

// ==================== Phase B: 历年排名 ====================

const DETAIL_SCORE_KEYS: { col: string; key: string }[] = [
  { col: '细分得分_办学层次', key: 'level' },
  { col: '细分得分_学科水平', key: 'discipline' },
  { col: '细分得分_办学资源', key: 'resource' },
  { col: '细分得分_师资规模', key: 'faculty' },
  { col: '细分得分_人才培养', key: 'cultivation' },
  { col: '细分得分_科学研究', key: 'research' },
  { col: '细分得分_服务社会', key: 'service' },
  { col: '细分得分_高端人才', key: 'topTalent' },
  { col: '细分得分_重大成果', key: 'achievements' },
  { col: '细分得分_国际竞争力', key: 'international' },
];

async function importRankings() {
  console.log('\n[B] 读取 03_历年排名 ...');
  const rows = readSheet('03_历年排名');
  console.log(`  共 ${rows.length} 行`);

  // 预先 build name -> universityId 缓存（避免每行查一次）
  const nameSet = new Set<string>();
  for (const row of rows) {
    const n = toStr(row['规范化名']);
    if (n) nameSet.add(n);
  }
  const universities = await prisma.university.findMany({
    where: { name: { in: Array.from(nameSet) } },
    select: { id: true, name: true },
  });
  const nameToId = new Map(universities.map((u) => [u.name, u.id]));
  console.log(`  匹配到 ${nameToId.size} / ${nameSet.size} 院校 ID`);

  // 清空旧排名（保证幂等：每次完整重导，避免重复 unique 冲突遗留）
  await prisma.universityRanking.deleteMany({});
  console.log('  已清空 university_rankings 旧数据');

  let inserted = 0;
  let skipped = 0;
  const batchSize = 200;
  let batch: any[] = [];

  for (const row of rows) {
    const name = toStr(row['规范化名']);
    if (!name) {
      skipped++;
      continue;
    }
    const universityId = nameToId.get(name);
    if (!universityId) {
      skipped++;
      continue;
    }

    const year = toInt(row['年份']);
    const listName = toStr(row['榜单']);
    const category = toStr(row['类别']) ?? '总榜';
    if (year == null || !listName) {
      skipped++;
      continue;
    }

    const detailed: Record<string, number> = {};
    for (const { col, key } of DETAIL_SCORE_KEYS) {
      const v = toFloat(row[col]);
      if (v != null) detailed[key] = v;
    }

    batch.push({
      universityId,
      year,
      listName,
      category,
      rankValue: toInt(row['排名数值']),
      rankText: toStr(row['排名']),
      worldRank: toStr(row['世界排名']),
      nationalRefRank: toInt(row['全国参考排名']),
      score: toFloat(row['得分']),
      detailedScores: Object.keys(detailed).length > 0 ? (detailed as any) : null,
    });

    if (batch.length >= batchSize) {
      const r = await prisma.universityRanking.createMany({ data: batch, skipDuplicates: true });
      inserted += r.count;
      batch = [];
    }
  }
  if (batch.length > 0) {
    const r = await prisma.universityRanking.createMany({ data: batch, skipDuplicates: true });
    inserted += r.count;
  }

  console.log(`  Inserted ${inserted} ranking rows (skipped ${skipped})`);
}

// ==================== 主流程 ====================

async function main() {
  console.log('=== P2 院校增强数据导入 ===');
  console.log(`Excel: ${EXCEL_PATH}`);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`Excel 文件不存在: ${EXCEL_PATH}`);
    process.exit(1);
  }

  await importSatisfactionDistribution();
  await importRankings();

  console.log('\n=== Import Complete ===');
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
