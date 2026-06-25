/**
 * 一次性 migration: 对所有现存 StudentProfile 按新口径 (REQUIRED_FIELDS 单层)
 * 重算 intakeStatus.
 *
 * 保守策略 (只升不降):
 *   - DRAFT / NEEDS_CHANGES + 新口径满足 → SUBMITTED  (告知老师"现在符合最低标准了")
 *   - 其它情况不动 (尤其是 VERIFIED, 不主动退回)
 *
 * ⚠️ 为什么 require dist 而非 import src:
 *   deploy_auto.py 只上传 apps/server/dist (编译产物) + scripts/, 不上传 src/。
 *   生产服务器的 src/ 是陈旧快照。若本脚本 import '../src/.../progress.service',
 *   tsx 会读到旧逻辑 → 重算口径错误。改 require dist 的已编译 ProgressService,
 *   它每次部署都与运行中的服务一致。ProgressService.compute 无 DI 依赖, 可独立 new。
 *   本地 dev 跑前需先 `pnpm --filter server build` 生成 dist。
 *
 * 用法 (apps/server 目录):
 *   set -a && . ./.env && set +a
 *   node scripts/recalc-intake-status.cjs --dry-run
 *   node scripts/recalc-intake-status.cjs
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { ProgressService } = require('../dist/modules/student/progress.service');

const DRY = process.argv.includes('--dry-run');

async function run() {
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
  const svc = new ProgressService();
  await prisma.$connect();

  const profiles = await prisma.studentProfile.findMany({
    include: {
      user: { select: { realName: true, gender: true, phone: true, ethnicity: true, birthDate: true } },
    },
  });

  const byStatus = {};
  const missingTally = {};
  let okCount = 0;
  const stats = {
    total: profiles.length,
    promoteDraftToSubmitted: 0,
    promoteNeedsChangesToSubmitted: 0,
    unchanged: 0,
  };

  for (const p of profiles) {
    byStatus[p.intakeStatus] = (byStatus[p.intakeStatus] ?? 0) + 1;
    // merge user 字段进 profile (USER_LEVEL_FIELDS: realName/phone/gender/ethnicity/birthDate)
    const merged = { ...p, ...(p.user ?? {}) };
    const prog = svc.compute(merged);
    for (const f of prog.missingFieldsForRecommend) missingTally[f] = (missingTally[f] ?? 0) + 1;
    if (prog.isRecommendable) okCount++;

    if (prog.isRecommendable && (p.intakeStatus === 'DRAFT' || p.intakeStatus === 'NEEDS_CHANGES')) {
      const from = p.intakeStatus;
      console.log(`[${DRY ? 'DRY' : 'UPDATE'}] profile=${p.id} (${p.user?.realName ?? '?'}) ${from} -> SUBMITTED`);
      if (from === 'DRAFT') stats.promoteDraftToSubmitted++;
      else stats.promoteNeedsChangesToSubmitted++;
      if (!DRY) {
        await prisma.studentProfile.update({
          where: { id: p.id },
          data: { intakeStatus: 'SUBMITTED', intakeSubmittedAt: p.intakeSubmittedAt ?? new Date() },
        });
      }
    } else {
      stats.unchanged++;
    }
  }

  console.log('\n=== 诊断 ===');
  console.log('intakeStatus 分布:', JSON.stringify(byStatus));
  console.log(`完全达标 isRecommendable: ${okCount} / ${profiles.length}`);
  console.log('缺失必填字段统计:');
  for (const [f, n] of Object.entries(missingTally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f}: ${n} 人缺`);
  }
  console.log('\n=== 重算 stats ===');
  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
