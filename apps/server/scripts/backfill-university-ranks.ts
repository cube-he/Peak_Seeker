/**
 * 回填 University 表的 6 个位次冗余字段（minScore/minRank/predRank × 物理/历史）。
 * 运行时机：AdmissionRecord 导入、RankPrediction 生成之后。
 * 用法（在 apps/server 目录，需配置 DATABASE_URL）：pnpm backfill:ranks
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  aggregateMinScoreRank,
  pickUniversityPredRank,
} from '../src/modules/university/ranking-fields';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const PRED_RECRUIT_TYPES = ['普通类本科', '普通类高职(专科)'];

function pushToGroup<T>(map: Map<string, T[]>, key: string, item: T): void {
  const arr = map.get(key);
  if (arr) arr.push(item);
  else map.set(key, [item]);
}

async function main(): Promise<void> {
  const latestYearRow = await prisma.admissionRecord.findFirst({
    orderBy: { year: 'desc' },
    select: { year: true },
  });
  const latestYear = latestYearRow?.year;
  if (latestYear == null) {
    console.error('无录取数据，终止');
    process.exit(1);
  }

  const targetYearRow = await prisma.rankPrediction.findFirst({
    orderBy: { targetYear: 'desc' },
    select: { targetYear: true },
  });
  const targetYear = targetYearRow?.targetYear ?? null;

  const admissions = await prisma.admissionRecord.findMany({
    where: { year: latestYear },
    select: {
      universityId: true, subjects: true,
      majorMinScore: true, majorMinRank: true,
      groupMinScore: true, groupMinRank: true,
    },
  });

  const predictions = targetYear == null ? [] : await prisma.rankPrediction.findMany({
    where: { targetYear, recruitType: { in: PRED_RECRUIT_TYPES } },
    select: { universityId: true, subjects: true, pointRank: true },
  });

  const admMap = new Map<string, typeof admissions>();
  for (const a of admissions) pushToGroup(admMap, `${a.universityId}:${a.subjects}`, a);

  const predMap = new Map<string, typeof predictions>();
  for (const p of predictions) pushToGroup(predMap, `${p.universityId}:${p.subjects}`, p);

  const universities = await prisma.university.findMany({ select: { id: true } });
  let done = 0;
  for (const u of universities) {
    const phys = aggregateMinScoreRank(admMap.get(`${u.id}:物理`) ?? []);
    const hist = aggregateMinScoreRank(admMap.get(`${u.id}:历史`) ?? []);
    const predPhys = pickUniversityPredRank(predMap.get(`${u.id}:物理`) ?? []);
    const predHist = pickUniversityPredRank(predMap.get(`${u.id}:历史`) ?? []);
    await prisma.university.update({
      where: { id: u.id },
      data: {
        minScorePhysics: phys?.minScore ?? null,
        minRankPhysics: phys?.minRank ?? null,
        minScoreHistory: hist?.minScore ?? null,
        minRankHistory: hist?.minRank ?? null,
        predRankPhysics: predPhys,
        predRankHistory: predHist,
      },
    });
    done += 1;
    if (done % 200 === 0) console.log(`  ${done}/${universities.length}`);
  }
  console.log(`回填完成：${done} 所院校（录取年份 ${latestYear}，预测年份 ${targetYear ?? '无'}）`);
}

main()
  .catch((e) => {
    console.error('回填失败：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
