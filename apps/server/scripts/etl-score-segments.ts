/**
 * 一次性 ETL：把 data/03_专家版主表/output/一分一段表_四川_2022-2025.xlsx
 * 导入 score_segments 表。幂等可重跑。
 *
 * 用法：cd apps/server && pnpm ts-node scripts/etl-score-segments.ts [xlsx_path]
 */
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const DEFAULT_XLSX = path.resolve(
  __dirname,
  '../../../data/03_专家版主表/output/一分一段表_四川_2022-2025.xlsx',
);

interface Row {
  year: number;
  examType: string;
  score: number;
  count: number;
  cumulativeCount: number;
}

async function readRows(xlsxPath: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`空表: ${xlsxPath}`);

  // 期望列：ID/省份代码/年份/科类/本专类型/最高分/最低分/同分人数/最高位次/最低位次/...
  const headerRow = ws.getRow(1).values as (string | undefined)[];
  const idx = (name: string) => headerRow.findIndex((v) => v === name);
  const yearIdx = idx('年份');
  const typeIdx = idx('科类');
  const minScoreIdx = idx('最低分');
  const countIdx = idx('同分人数');
  const minRankIdx = idx('最低位次');

  if ([yearIdx, typeIdx, minScoreIdx, countIdx, minRankIdx].some((i) => i < 0)) {
    throw new Error(`列名缺失，实际表头: ${headerRow.join(',')}`);
  }

  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return; // skip header
    const v = row.values as any[];
    rows.push({
      year: Number(v[yearIdx]),
      examType: String(v[typeIdx]).trim(),
      score: Number(v[minScoreIdx]),
      count: Number(v[countIdx]),
      cumulativeCount: Number(v[minRankIdx]),
    });
  });
  return rows.filter((r) => Number.isFinite(r.score) && Number.isFinite(r.cumulativeCount));
}

async function main() {
  const xlsx = process.argv[2] || DEFAULT_XLSX;
  console.log(`[ETL] 读取 ${xlsx}`);
  const rows = await readRows(xlsx);
  console.log(`[ETL] 解析到 ${rows.length} 行`);
  console.log(`[ETL] 样本前 3 行:`, rows.slice(0, 3));

  const prisma = new PrismaClient();
  let upserted = 0;
  for (const r of rows) {
    await prisma.scoreSegment.upsert({
      where: {
        year_province_examType_score: {
          year: r.year,
          province: '四川',
          examType: r.examType,
          score: r.score,
        },
      },
      create: {
        year: r.year,
        province: '四川',
        examType: r.examType,
        score: r.score,
        count: r.count,
        cumulativeCount: r.cumulativeCount,
      },
      update: {
        count: r.count,
        cumulativeCount: r.cumulativeCount,
      },
    });
    upserted++;
    if (upserted % 500 === 0) console.log(`  upserted ${upserted}/${rows.length}`);
  }
  await prisma.$disconnect();
  console.log(`[ETL] 完成: ${upserted} 行`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
