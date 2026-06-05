/**
 * 全量计算院校专业组客观纯净度。
 *
 * 输入：enrollment_plans 表（按 group_code 聚合）+ majors 表 JOIN
 * 输出：group_purities 表（upsert 幂等）
 *
 * 用法：cd apps/server && pnpm ts-node scripts/compute-group-purity.ts [--year 2025] [--province 四川]
 *       不传参 = 全量所有 (year, province) 组合
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { GroupPurityService, MajorInfo } from '../src/modules/group-purity/group-purity.service';

interface CliArgs {
  year?: number;
  province?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const flag = process.argv[i];
    const val = process.argv[i + 1];
    if (flag === '--year') args.year = Number(val);
    else if (flag === '--province') args.province = val;
  }
  return args;
}

async function main() {
  const cli = parseArgs();
  console.log(`[GroupPurity] CLI args:`, cli);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });
  const service = new GroupPurityService();

  // 1. 找出所有 (year, province) 组合
  const scopes = await prisma.enrollmentPlan.findMany({
    where: {
      ...(cli.year ? { year: cli.year } : {}),
      ...(cli.province ? { province: cli.province } : {}),
    },
    select: { year: true, province: true },
    distinct: ['year', 'province'],
  });
  console.log(`[GroupPurity] 待处理 (year, province) 组合: ${scopes.length}`);
  for (const s of scopes) console.log(`  - ${s.year} / ${s.province}`);

  let totalGroups = 0;
  let upserted = 0;
  const levelStats: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 };

  for (const scope of scopes) {
    console.log(`\n[GroupPurity] 处理 ${scope.year} / ${scope.province}`);

    // 2. 查该 scope 下全部 EnrollmentPlan + 关联 Major
    const eps = await prisma.enrollmentPlan.findMany({
      where: { year: scope.year, province: scope.province },
      select: {
        universityId: true,
        groupCode: true,
        batch: true,
        subjects: true,
        majorName: true,
        major: { select: { category: true, discipline: true, name: true } },
      },
    });
    console.log(`  共 ${eps.length} 行 EnrollmentPlan`);

    // 3. 按 (universityId, groupCode, batch, subjects) 分组
    const groups = new Map<string, { ep: typeof eps[number]; majors: MajorInfo[] }>();
    for (const ep of eps) {
      const key = `${ep.universityId}|${ep.groupCode}|${ep.batch}|${ep.subjects}`;
      if (!groups.has(key)) {
        groups.set(key, { ep, majors: [] });
      }
      groups.get(key)!.majors.push({
        name: ep.major?.name ?? ep.majorName ?? '',
        category: ep.major?.category ?? null,
        discipline: ep.major?.discipline ?? null,
      });
    }
    console.log(`  聚合得 ${groups.size} 个专业组`);
    totalGroups += groups.size;

    // 4. 算 + upsert
    for (const [, { ep, majors }] of groups) {
      const result = service.assess({ majors });
      levelStats[result.level] = (levelStats[result.level] ?? 0) + 1;

      await prisma.groupPurity.upsert({
        where: {
          group_purity_natural_key: {
            year: scope.year,
            province: scope.province,
            universityId: ep.universityId,
            groupCode: ep.groupCode,
            batch: ep.batch,
            subjects: ep.subjects,
          },
        },
        create: {
          year: scope.year,
          province: scope.province,
          universityId: ep.universityId,
          groupCode: ep.groupCode,
          batch: ep.batch,
          subjects: ep.subjects,
          level: result.level,
          majorCount: result.majorCount,
          dominantCategory: result.dominantCategory,
          dominantCategoryRatio: result.dominantCategoryRatio,
          dominantDiscipline: result.dominantDiscipline,
          dominantDisciplineRatio: result.dominantDisciplineRatio,
          crossCategoryCount: result.crossCategoryCount,
          hasForeign: result.hasForeign,
          mixedForeign: result.mixedForeign,
          reasons: result.reasons,
        },
        update: {
          level: result.level,
          majorCount: result.majorCount,
          dominantCategory: result.dominantCategory,
          dominantCategoryRatio: result.dominantCategoryRatio,
          dominantDiscipline: result.dominantDiscipline,
          dominantDisciplineRatio: result.dominantDisciplineRatio,
          crossCategoryCount: result.crossCategoryCount,
          hasForeign: result.hasForeign,
          mixedForeign: result.mixedForeign,
          reasons: result.reasons,
        },
      });
      upserted++;
      if (upserted % 500 === 0) {
        console.log(`  upserted ${upserted}/${totalGroups}`);
      }
    }
  }

  await prisma.$disconnect();

  console.log(`\n[GroupPurity] 完成`);
  console.log(`  总组数：${totalGroups}`);
  console.log(`  upserted：${upserted}`);
  console.log(`  档位分布：`);
  for (const lv of ['S', 'A', 'B', 'C']) {
    const n = levelStats[lv] ?? 0;
    const pct = totalGroups > 0 ? ((n / totalGroups) * 100).toFixed(1) : '0';
    console.log(`    ${lv}: ${n} (${pct}%)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
