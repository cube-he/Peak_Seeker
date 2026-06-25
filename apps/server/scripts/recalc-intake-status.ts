/**
 * 一次性 migration: 对所有现存 StudentProfile 按新口径 (REQUIRED_FIELDS 单层)
 * 重算 intakeStatus.
 *
 * 保守策略 (只升不降):
 *   - DRAFT / NEEDS_CHANGES + 新口径满足 → SUBMITTED  (告知老师"现在符合最低标准了")
 *   - 其它情况不动 (尤其是 VERIFIED, 不主动退回)
 *
 * 用法 (apps/server 目录):
 *   set -a && . ./.env && set +a
 *   npx tsx scripts/recalc-intake-status.ts --dry-run
 *   npx tsx scripts/recalc-intake-status.ts
 */
import { PrismaClient } from '@prisma/client';
import { ProgressService } from '../src/modules/student/progress.service';

const DRY = process.argv.includes('--dry-run');

async function run() {
  const prisma = new PrismaClient();
  const svc = new ProgressService();
  await prisma.$connect();

  const profiles = await prisma.studentProfile.findMany({
    include: {
      user: {
        select: { realName: true, gender: true, phone: true, ethnicity: true, birthDate: true },
      },
    },
  });

  const stats = {
    total: profiles.length,
    promoteDraftToSubmitted: 0,
    promoteNeedsChangesToSubmitted: 0,
    unchanged: 0,
  };

  for (const p of profiles) {
    // merge user 字段进 profile (USER_LEVEL_FIELDS: realName/phone/gender/ethnicity/birthDate)
    const merged = { ...p, ...(p.user ?? {}) } as Record<string, unknown>;
    const progress = svc.compute(merged);

    if (
      progress.isRecommendable &&
      (p.intakeStatus === 'DRAFT' || p.intakeStatus === 'NEEDS_CHANGES')
    ) {
      const fromStatus = p.intakeStatus;
      console.log(
        `[${DRY ? 'DRY' : 'UPDATE'}] profile=${p.id} (${(p.user as { realName?: string } | null)?.realName ?? '?'}) ${fromStatus} → SUBMITTED`,
      );
      if (fromStatus === 'DRAFT') stats.promoteDraftToSubmitted++;
      else stats.promoteNeedsChangesToSubmitted++;
      if (!DRY) {
        await prisma.studentProfile.update({
          where: { id: p.id },
          data: {
            intakeStatus: 'SUBMITTED',
            intakeSubmittedAt: p.intakeSubmittedAt ?? new Date(),
          },
        });
      }
    } else {
      stats.unchanged++;
    }
  }

  console.log('\n=== 重算完成 ===');
  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
