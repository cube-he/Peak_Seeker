import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanV2Dto } from './dto/create-plan-v2.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { PlanStateMachineService, PlanAction } from './plan-state-machine.service';

@Injectable()
export class PlanService {
  constructor(private prisma: PrismaService, private sm: PlanStateMachineService) {}

  async create(userId: number, dto: CreatePlanDto) {
    // Legacy path: use userId as both createdById and look up studentProfile for studentId
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // For legacy compatibility: if user has a studentProfile, use it; otherwise fall back
    const studentId = user.studentProfile?.id;
    if (!studentId) {
      throw new ForbiddenException('当前用户没有学生档案，无法创建方案');
    }

    return this.prisma.volunteerPlan.create({
      data: {
        studentId,
        createdById: userId,
        userId, // preserve legacy relation
        name: dto.name,
        year: dto.year,
        province: dto.province,
        legacyItems: dto.items,
        strategy: dto.strategy,
        notes: dto.notes,
      },
    });
  }

  async findAll(userId: number) {
    return this.prisma.volunteerPlan.findMany({
      where: { createdById: userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findById(id: number, userId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('方案不存在');
    }

    // Check access via createdById or legacy userId
    if (plan.createdById !== userId && plan.userId !== userId) {
      throw new ForbiddenException('无权访问此方案');
    }

    return plan;
  }

  async update(id: number, userId: number, dto: UpdatePlanDto) {
    await this.findById(id, userId);

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.items !== undefined) data.legacyItems = dto.items;
    if (dto.strategy !== undefined) data.strategy = dto.strategy;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.isFavorite !== undefined) data.isFavorite = dto.isFavorite;

    return this.prisma.volunteerPlan.update({
      where: { id },
      data,
    });
  }

  async delete(id: number, userId: number) {
    await this.findById(id, userId);

    return this.prisma.volunteerPlan.delete({
      where: { id },
    });
  }

  async findByIdWithItems(id: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id },
      include: { planItems: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    return plan;
  }

  async getVersionTree(planId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!plan.batchConfigId) return [plan];
    return this.prisma.volunteerPlan.findMany({
      where: { studentId: plan.studentId, batchConfigId: plan.batchConfigId },
      orderBy: { versionNo: 'asc' },
    });
  }

  async deleteDraft(id: number, userId: number) {
    const plan = await this.findById(id, userId);
    if (plan.status !== 'DRAFT') {
      throw new ConflictException('仅 DRAFT 方案可删除');
    }
    return this.prisma.volunteerPlan.delete({ where: { id } });
  }

  async toggleFavorite(id: number, userId: number) {
    const plan = await this.findById(id, userId);

    return this.prisma.volunteerPlan.update({
      where: { id },
      data: {
        isFavorite: !plan.isFavorite,
      },
    });
  }

  async createForStudent(creatorUserId: number, studentId: number, dto: CreatePlanV2Dto) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('学生不存在');

    const batchConfig = await this.prisma.batchConfig.findUnique({
      where: { id: dto.batchConfigId },
    });
    if (!batchConfig) throw new NotFoundException('批次配置不存在');

    const name = dto.name ?? `${student.user.realName ?? student.user.username}-${batchConfig.batch}-初版`;

