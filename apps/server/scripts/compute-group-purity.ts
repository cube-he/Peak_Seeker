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
import { GroupPurityService } from '../src/modules/group-purity/group-purity.service';

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
  let nullScoreSkipped = 0;
  const levelStats: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 };

  for (const scope of scopes) {
    console.log(`\n[GroupPurity] 处理 ${scope.year} / ${scope.province}`);

    // 拉 enrollment_plans, 带 groupPurityScore + major 上下文(用于 tooltip 描述字段)
    const eps = await prisma.enrollmentPlan.findMany({
      where: { year: scope.year, province: scope.province },
      select: {
        universityId: true, groupCode: true, batch: true, subjects: true,
        groupPurityScore: true, majorName: true,
        major: { select: { category: true, discipline: true, name: true } },
      },
    });
    console.log(`  共 ${eps.length} 行 EnrollmentPlan`);

    // 按组聚合: score 取组内任一行(已验证组内一致), 描述字段从 majors 统计
    type GroupAgg = {
      year: number; province: string; universityId: number;
      groupCode: string; batch: string; subjects: string;
      score: number | null;
      majors: { name: string; category: string | null; discipline: string | null }[];
    };
    const groups = new Map<string, GroupAgg>();
    for (const ep of eps) {
      const key = `${ep.universityId}|${ep.groupCode}|${ep.batch}|${ep.subjects}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          year: scope.year, province: scope.province,
          universityId: ep.universityId, groupCode: ep.groupCode,
          batch: ep.batch, subjects: ep.subjects,
          score: ep.groupPurityScore ?? null, majors: [],
        };
        groups.set(key, g);
      } else if (g.score === null && ep.groupPurityScore !== null) {
        g.score = ep.groupPurityScore;
      }
      g.majors.push({
        name: ep.major?.name ?? ep.majorName ?? '',
        category: ep.major?.category ?? null,
        discipline: ep.major?.discipline ?? null,
      });
    }
    console.log(`  聚合得 ${groups.size} 个专业组`);
    totalGroups += groups.size;

    for (const g of groups.values()) {
      // 无分数 → 跳过(历史年若无专家版数据, 不写记录;现有历史 group_purities 不删)
      if (g.score === null) {
        nullScoreSkipped++;
        continue;
      }
      const level = GroupPurityService.bandFromScore(g.score);
      if (!level) {
        nullScoreSkipped++;
        continue;
      }

      // 描述字段(tooltip 用): 主导专业类/门类/N
      const catCount = new Map<string, number>();
      const discCount = new Map<string, number>();
      const foreignFlags = g.majors.map((m) => /中外合作|合作办学|国际合作|中外合资/.test(m.name));
      for (const m of g.majors) {
        if (m.category) catCount.set(m.category, (catCount.get(m.category) ?? 0) + 1);
        if (m.discipline) discCount.set(m.discipline, (discCount.get(m.discipline) ?? 0) + 1);
      }
      const topOf = (m: Map<string, number>): [string | null, number] => {
        let k: string | null = null, c = 0;
        for (const [kk, vv] of m) if (vv > c) { c = vv; k = kk; }
        return [k, c];
      };
      const [domCat, domCatCnt] = topOf(catCount);
      const [domDisc, domDiscCnt] = topOf(discCount);
      const N = g.majors.length;
      const hasForeign = foreignFlags.some(Boolean);
      const allForeign = foreignFlags.every(Boolean);

      levelStats[level] = (levelStats[level] ?? 0) + 1;

      await prisma.groupPurity.upsert({
        where: {
          group_purity_natural_key: {
            year: g.year, province: g.province, universityId: g.universityId,
            groupCode: g.groupCode, batch: g.batch, subjects: g.subjects,
          },
        },
        create: {
          year: g.year, province: g.province, universityId: g.universityId,
          groupCode: g.groupCode, batch: g.batch, subjects: g.subjects,
          score: g.score, level,
          majorCount: N,
          dominantCategory: domCat,
          dominantCategoryRatio: N > 0 ? domCatCnt / N : 0,
          dominantDiscipline: domDisc,
          dominantDisciplineRatio: N > 0 ? domDiscCnt / N : 0,
          crossCategoryCount: catCount.size,
          hasForeign, mixedForeign: hasForeign && !allForeign,
          reasons: [`专家版分数 ${g.score.toFixed(2)} → ${level}`],
        },
        update: {
          score: g.score, level,
          majorCount: N,
          dominantCategory: domCat,
          dominantCategoryRatio: N > 0 ? domCatCnt / N : 0,
          dominantDiscipline: domDisc,
          dominantDisciplineRatio: N > 0 ? domDiscCnt / N : 0,
          crossCategoryCount: catCount.size,
          hasForeign, mixedForeign: hasForeign && !allForeign,
          reasons: [`专家版分数 ${g.score.toFixed(2)} → ${level}`],
        },
      });
      upserted++;
      if (upserted % 500 === 0) console.log(`  upserted ${upserted}`);
    }
  }

  await prisma.$disconnect();

  console.log(`\n[GroupPurity] 完成`);
  console.log(`  总组数: ${totalGroups}`);
  console.log(`  upserted: ${upserted}`);
  console.log(`  无分数跳过: ${nullScoreSkipped}`);
  for (const lv of ['S', 'A', 'B', 'C']) {
    const n = levelStats[lv] ?? 0;
    const pct = upserted > 0 ? ((n / upserted) * 100).toFixed(1) : '0';
    console.log(`    ${lv}: ${n} (${pct}%)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
