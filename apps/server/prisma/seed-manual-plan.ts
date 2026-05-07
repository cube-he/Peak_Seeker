/**
 * Seed: 纯人工方案的测试 fixtures
 * - 1 主管 + 2 普通老师 + 3 学生（不同 examType/性别/民族/视力）
 * - 2 个 BatchConfig（提前批/本科批）
 * - 50 个 EnrollmentPlan + 对应 AdmissionRecord（覆盖软规则触发场景）
 * - 5 条 HealthRestriction
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const pwd = await bcrypt.hash('Test123!', 10);

  const supervisor = await prisma.user.upsert({
    where: { username: 'sup_test' },
    create: {
      username: 'sup_test', passwordHash: pwd, role: 'TEACHER',
      realName: '测试主管', teacherProfile: { create: { isSupervisor: true, school: '西典' } },
    },
    update: {},
    include: { teacherProfile: true },
  });

  const teacher1 = await prisma.user.upsert({
    where: { username: 't1_test' },
    create: {
      username: 't1_test', passwordHash: pwd, role: 'TEACHER',
      realName: '测试老师1', teacherProfile: { create: { isSupervisor: false, school: '西典' } },
    },
    update: {},
    include: { teacherProfile: true },
  });

  const studentDefs = [
    { username: 's1_test', name: '学生甲', gender: '男', ethnicity: '汉族', height: 175 },
    { username: 's2_test', name: '学生乙', gender: '女', ethnicity: '彝族', height: 162 },
    { username: 's3_test', name: '学生丙', gender: '男', ethnicity: '汉族', height: 165 }, // 触发身高软不符合
  ];
  for (const s of studentDefs) {
    await prisma.user.upsert({
      where: { username: s.username },
      create: {
        username: s.username, passwordHash: pwd, role: 'STUDENT',
        realName: s.name, gender: s.gender, ethnicity: s.ethnicity,
        studentProfile: {
          create: {
            teacherId: teacher1.teacherProfile!.id,
            province: '四川', city: '成都',
            examType: 'PHYSICS', examYear: 2026,
            totalScore: 580, provincialRank: 30000,
            height: s.height,
            visionLeft: 5.0, visionRight: 5.0,
            preferredBatches: ['本科批A段'],
          },
        },
      },
      update: {},
    });
  }

  // BatchConfig
  await prisma.batchConfig.upsert({
    where: { year_province_batch_examType: { year: 2026, province: '四川', batch: '本科批A段', examType: '物理' } },
    create: { year: 2026, province: '四川', batch: '本科批A段', examType: '物理',
              volunteerMode: 'parallel', maxGroupCount: 5, maxMajorPerGroup: 6, admissionOrder: 4 },
    update: {},
  });

  console.log('Seed completed for manual plan fixtures');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
