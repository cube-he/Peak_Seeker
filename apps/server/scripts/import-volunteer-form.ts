/**
 * 用法:
 *   cd apps/server && npx ts-node -r dotenv/config scripts/import-volunteer-form.ts \
 *     --form scripts/fixtures/yuanjia-volunteers.json --student-id <id> [--apply]
 *   不加 --apply 默认 dry-run(只解析打印命中率, 不写库)。
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { VolunteerFormResolverService } from '../src/modules/plan-import/volunteer-form-resolver.service';
import { StudentBatchMatcherService } from '../src/modules/plan-import/student-batch-matcher.service';
import { VolunteerFormImportService } from '../src/modules/plan-import/volunteer-form-import.service';
import { PlanItemService } from '../src/modules/plan/plan-item.service';
import { PlanStateMachineService } from '../src/modules/plan/plan-state-machine.service';

function arg(k: string) { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; }
const has = (k: string) => process.argv.includes(`--${k}`);

async function main() {
  const formPath = arg('form');
  const studentId = Number(arg('student-id'));
  const apply = has('apply');
  if (!formPath || !studentId) throw new Error('--form <path> 和 --student-id <id> 必填');
  const form = JSON.parse(fs.readFileSync(formPath, 'utf-8'));

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) } as any);
  const resolver = new VolunteerFormResolverService(prisma as any);
  const matcher = new StudentBatchMatcherService(prisma as any);

  const student = await (prisma as any).studentProfile.findUnique({
    where: { id: studentId },
    include: { user: { select: { realName: true } }, teacher: { select: { userId: true } } },
  });
  if (!student) throw new Error(`学生 ${studentId} 不存在`);
  console.log(`学生: ${student.user?.realName} (#${studentId}) examType=${student.examType} 老师userId=${student.teacher?.userId}`);

  const bc = await matcher.matchBatchConfig(form.batch, student.examType, student.examYear ?? form.year ?? 2026, student.province ?? '四川');
  if (!bc) throw new Error(`批次未配置: ${form.batch} / ${student.examType}`);
  console.log(`批次: ${bc.batch} (#${bc.id}) examType=${bc.examType} year=${bc.year}`);

  const subjectsMap: Record<string, string> = { PHYSICS: '物理', HISTORY: '历史' };
  const r = await resolver.resolveGroups(form.volunteers, { year: bc.year, subjects: subjectsMap[student.examType] ?? '物理', batch: bc.batch });
  console.log(`\n命中 ${r.summary.matched}/${r.summary.total}, 未命中 ${r.summary.unmatched}`);
  r.groups.filter((g: any) => g.status === 'unmatched').forEach((g: any) => console.log(`  ✗ ${g.seq} ${g.schoolName}/${g.groupCode}: ${g.unmatchedReason}`));
  r.groups.filter((g: any) => g.note).forEach((g: any) => console.log(`  ⚠ ${g.seq} ${g.schoolName}/${g.groupCode}: ${g.note}`));

  if (!apply) { console.log('\n[dry-run] 未写库。加 --apply 落库。'); await prisma.$disconnect(); return; }

  const actorUserId = student.teacher?.userId;
  if (!actorUserId) throw new Error('该生未关联老师, 无法确定方案归属 actorUserId');
  const importSvc = new VolunteerFormImportService(
    prisma as any,
    new PlanItemService(prisma as any, new PlanStateMachineService(), { recomputeForPlan: async () => ({}) } as any),
  );
  const plan = await importSvc.commit({ studentId, batchConfigId: bc.id, resolvedGroups: r.groups, actorUserId });
  console.log(`\n✓ 新版本 plan #${plan.id} v${plan.versionNo}, 写入 ${(plan as any).importedCount} 条`);
  if ((plan as any).failures?.length) console.log('失败:', (plan as any).failures);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
