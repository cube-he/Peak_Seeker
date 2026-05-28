/**
 * 把录取凭证图片里读出来的专业组号 + 专业代号 + 专业名称写入 student_admission_results.
 *
 * 数据来源: vision 读 apps/server/uploads/historical/<id>/admission_proof_*.jpg 后人工核对.
 * 用法 (服务器):
 *   cd apps/server && npx ts-node -r dotenv/config scripts/fill-admitted-major-from-proof.ts --apply
 *
 * 默认 dry-run.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// 按学生真实姓名匹配 (10 位 25 届学生中只 9 个有凭证, 王寒羽暂缺图待补)
const RECORDS: Array<{
  realName: string;
  groupCode: string;
  majorCode: string;
  majorName: string;
}> = [
  { realName: '胡程亮', groupCode: '103', majorCode: '37', majorName: '汉语言文学' },
  { realName: '杨思哲', groupCode: '101', majorCode: '30', majorName: '无人机应用技术' },
  { realName: '董天奕', groupCode: '102', majorCode: '18', majorName: '汉语言文学' },
  { realName: '梁雅诗', groupCode: '101', majorCode: '3A', majorName: '电子竞技运动与管理' },
  { realName: '马健航', groupCode: '102', majorCode: '1V', majorName: '英语(师范)' },
  { realName: '牟智希', groupCode: '105', majorCode: '05', majorName: '眼视光学' },
  { realName: '张鑫', groupCode: '102', majorCode: '0E', majorName: '电气工程及其自动化' },
  { realName: '周裕卓', groupCode: '101', majorCode: '06', majorName: '康复治疗技术' },
  { realName: '付鑫', groupCode: '101', majorCode: '05', majorName: '小学数学教育' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Mode: ${apply ? '✅ APPLY' : '🟡 DRY-RUN'}`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter } as any);

  let matched = 0;
  let failed = 0;
  for (const r of RECORDS) {
    const student = await prisma.studentProfile.findFirst({
      where: { isArchived: true, user: { realName: r.realName } },
      include: { admissionResult: true, user: true },
    });
    if (!student) {
      console.log(`  ❌ 找不到学生: ${r.realName}`);
      failed++;
      continue;
    }
    if (!student.admissionResult) {
      console.log(`  ❌ ${r.realName} 没 admissionResult`);
      failed++;
      continue;
    }
    console.log(
      `  ✅ ${r.realName} (student id=${student.id}) → 专业组 ${r.groupCode} / [${r.majorCode}] ${r.majorName}`,
    );
    matched++;
    if (apply) {
      await prisma.studentAdmissionResult.update({
        where: { id: student.admissionResult.id },
        data: {
          admittedMajorGroupCode: r.groupCode,
          admittedMajorCode: r.majorCode,
          admittedMajorName: r.majorName,
        },
      });
    }
  }
  console.log(`\n完成: 匹配 ${matched} / 失败 ${failed} (共 ${RECORDS.length})`);
  if (!apply) console.log('🟡 dry-run, 加 --apply 写入');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 失败:', e);
  process.exit(1);
});
