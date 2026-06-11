/**
 * 专业热度 TOP50 导入脚本
 * 数据源: 2025 年本科热度 TOP50 专业榜（用户提供）
 * 见 docs/superpowers/specs/2026-06-07-major-popularity-top50-design.md
 *
 * 用法:
 *   npx ts-node scripts/import-major-popularity.ts          # 写入
 *   npx ts-node scripts/import-major-popularity.ts --dry    # 干跑, 只报告命中不写库
 *
 * 幂等: 先把所有 popularityYear=2025 的旧标记清空, 再写当前 50 条。
 * 匹配: 按专业 name + level='本科' updateMany。
 *   ⚠️ 必须限定 level: 榜单是本科热度榜, 而 75 个专业名本/专科目录同名
 *   (中医学/临床医学/电子商务等), 不限定会把热度错挂到专科行 (2026-06-11 修复)。
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Load .env from server directory if DATABASE_URL not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../apps/server/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}
const adapter = new PrismaMariaDb(DATABASE_URL);
const prisma = new PrismaClient({ adapter } as any);

const YEAR = 2025;
const DRY = process.argv.includes('--dry');

// [排名, 专业名, 热度(万)]  热度入库 = 万 * 10000
const TOP50: Array<[number, string, number]> = [
  [1, '电气工程及其自动化', 8.2],
  [2, '数字媒体技术', 7.0],
  [3, '口腔医学', 6.2],
  [4, '动物医学', 6.2],
  [5, '电子商务', 6.1],
  [6, '人工智能', 5.8],
  [7, '临床医学', 5.7],
  [8, '自动化', 5.0],
  [9, '机械设计制造及其自动化', 4.7],
  [10, '国际经济与贸易', 4.6],
  [11, '电子信息工程', 3.7],
  [12, '药学', 3.3],
  [13, '计算机科学与技术', 3.3],
  [14, '中医学', 3.0],
  [15, '护理学', 2.9],
  [16, '工业设计', 2.8],
  [17, '工程造价', 2.7],
  [18, '市场营销', 2.7],
  [19, '医学检验技术', 2.7],
  [20, '社会工作', 2.6],
  [21, '工商管理', 2.4],
  [22, '人力资源管理', 2.3],
  [23, '医学影像技术', 2.3],
  [24, '预防医学', 2.3],
  [25, '法学', 2.2],
  [26, '软件工程', 2.2],
  [27, '数据科学与大数据技术', 2.2],
  [28, '信息管理与信息系统', 2.1],
  [29, '行政管理', 2.1],
  [30, '能源与动力工程', 2.0],
  [31, '通信工程', 2.0],
  [32, '生物医学工程', 1.9],
  [33, '食品质量与安全', 1.9],
  [34, '中药学', 1.9],
  [35, '城乡规划', 1.9],
  [36, '汉语言文学', 1.9],
  [37, '旅游管理', 1.9],
  [38, '跨境电子商务', 1.8],
  [39, '数字经济', 1.8],
  [40, '学前教育', 1.8],
  [41, '智能制造工程', 1.8],
  [42, '知识产权', 1.7],
  [43, '机械电子工程', 1.7],
  [44, '视觉传达设计', 1.7],
  [45, '会计学', 1.7],
  [46, '材料科学与工程', 1.6],
  [47, '生物工程', 1.6],
  [48, '光电信息科学与工程', 1.6],
  [49, '食品科学与工程', 1.6],
  [50, '小学教育', 1.6],
];

async function main() {
  console.log(`专业热度 TOP50 导入 (${YEAR})  ${DRY ? '[DRY RUN 不写库]' : ''}`);

  if (!DRY) {
    // 幂等: 清空旧的本年度标记, 再写当前榜单
    const reset = await prisma.major.updateMany({
      where: { popularityYear: YEAR },
      data: { popularityRank: null, popularityHeat: null, popularityYear: null },
    });
    console.log(`重置旧标记: ${reset.count} 行`);
  }

  let matchedRows = 0;
  const unmatched: string[] = [];

  for (const [rank, name, wan] of TOP50) {
    const heat = Math.round(wan * 10000);
    if (DRY) {
      const cnt = await prisma.major.count({ where: { name, level: '本科' } });
      if (cnt === 0) unmatched.push(name);
      else matchedRows += cnt;
      continue;
    }
    const res = await prisma.major.updateMany({
      where: { name, level: '本科' },
      data: { popularityRank: rank, popularityHeat: heat, popularityYear: YEAR },
    });
    if (res.count === 0) unmatched.push(name);
    else matchedRows += res.count;
  }

  console.log(`\n命中专业: ${50 - unmatched.length}/50  (更新 ${matchedRows} 行, 含同名多 code)`);
  if (unmatched.length > 0) {
    console.log(`未命中 ${unmatched.length} 个: ${unmatched.join('、')}`);
  } else {
    console.log('全部 50 个专业名精确命中 ✓');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
