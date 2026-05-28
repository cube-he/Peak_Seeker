/**
 * 回填 student_admission_results.admitted_uni_id (按 admitted_uni_name 找 universities).
 *
 * 用法 (在服务器跑):
 *   cd apps/server && npx ts-node -r dotenv/config scripts/backfill-admitted-uni-id.ts
 *
 * 默认 dry-run, 加 --apply 真实更新.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log('====== backfill admitted_uni_id ======');
  console.log(`Mode: ${apply ? '✅ APPLY' : '🟡 DRY-RUN'}`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter } as any);

  const results = await prisma.studentAdmissionResult.findMany({
    where: { admittedUniId: null },
    select: { id: true, admittedUniName: true },
  });
  console.log(`找到 ${results.length} 条未关联 universityId 的录取记录`);

  let matched = 0;
  let failed = 0;
  for (const r of results) {
    // 用 exact name 匹配; 失败回退到 name LIKE %name% (universities 表 name 字段)
    let uni = await prisma.university.findFirst({
      where: { name: r.admittedUniName },
      select: { id: true, name: true },
    });
    if (!uni) {
      uni = await prisma.university.findFirst({
        where: { name: { contains: r.admittedUniName } },
        select: { id: true, name: true },
      });
    }
    if (!uni) {
      console.log(`  ❌ 未找到: "${r.admittedUniName}" (admission id=${r.id})`);
      failed++;
      continue;
    }
    console.log(`  ✅ 匹配: "${r.admittedUniName}" → university id=${uni.id} "${uni.name}"`);
    matched++;
    if (apply) {
      await prisma.studentAdmissionResult.update({
        where: { id: r.id },
        data: { admittedUniId: uni.id },
      });
    }
  }

  console.log(`\n完成: 匹配 ${matched}, 未匹配 ${failed} (共 ${results.length})`);
  if (!apply) console.log('🟡 dry-run, 加 --apply 写入');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 失败:', e);
  process.exit(1);
});
