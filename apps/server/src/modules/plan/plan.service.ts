import {
  Injectable,
  BadRequestException,
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
import { RiskEngineService } from './risk-engine/risk-engine.service';
import { NotificationService, NotificationEvent } from '../notification/notification.service';
import { FEATURE_FLAGS } from '../../config/feature-flags';
import { toSortFields, type UniversitySortSource } from './plan-item-sort-fields';

@Injectable()
export class PlanService {
  constructor(
    private prisma: PrismaService,
    private sm: PlanStateMachineService,
    private riskEngine: RiskEngineService,
    private notifications: NotificationService,
  ) {}

  /** 发通知；失败静默——审核动作已落库，通知只是锦上添花，不能因发信失败回滚业务 */
  private async notify(event: NotificationEvent): Promise<void> {
    try {
      await this.notifications.send(event);
    } catch {
      // 通知失败不阻断审核流转
    }
  }

  /** 提交审核时还没有认领人，广播给所有主管 */
  private async notifySupervisors(event: Omit<NotificationEvent, 'userId'>): Promise<void> {
    const sups = await this.prisma.teacherProfile.findMany({
      where: { isSupervisor: true },
      select: { userId: true },
    });
    await Promise.all(sups.map((s) => this.notify({ ...event, userId: s.userId })));
  }

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
    // 学生只看自己名下方案; 排除 OUTDATED(被二稿取代的只读初稿), 学生端不展示过期初稿,
    // 仅老师端可见历史版本。老师自己的 findMine(createdById)不过滤, 保留全部版本。
    const where: Record<string, any> = user.studentProfileId
      ? { studentId: user.studentProfileId, status: { not: 'OUTDATED' } }
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
    const where: Record<string, any> = user.isSupervisor
      ? {
          // 主管视角: 只看需要审核/已审/终稿的方案; DRAFT 是老师私产, 不进主管视线
          status: { in: ['PENDING_REVIEW', 'REVIEWING', 'APPROVED', 'PARENT_CONFIRMED', 'REJECTED', 'FINALIZED', 'PUBLISHED'] },
        }
      : user.role === 'ADMIN'
        ? {}
        : { createdById: user.id };
    // 默认过滤历史档案方案 (isHistorical=true), 它们在 /teacher/historical-cases 页面访问.
    // 不然每年的历史归档会持续淹没活跃方案列表.
    where.isHistorical = false;
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

  private toPlanItem(item: any, uniMap?: Map<number, UniversitySortSource>) {
    return {
      id: item.id,
      order: item.sequence,
      sequence: item.sequence,
      universityId: item.universityId,
      universityName: item.universityName,
      universityCode: item.universityCode,
      groupCode: item.groupCode,
      groupName: item.groupName,
      majorId: item.majorId,
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
      // —— 多级排序所需字段(拆开分数线 + University 属性) ——
      ...toSortFields(item, uniMap?.get(item.universityId)),
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
        planItems: {
          orderBy: { sequence: 'asc' },
          include: {
            risks: {
              where: { resolvedAt: null },
              orderBy: [{ severity: 'asc' }, { id: 'asc' }],
            },
          },
        },
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
    // 排序需要 University 的省份/办学性质/排名/标签; PlanItem 无 relation, 单独批量查后 merge。
    const uniIds = [...new Set((plan.planItems ?? []).map((it: any) => it.universityId))];
    const universities = uniIds.length
      ? await this.prisma.university.findMany({
          where: { id: { in: uniIds } },
          select: {
            id: true, province: true, runningNature: true, softRanking: true,
            is985: true, is211: true, isDoubleFirstClass: true,
          },
        })
      : [];
    const uniMap = new Map(universities.map((u) => [u.id, u]));
    return {
      ...plan,
      studentName: plan.student?.user?.realName ?? plan.student?.user?.username,
      version: plan.versionNo,
      batch: plan.batchName ?? plan.batch,
      batchConfig,
      itemCount: plan.planItems?.length ?? 0,
      items: (plan.planItems ?? []).map((item) => this.toPlanItem(item, uniMap)),
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
    // 资料确认门 / 关键资料必填门已取消 (2026-06-25): 老师可在 intakeStatus 未 VERIFIED 或
    // 关键字段未填时直接出方案预览。数据质量改由前端软提示引导, 不在此硬拦。
    // 审核仍走 plan.status 状态机 (DRAFT→PENDING_REVIEW→...), 与 intakeStatus 解耦。
    if (student.intakeStatus !== 'VERIFIED') {
      console.warn(`[plan.create] 学生 ${studentId} intakeStatus=${student.intakeStatus} (未确认), 按放宽策略仍允许出方案`);
    }

    const batchConfig = await this.prisma.batchConfig.findUnique({
      where: { id: dto.batchConfigId },
    });
    if (!batchConfig) throw new NotFoundException('批次配置不存在');

    // 商业化流程: 只能为学生选定的批次出方案
    // 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 十
    const studentBatches = Array.isArray(student.preferredBatches)
      ? (student.preferredBatches as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    if (studentBatches.length > 0 && !studentBatches.includes(batchConfig.batch)) {
      const msg = `批次「${batchConfig.batch}」未被学生选定 (已选: ${studentBatches.join(', ')})`;
      if (FEATURE_FLAGS.STRICT_BATCH_VALIDATION) {
        throw new BadRequestException(msg);
      }
      console.warn('[STRICT_BATCH_VALIDATION disabled]', msg);
    }

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
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (plan) {
      await this.notify({ userId: plan.createdById, type: 'plan_review_started', title: '方案进入审核', content: `你的方案「${plan.name}」已被主管认领，正在审核`, refType: 'plan', refId: planId });
    }
    return plan;
  }

  async submitReview(planId: number, userId: number, underfillReason?: string) {
    const plan = await this.findById(planId, userId);
    if (plan.createdById !== userId) {
      throw new ForbiddenException('只有出方案老师可以提交审核');
    }
    // 严重风险数 = 0 才能送审
    const riskCounts = await this.riskEngine.countByPlan(planId);
    if (riskCounts.critical > 0) {
      throw new ConflictException(
        `存在 ${riskCounts.critical} 条严重风险未解决,无法提交审核`,
      );
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
      underfillReason,
    });
    // 不足额提交的理由进 notes, 主管审核时可见
    const underfilled = itemCount < maxGroupCount && (underfillReason ?? '').trim().length >= 10;
    const underfillNote = `[不足额提交 ${itemCount}/${maxGroupCount}] ${underfillReason?.trim()}`;
    const updated = await this.prisma.volunteerPlan.update({
      where: { id: planId },
      data: {
        status: next,
        parentConfirmedAt: null,
        parentChangeRequestedAt: null,
        parentChangeRequest: null,
        ...(underfilled
          ? { notes: plan.notes ? `${plan.notes}\n${underfillNote}` : underfillNote }
          : {}),
      },
    });
    await this.notifySupervisors({ type: 'plan_submitted', title: '有新方案待审核', content: `方案「${plan.name}」已提交，待主管认领审核`, refType: 'plan', refId: planId });
    return updated;
  }

  async withdrawReview(planId: number, userId: number, reason?: string) {
    const plan = await this.findById(planId, userId);
    if (plan.createdById !== userId) {
      throw new ForbiddenException('只有出方案老师可以撤回');
    }
    // REVIEWING 走状态机会抛笼统的"不允许的状态转移", 这里给出可操作的指引
    if (plan.status === 'REVIEWING') {
      throw new ConflictException('主管已开始审核, 无法撤回; 如需修改请联系主管"退回修改"');
    }
    const next = this.sm.transition(plan.status, 'WITHDRAW');
    const note = `[撤回审核] ${reason?.trim() || '老师撤回修改'}`;
    return this.prisma.volunteerPlan.update({
      where: { id: planId },
      data: {
        status: next,
        notes: plan.notes ? `${plan.notes}\n${note}` : note,
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

  async deriveVersion(planId: number, userId: number, versionNote?: string) {
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
      // 下一版本号 = 同学生同批次现有最大版本号 + 1。
      // 防重复派生撞 @@unique([studentId, batchConfigId, versionNo])：
      // canDeriveVersion 含 FINALIZED，从同一已定稿版本派生两次会撞旧的 parent.versionNo+1。
      const latest = await tx.volunteerPlan.findFirst({
        where: { studentId: parent.studentId, batchConfigId: parent.batchConfigId },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });
      const nextVersionNo = (latest?.versionNo ?? parent.versionNo) + 1;

      const baseName = parent.name?.replace(/-(初版|v\d+)$/, '') ?? parent.name;
      const newPlan = await tx.volunteerPlan.create({
        data: {
          studentId: parent.studentId,
          createdById: userId,
          name: `${baseName}-v${nextVersionNo}`,
          year: parent.year,
          province: parent.province,
          batchName: parent.batchName,
          batchConfigId: parent.batchConfigId,
          recommendType: 'MANUAL',
          status: 'DRAFT',
          versionNo: nextVersionNo,
          parentVersionId: parent.id,
          versionNote: versionNote ?? null,
          notes: parent.notes,
        },
      });
      if (items.length > 0) {
        // 全字段复制(剔除自增/时间/旧外键): 早先手列字段漏了 fullMajorRanking/recommendedOrder 等,
        // 导致派生出的二稿「专业」选择丢失、打印专业列空白。spread 原样带过所有标量字段,
        // 以后新增 PlanItem 字段也自动跟随, 不再漏拷。
        await tx.planItem.createMany({
          data: items.map(({ id, createdAt, updatedAt, planId: _planId, ...rest }) => ({
            ...rest,
            planId: newPlan.id,
            isManuallyModified: false,
            originalItemId: id,
          })) as any,
        });
      }
      // 锁定初稿：仅当父版本为 DRAFT 时置 OUTDATED（自动只读，见 canEditItems）。
      // 其它可派生态（REJECTED/FINALIZED 等）维持原行为，避免回归。
      if (parent.status === 'DRAFT') {
        await tx.volunteerPlan.update({
          where: { id: parent.id },
          data: { status: 'OUTDATED' },
        });
      }
      return newPlan;
    });
  }

  async review(planId: number, supervisorUserId: number, dto: ReviewPlanDto) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: { student: { select: { userId: true } } },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (plan.currentReviewerId !== supervisorUserId) {
      throw new ForbiddenException('您不是当前审核人');
    }
    const next = this.sm.transition(plan.status, dto.action as PlanAction);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.volunteerPlan.update({
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
      return result;
    });

    if (dto.action === 'APPROVE') {
      await this.notify({ userId: plan.createdById, type: 'plan_approved', title: '方案已通过审核', content: `你的方案「${plan.name}」已通过主管审核`, refType: 'plan', refId: planId });
      if (plan.student?.userId) {
        await this.notify({ userId: plan.student.userId, type: 'plan_approved', title: '方案待确认', content: '老师为你制定的方案已通过审核，请查看并确认', refType: 'plan', refId: planId });
      }
    } else if (dto.action === 'REJECT') {
      await this.notify({ userId: plan.createdById, type: 'plan_rejected', title: '方案被驳回', content: `你的方案「${plan.name}」被主管驳回${dto.comment ? '：' + dto.comment : ''}，可派生新版本修改`, refType: 'plan', refId: planId });
    } else if (dto.action === 'REQUEST_CHANGE') {
      await this.notify({ userId: plan.createdById, type: 'plan_change_requested', title: '方案被打回修改', content: `你的方案「${plan.name}」被打回${dto.comment ? '：' + dto.comment : ''}，请修改后重新提交`, refType: 'plan', refId: planId });
    }
    return updated;
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.volunteerPlan.update({
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
      return result;
    });
    await this.notify({ userId: plan.createdById, type: 'parent_confirmed', title: '家长已确认方案', content: `方案「${plan.name}」家长已确认，可定稿`, refType: 'plan', refId: planId });
    return updated;
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.volunteerPlan.update({
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
      return result;
    });
    await this.notify({ userId: plan.createdById, type: 'parent_change_requested', title: '家长要求修改方案', content: `家长对方案「${plan.name}」提出修改：${comment}`, refType: 'plan', refId: planId });
    return updated;
  }
}