    return this.prisma.volunteerPlan.create({
      data: {
        studentId, createdById: creatorUserId,
        name, year: batchConfig.year, province: batchConfig.province,
        batchName: batchConfig.batch, batchConfigId: batchConfig.id,
        recommendType: 'MANUAL',
        status: 'DRAFT', versionNo: 1,
        notes: dto.notes,
      },
    });
  }

  async listForStudent(studentId: number, opts: { batchConfigId?: number; latestOnly?: boolean }) {
    const where: any = { studentId };
    if (opts.batchConfigId) where.batchConfigId = opts.batchConfigId;
    const all = await this.prisma.volunteerPlan.findMany({
      where, orderBy: [{ batchConfigId: 'asc' }, { versionNo: 'desc' }],
    });
    if (!opts.latestOnly) return all;
    const seen = new Set<number>();
    return all.filter((p) => {
      if (!p.batchConfigId) return true;
      if (seen.has(p.batchConfigId)) return false;
      seen.add(p.batchConfigId);
      return true;
    });
  }

  async startReview(planId: number, supervisorUserId: number) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: supervisorUserId },
    });
    if (!teacher?.isSupervisor) {
      throw new ForbiddenException('仅主管可认领审核');
    }

    // 乐观锁 UPDATE
    const result = await this.prisma.$executeRaw`
      UPDATE volunteer_plans
      SET status = 'REVIEWING', current_reviewer_id = ${supervisorUserId}
      WHERE id = ${planId} AND status = 'PENDING_REVIEW'
    `;
    if (result === 0) {
      throw new ConflictException('方案已被他人认领或不在 PENDING_REVIEW 状态');
    }
    await this.prisma.planReview.create({
      data: {
        planId,
        reviewerId: supervisorUserId,
        reviewerRole: 'SUPERVISOR',
        action: 'COMMENT',
        comment: '开始审核',
      },
    });
    return this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
  }

  async submitReview(planId: number, userId: number) {
    const plan = await this.findById(planId, userId);
    const itemCount = await this.prisma.planItem.count({ where: { planId } });
    let maxGroupCount = 0;
    if (plan.batchConfigId) {
      const bc = await this.prisma.batchConfig.findUnique({
        where: { id: plan.batchConfigId },
      });
      maxGroupCount = bc?.maxGroupCount ?? 0;
    }
    const next = this.sm.transition(plan.status, 'SUBMIT_REVIEW', {
      itemCount,
      maxGroupCount,
    });
    return this.prisma.volunteerPlan.update({
      where: { id: planId },
      data: { status: next },
    });
  }

  async finalize(planId: number, userId: number) {
    const plan = await this.findById(planId, userId);
    const next = this.sm.transition(plan.status, 'FINALIZE');
    if (!plan.batchConfigId) {
      return this.prisma.volunteerPlan.update({
        where: { id: planId },
        data: {
          status: next,
          isFinal: true,
          finalizedAt: new Date(),
          finalizedBy: userId,
        },
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.volunteerPlan.updateMany({
        where: {
          studentId: plan.studentId,
          batchConfigId: plan.batchConfigId,
          isFinal: true,
          NOT: { id: planId },
        },
        data: { isFinal: false },
      });
      return tx.volunteerPlan.update({
        where: { id: planId },
        data: {
          status: next,
          isFinal: true,
          finalizedAt: new Date(),
          finalizedBy: userId,
        },
      });
    });
  }

  async deriveVersion(planId: number, userId: number) {
    const parent = await this.findById(planId, userId);
    if (!this.sm.canDeriveVersion(parent.status)) {
      throw new ConflictException(`状态 ${parent.status} 不允许派生`);
    }
    const items = await this.prisma.planItem.findMany({
      where: { planId },
      orderBy: { sequence: 'asc' },
    });

    return this.prisma.$transaction(async (tx) => {
      const baseName = parent.name?.replace(/-(初版|v\d+)$/, '') ?? parent.name;
      const newPlan = await tx.volunteerPlan.create({
        data: {
          studentId: parent.studentId,
          createdById: userId,
          name: `${baseName}-v${parent.versionNo + 1}`,
          year: parent.year,
          province: parent.province,
          batchName: parent.batchName,
          batchConfigId: parent.batchConfigId,
          recommendType: 'MANUAL',
          status: 'DRAFT',
          versionNo: parent.versionNo + 1,
          parentVersionId: parent.id,
          notes: parent.notes,
        },
      });
      if (items.length > 0) {
        await tx.planItem.createMany({
          data: items.map((it) => ({
            planId: newPlan.id,
            sequence: it.sequence,
            gradient: it.gradient,
            universityId: it.universityId,
            universityName: it.universityName,
            universityCode: it.universityCode,
            groupCode: it.groupCode,
            groupName: it.groupName,
            majorId: it.majorId,
            majorName: it.majorName,
            majorCode: it.majorCode,
            anchorMajor: it.anchorMajor,
            groupMajorCount: it.groupMajorCount,
            subjectRequirement: it.subjectRequirement,
            acceptAdjust: it.acceptAdjust,
            score25Group: it.score25Group,
            rank25Group: it.rank25Group,
            score25Major: it.score25Major,
            rank25Major: it.rank25Major,
            score24Major: it.score24Major,
            rank24Major: it.rank24Major,
            planCount: it.planCount,
            tuition: it.tuition,
            selectionReason: it.selectionReason,
            isManuallyModified: false,
            originalItemId: it.id,
          })),
        });
      }
      return newPlan;
    });
  }

  async review(planId: number, supervisorUserId: number, dto: ReviewPlanDto) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (plan.currentReviewerId !== supervisorUserId) {
      throw new ForbiddenException('您不是当前审核人');
    }
    const next = this.sm.transition(plan.status, dto.action as PlanAction);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.volunteerPlan.update({
        where: { id: planId },
        data: {
          status: next,
          currentReviewerId: dto.action === 'COMMENT' ? supervisorUserId : null,
        },
      });
      await tx.planReview.create({
        data: {
          planId,
          reviewerId: supervisorUserId,
          reviewerRole: 'SUPERVISOR',
          action: dto.action,
          comment: dto.comment ?? null,
          itemAnnotations: (dto.itemAnnotations as any) ?? undefined,
        },
      });
      return updated;
    });
  }
}
