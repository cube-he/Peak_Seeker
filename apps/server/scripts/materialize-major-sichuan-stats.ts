/**
 * 四川招录统计物化脚本
 * 把 enrollment_plans / admission_records 的在川聚合结果写回 majors 的 sc_* 列,
 * 供专业库列表页直接展示 (在川计划规模 + 物理/历史最低分位次带), 避免列表查询实时聚合。
 *
 * 用法 (服务器 apps/server 目录下执行):
 *   cd apps/server && npx ts-node scripts/materialize-major-sichuan-stats.ts
 *
 * 幂等: 每次先清空全部 sc_* 列再按当前数据全量重算。
 * 年度口径: 计划取 enrollment_plans 在川最大年份; 分数取 admission_records 在川有分数据的最大年份。
 * 聚合走 majorId 外键 (本/专科同名专业各自独立行, 不会跨层次串数据)。
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Load .env from server directory if DATABASE_URL not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../.env');
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

async function main() {
  console.log('四川招录统计物化 → majors.sc_*');

  // 1. 清空旧值 (幂等)
  const reset = await prisma.$executeRawUnsafe(`
    UPDATE majors SET
      sc_plan_count=NULL, sc_plan_unis=NULL, sc_plan_year=NULL, sc_batches=NULL,
      sc_score_year=NULL,
      sc_phy_score_lo=NULL, sc_phy_score_hi=NULL, sc_phy_rank_lo=NULL, sc_phy_rank_hi=NULL,
      sc_his_score_lo=NULL, sc_his_score_hi=NULL, sc_his_rank_lo=NULL, sc_his_rank_hi=NULL
  `);
  console.log(`重置: ${reset} 行`);

  // 2. 最新计划年
  const planYearRow: any[] = await prisma.$queryRawUnsafe(
    `SELECT MAX(year) AS y FROM enrollment_plans WHERE province='四川'`,
  );
  const planYear = Number(planYearRow[0]?.y);
  if (!planYear) {
    console.error('未找到四川招生计划数据, 中止');
    process.exit(1);
  }

  // 3. 计划聚合写回 (人数总和 / 院校数 / 批次集合)
  const planUpdated = await prisma.$executeRawUnsafe(`
    UPDATE majors m
    JOIN (
      SELECT major_id,
             SUM(COALESCE(plan_count, 0)) AS cnt,
             COUNT(DISTINCT university_id) AS unis,
             GROUP_CONCAT(DISTINCT batch ORDER BY batch SEPARATOR '、') AS batches
      FROM enrollment_plans
      WHERE province='四川' AND year=${planYear}
      GROUP BY major_id
    ) s ON s.major_id = m.id
    SET m.sc_plan_count = s.cnt,
        m.sc_plan_unis  = s.unis,
        m.sc_plan_year  = ${planYear},
        m.sc_batches    = LEFT(s.batches, 300)
  `);
  console.log(`计划聚合 (${planYear}): ${planUpdated} 个专业`);

  // 4. 最新有分录取年
  const scoreYearRow: any[] = await prisma.$queryRawUnsafe(
    `SELECT MAX(year) AS y FROM admission_records
     WHERE province='四川' AND (major_min_score IS NOT NULL OR major_min_rank IS NOT NULL)`,
  );
  const scoreYear = Number(scoreYearRow[0]?.y);

  // 5. 分/位次带聚合写回 (跨院校 MIN~MAX, 物理/历史分列)
  if (scoreYear) {
    const scoreUpdated = await prisma.$executeRawUnsafe(`
      UPDATE majors m
      JOIN (
        SELECT major_id,
          MIN(CASE WHEN subjects='物理' THEN major_min_score END) AS phy_lo,
          MAX(CASE WHEN subjects='物理' THEN major_min_score END) AS phy_hi,
          MIN(CASE WHEN subjects='物理' THEN major_min_rank END)  AS phy_rlo,
          MAX(CASE WHEN subjects='物理' THEN major_min_rank END)  AS phy_rhi,
          MIN(CASE WHEN subjects='历史' THEN major_min_score END) AS his_lo,
          MAX(CASE WHEN subjects='历史' THEN major_min_score END) AS his_hi,
          MIN(CASE WHEN subjects='历史' THEN major_min_rank END)  AS his_rlo,
          MAX(CASE WHEN subjects='历史' THEN major_min_rank END)  AS his_rhi
        FROM admission_records
        WHERE province='四川' AND year=${scoreYear}
          AND (major_min_score IS NOT NULL OR major_min_rank IS NOT NULL)
        GROUP BY major_id
      ) s ON s.major_id = m.id
      SET m.sc_score_year   = ${scoreYear},
          m.sc_phy_score_lo = s.phy_lo, m.sc_phy_score_hi = s.phy_hi,
          m.sc_phy_rank_lo  = s.phy_rlo, m.sc_phy_rank_hi = s.phy_rhi,
          m.sc_his_score_lo = s.his_lo, m.sc_his_score_hi = s.his_hi,
          m.sc_his_rank_lo  = s.his_rlo, m.sc_his_rank_hi = s.his_rhi
    `);
    console.log(`分带聚合 (${scoreYear}): ${scoreUpdated} 个专业`);
  } else {
    console.log('未找到四川录取分数据, 跳过分带');
  }

  // 6. 覆盖率报告 + 层次串数据 sanity check
  const cov: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) AS total,
      SUM(sc_plan_count IS NOT NULL) AS with_plan,
      SUM(sc_phy_score_lo IS NOT NULL OR sc_his_score_lo IS NOT NULL) AS with_band
    FROM majors
  `);
  console.log(`覆盖率: 共 ${cov[0].total} 专业, 有在川计划 ${cov[0].with_plan}, 有分带 ${cov[0].with_band}`);

  const cross: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT ep.major_id) AS n
    FROM enrollment_plans ep JOIN majors m ON m.id = ep.major_id
    WHERE ep.province='四川' AND ep.year=${planYear}
      AND ((m.major_level='专科' AND ep.batch LIKE '本科%') OR (m.major_level='本科' AND ep.batch LIKE '高职%'))
  `);
  if (Number(cross[0].n) > 0) {
    console.warn(`⚠️ 层次疑似串挂: ${cross[0].n} 个专业的计划批次与专业层次不符, 建议人工核查`);
  } else {
    console.log('层次一致性检查通过 ✓');
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
