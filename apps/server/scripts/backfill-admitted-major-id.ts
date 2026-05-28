/**
 * 回填 student_admission_results.admitted_major_id (按 admitted_major_name 找 majors).
 *
 * 用法 (服务器):
 *   cd apps/server && npx ts-node -r dotenv/config scripts/backfill-admitted-major-id.ts --apply
 *
 * 默认 dry-run.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Mode: ${apply ? '✅ APPLY' : '🟡 DRY-RUN'}`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter } as any);

  const records = await prisma.studentAdmissionResult.findMany({
    where: { admittedMajorId: null, admittedMajorName: { not: null } },
    select: { id: true, admittedMajorName: true },
  });
  console.log(`待回填 ${records.length} 条`);

  let matched = 0;
  let failed = 0;
  for (const r of records) {
    if (!r.admittedMajorName) continue;
    // 精确名匹配优先, 失败 fallback to contains
    let major = await prisma.major.findFirst({
      where: { name: r.admittedMajorName },
      select: { id: true, name: true },
    });
    if (!major) {
      major = await prisma.major.findFirst({
        where: { name: { contains: r.admittedMajorName } },
        select: { id: true, name: true },
      });
    }
    if (!major) {
      console.log(`  ❌ 未找到: "${r.admittedMajorName}" (admission id=${r.id})`);
      failed++;
      continue;
    }
    console.log(`  ✅ "${r.admittedMajorName}" → major id=${major.id} "${major.name}"`);
    matched++;
    if (apply) {
      await prisma.studentAdmissionResult.update({
        where: { id: r.id },
        data: { admittedMajorId: major.id },
      });
    }
  }
  console.log(`\n完成: 匹配 ${matched} / 未匹配 ${failed}`);
  if (!apply) console.log('🟡 dry-run, 加 --apply 写入');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 失败:', e);
  process.exit(1);
});
