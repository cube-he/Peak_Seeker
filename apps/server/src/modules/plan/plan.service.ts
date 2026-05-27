import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanV2Dto } from './dto/create-plan-v2.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { PlanStateMachineService, PlanAction } from './plan-state-machine.service';

@Injectable()
export class PlanService {
  constructor(
    private prisma: PrismaService,
    private sm: PlanStateMachineService,
  ) {}

  async create(userId: number, dto: CreatePlanDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    const studentId = user.studentProfile?.id;
    if (!studentId) throw new ForbiddenException('当前用户没有学生档案，无法创建方案');

    return this.prisma.volunteerPlan.create({
      data: {
        studentId,
        createdById: userId,
        userId,
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

  async findMine(user: { id: number; role: string; studentProfileId?: number | null }) {
    const where: Record<string, any> = user.studentProfileId
      ? { studentId: user.studentProfileId }
      : { createdById: user.id };
    const plans = await this.prisma.volunteerPlan.findMany({
      where,
      include: { _count: { select: { planItems: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return { data: plans.map((plan) => this.toPlanListItem(plan)) };
  }

  async findTeacherPlans(
    user: { id: number; role: string; isSupervisor?: boolean },
    query: Record<string, string | undefined>,
  ) {
    const where: Record<string, any> =
      user.role === 'ADMIN' || user.isSupervisor ? {} : { createdById: user.id };
    const search = query.search?.trim();
    if (query.batch) where.batchName = query.batch;
    if (query.status) where.status = query.status;
    if (query.studentId) where.studentId = Number(query.studentId);
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { student: { user: { realName: { contains: search } } } },
        { student: { user: { username: { contains: search } } } },
      ];
    }

    const plans = await this.prisma.volunteerPlan.findMany({
      where,
      include: {
        student: { include: { user: true } },
        _count: { select: { planItems: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      data: plans.map((plan) => ({
        ...this.toPlanListItem(plan),
        studentName:
          plan.student?.user?.realName ??
          plan.student?.user?.username ??
          `学生 ${plan.studentId}`,
      })),
    };
  }

  private toPlanListItem(plan: any) {
    return {
      id: plan.id,
      name: plan.name,
      studentId: plan.studentId,
      batch: plan.batchName ?? plan.batch ?? '',
      examSource: plan.examSource ?? 'MOCK',
      status: plan.status,
      version: plan.versionNo ?? 1,
      itemCount: plan._count?.planItems ?? plan.planItems?.length ?? 0,
      isFinal: plan.isFinal,
      parentConfirmedAt: plan.parentConfirmedAt,
      parentChangeRequest: plan.parentChangeRequest,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private toPlanItem(item: any) {
    return {
      id: item.id,
      order: item.sequence,
      sequence: item.sequence,
      universityName: item.universityName,
      universityCode: item.universityCode,
      groupCode: item.groupCode,
      groupName: item.groupName,
      majorName: item.majorName,
      majorCode: item.majorCode,
      gradient: item.gradient,
      historicalMinScore: item.score25Group ?? item.score25Major,
      historicalMinRank: item.rank25Group ?? item.rank25Major,
      planCount: item.planCount,
      tuition: item.tuition,
      recommendedOrder: item.recommendedOrder,
      fullMajorRanking: item.fullMajorRanking,
      selectedMajors: item.fullMajorRanking?.selectedMajors ?? null,
      acceptAdjust: item.acceptAdjust,
      selectionReason: item.selectionReason,
      riskWarning: item.riskWarning,
      adjustmentAdvice: item.adjustmentAdvice,
      explanation: item.selectionReason,
      scoreBreakdown: item.scoreBreakdown,
      overrideSoftFail: item.overrideSoftFail,
      softFailReasons: item.softFailReasons,
      overrideReason: item.overrideReason,
    };
  }

  private async canReadPlan(plan: any, userId: number) {
    const reviewer = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { isSupervisor: true },
    });
    return (
      reviewer?.isSupervisor ||
      plan.createdById === userId ||
      plan.userId === userId ||
      plan.student?.userId === userId
    );
  }

  async findById(id: number, userId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id },
      include: {
        student: { include: { user: true } },
        planItems: { orderBy: { sequence: 'asc' } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { reviewer: { select: { id: true, realName: true, username: true } } },
        },
      },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!(await this.canReadPlan(plan, userId))) {
      throw new ForbiddenException('无权访问此方案');
    }
    const batchConfig = plan.batchConfigId
      ? await this.prisma.batchConfig.findUnique({
          where: { id: plan.batchConfigId },
          select: {
            id: true,
            batch: true,
            maxGroupCount: true,
            maxMajorPerGroup: true,
            volunteerMode: true,
          },
        })
      : null;
    return {
      ...plan,
      studentName: plan.student?.user?.realName ?? plan.student?.user?.username,
      version: plan.versionNo,
      batch: plan.batchName ?? plan.batch,
      batchConfig,
      itemCount: plan.planItems?.length ?? 0,
      items: (plan.planItems ?? []).map((item) => this.toPlanItem(item)),
    };
  }

  async update(id: number, userId: number, dto: UpdatePlanDto) {
    const plan = await this.findById(id, userId);
    if (plan.createdById !== userId) {
      throw new ForbiddenException('只有出方案老师可以修改方案');
    }
    if (!this.sm.canEditItems(plan.status)) {
      throw new ConflictException(`方案状态 ${plan.status} 不允许修改`);
    }

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.items !== undefined) data.legacyItems = dto.items;
    if (dto.strategy !== undefined) data.strategy = dto.strategy;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.isFavorite !== undefined) data.isFavorite = dto.isFavorite;

    return this.prisma.volunteerPlan.update({ where: { id }, data });
  }

  async delete(id: number, userId: number) {
    await this.findById(id, userId);
    return this.prisma.volunteerPlan.delete({ where: { id } });
  }

  async findByIdWithItems(id: number, userId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id },
      include: {
        student: true,
        planItems: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!(await this.canReadPlan(plan, userId))) {
      throw new ForbiddenException('无权访问此方案');
    }
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

  /**
   * 列出该方案所属学生 + 批次下的全部版本(用于版本切换器和对比)
   * 只返回基本信息,不含 items(items 通过 findById 单独拉)
   */
  async getVersionsForPlan(planId: number, _userId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        studentId: true,
        batchConfigId: true,
      },
    });
    if (!plan) {
      throw new NotFoundException('方案不存在');
    }
    const versions = await this.prisma.volunteerPlan.findMany({
      where: {
        studentId: plan.studentId,
        batchConfigId: plan.batchConfigId,
      },
      select: {
        id: true,
        versionNo: true,
        versionNote: true,
        status: true,
        parentVersionId: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        isFinal: true,
      },
      orderBy: { versionNo: 'desc' },
    });
    return { current: planId, versions };
  }

  async deleteDraft(id: number, userId: number) {
    const plan = await this.findById(id, userId);
    if (plan.createdById !== userId) {
      throw new ForbiddenException('只有出方案老师可以删除草稿');
    }
    if (plan.status !== 'DRAFT') {
      throw new ConflictException('仅 DRAFT 方案可删除');
    }
    return this.prisma.volunteerPlan.delete({ where: { id } });
  }

  async toggleFavorite(id: number, userId: number) {
    const plan = await this.findById(id, userId);
    return this.prisma.volunteerPlan.update({
      where: { id },
      data: { isFavorite: !plan.isFavorite },
    });
  }

  async createForStudent(creatorUserId: number, studentId: number, dto: CreatePlanV2Dto) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: creatorUserId },
    });
    if (!teacher) throw new ForbiddenException('只有老师可以为学生创建方案');

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { user: true, teacher: true },
    });
    if (!student) throw new NotFoundException('学生不存在');
    if (student.teacherId !== teacher.id) {
      throw new ForbiddenException('无权为不属于自己的学生创建方案');
    }
    if (student.intakeStatus !== 'VERIFIED') {
      throw new ConflictException('学生资料需先由老师确认为 VERIFIED 后才能创建方案');
    }

    const batchConfig = await this.prisma.batchConfig.findUnique({
      where: { id: dto.batchConfigId },
    });
    if (!batchConfig) throw new NotFoundException('批次配置不存在');

    const existingPlan = await this.prisma.volunteerPlan.findFirst({
      where: { studentId, batchConfigId: batchConfig.id },
      orderBy: { versionNo: 'desc' },
    });
    if (existingPlan) return existingPlan;

    const name = dto.name ?? `${student.user.realName ?? student.user.username}-${batchConfig.batch}-初版`;
    return this.prisma.volunteerPlan.create({
      data: {
        studentId,
        createdById: creatorUserId,
        name,
        year: batchConfig.year,
        province: batchConfig.province,
        batchName: batchConfig.batch,
        batchConfigId: batchConfig.id,
        recommendType: 'MANUAL',
        status: 'DRAFT',
        versionNo: 1,
        notes: dto.notes,
      },
    });
  }

  async listForStudent(
    studentId: number,
    opts: { batchConfigId?: number; latestOnly?: boolean },
    user?: {
      id: number;
      role: string;
      studentProfileId?: number | null;
      teacherProfileId?: number | null;
      isSupervisor?: boolean;
    },
  ) {
    if (user && user.role !== 'ADMIN' && !user.isSupervisor) {
      if (user.studentProfileId !== studentId) {
        const student = await this.prisma.studentProfile.findUnique({
          where: { id: studentId },
          select: { teacherId: true },
        });
        if (!student || student.teacherId !== user.teacherProfileId) {
          throw new ForbiddenException('无权查看该学生方案');
        }
      }
    }
    const where: any = { studentId };
    if (opts.batchConfigId) where.batchConfigId = opts.batchConfigId;
    const all = await this.prisma.volunteerPlan.findMany({
      where,
      orderBy: [{ batchConfigId: 'asc' }, { versionNo: 'desc' }],
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
    if (plan.createdById !== userId) {
      throw new ForbiddenException('只有出方案老师可以提交审核');
    }
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
      data: {
        status: next,
        parentConfirmedAt: null,
        parentChangeRequestedAt: null,
        parentChangeRequest: null,
      },
    });
  }

  async finalize(planId: number, userId: number) {
    const plan = await this.findById(planId, userId);
    if (plan.createdById !== userId) {
      throw new ForbiddenException('只有出方案老师可以定稿');
    }
    if (plan.status !== 'PARENT_CONFIRMED') {
      throw new ConflictException('家长确认后才能定稿');
    }
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
    if (parent.createdById !== userId) {
      throw new ForbiddenException('只有出方案老师可以派生新版本');
    }
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
            riskWarning: it.riskWarning,
            adjustmentAdvice: it.adjustmentAdvice,
            overrideSoftFail: it.overrideSoftFail,
            softFailReasons: it.softFailReasons as any,
            overrideReason: it.overrideReason,
            isManuallyModified: false,
            originalItemId: it.id,
          })),
        });
      }
      return newPlan;
    });
  }

  async review(planId: number, supervisorUserId: number, dto: ReviewPlanDto) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
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
          parentConfirmedAt: null,
          parentChangeRequestedAt: null,
          parentChangeRequest: null,
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
      // 审核动作成功后清空该审核人对该方案的草稿
      // 用 tx 而非 this.prisma 确保原子性:如果 planReview.create 失败,事务回滚,draft 仍保留
      await tx.planReviewDraft.deleteMany({
        where: { planId, reviewerId: supervisorUserId },
      });
      return updated;
    });
  }

  async parentConfirm(planId: number, studentUserId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: { student: true },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (plan.student.userId !== studentUserId) {
      throw new ForbiddenException('只能确认自己的方案');
    }
    const next = this.sm.transition(plan.status, 'PARENT_CONFIRM');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.volunteerPlan.update({
        where: { id: planId },
        data: {
          status: next,
          parentConfirmedAt: new Date(),
          parentChangeRequestedAt: null,
          parentChangeRequest: null,
        },
      });
      await tx.planReview.create({
        data: {
          planId,
          reviewerId: studentUserId,
          reviewerRole: 'STUDENT',
          action: 'PARENT_CONFIRM',
          comment: '家长已确认方案',
        },
      });
      return updated;
    });
  }

  async parentRequestChange(planId: number, studentUserId: number, comment: string) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: { student: true },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (plan.student.userId !== studentUserId) {
      throw new ForbiddenException('只能退回自己的方案');
    }
    const next = this.sm.transition(plan.status, 'PARENT_REQUEST_CHANGE');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.volunteerPlan.update({
        where: { id: planId },
        data: {
          status: next,
          parentConfirmedAt: null,
          parentChangeRequestedAt: new Date(),
          parentChangeRequest: comment,
        },
      });
      await tx.planReview.create({
        data: {
          planId,
          reviewerId: studentUserId,
          reviewerRole: 'STUDENT',
          action: 'PARENT_REQUEST_CHANGE',
          comment,
        },
      });
      return updated;
    });
  }
}
