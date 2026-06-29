import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanItemService } from '../plan/plan-item.service';
import { ResolvedGroup } from './volunteer-form.types';

@Injectable()
export class VolunteerFormImportService {
  constructor(
    private prisma: PrismaService,
    private planItem: PlanItemService,
  ) {}

  async commit(input: {
    studentId: number;
    batchConfigId: number;
    resolvedGroups: ResolvedGroup[];
    actorUserId: number;
    versionNote?: string;
  }) {
    const student = await this.prisma.studentProfile.findUnique({ where: { id: input.studentId } });
    if (!student) throw new NotFoundException('学生不存在');
    const bc = await this.prisma.batchConfig.findUnique({ where: { id: input.batchConfigId } });
    if (!bc) throw new NotFoundException('批次配置不存在');

    const matched = input.resolvedGroups
      .filter((g) => g.status === 'matched' && g.anchorEnrollmentPlanId)
      .sort((a, b) => a.seq - b.seq);

    const newPlan = await this.prisma.$transaction(async (tx: any) => {
      const parent = await tx.volunteerPlan.findFirst({
        where: { studentId: input.studentId, batchConfigId: input.batchConfigId },
        orderBy: { versionNo: 'desc' },
      });
      const nextVersionNo = (parent?.versionNo ?? 0) + 1;
      const baseName = parent?.name?.replace(/-(初版|v\d+)$/, '') ?? `${bc.batch}`;
      const created = await tx.volunteerPlan.create({
        data: {
          studentId: input.studentId,
          createdById: input.actorUserId,
          name: `${baseName}-v${nextVersionNo}`,
          year: bc.year,
          province: bc.province,
          batchName: bc.batch,
          batchConfigId: input.batchConfigId,
          recommendType: 'MANUAL',
          status: 'DRAFT',
          versionNo: nextVersionNo,
          parentVersionId: parent?.id ?? null,
          versionNote: input.versionNote ?? '从志愿表导入（实填）',
        },
      });
      if (parent?.status === 'DRAFT') {
        await tx.volunteerPlan.update({ where: { id: parent.id }, data: { status: 'OUTDATED' } });
      }
      return created;
    });

    const failures: { seq: number; reason: string }[] = [];
    for (const g of matched) {
      try {
        await this.planItem.add(
          newPlan.id,
          {
            enrollmentPlanId: g.anchorEnrollmentPlanId!,
            sequence: g.seq,
            acceptAdjust: g.acceptAdjust,
            selectedMajors: g.selectedMajors,
            candidateMajorRanking: g.selectedMajors,
          } as any,
          input.actorUserId,
        );
      } catch (e: any) {
        failures.push({ seq: g.seq, reason: e?.message ?? String(e) });
      }
    }
    return { ...newPlan, importedCount: matched.length - failures.length, failures };
  }
}
