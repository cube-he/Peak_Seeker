import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { AddPlanItemDto } from './dto/add-plan-item.dto';
import { UpdatePlanItemDto } from './dto/update-plan-item.dto';
import { calcGradient } from '../plan-candidate/gradient-calculator';
import { RiskEngineService } from './risk-engine/risk-engine.service';
import { ScoreSegmentService } from '../score-segment/score-segment.service';
import { confirmedBonusPoints } from '../policy/bonus-points.util';

const EXAM_TYPE_TO_SUBJECTS: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
};

@Injectable()
export class PlanItemService {
  constructor(
    private prisma: PrismaService,
    private sm: PlanStateMachineService,
    private riskEngine: RiskEngineService,
    @Optional() private scoreSegment?: ScoreSegmentService,
  ) {}

  private async getEditablePlan(
    planId: number,
    actorUserId?: number,
    opts: { majorSelectionOnly?: boolean } = {},
  ) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    if (actorUserId && plan.createdById !== actorUserId) {
      throw new ForbiddenException('无权编辑此方案');
    }
    const canEdit = opts.majorSelectionOnly
      ? this.sm.canEditMajorSelection(plan.status)
      : this.sm.canEditItems(plan.status);
    if (!canEdit) {
      throw new ConflictException(`方案状态 ${plan.status} 不允许编辑`);
    }
    return plan;
  }

  private normalizeMajorOrder(majors: NonNullable<UpdatePlanItemDto['selectedMajors']>) {
    return majors.map((major, index) => ({ ...major, order: index + 1 }));
  }

  private buildMajorSelectionUpdate(item: any, dto: UpdatePlanItemDto) {
    if (dto.selectedMajors === undefined) return null;
    if (dto.selectedMajors.length < 1 || dto.selectedMajors.length > 6) {
      throw new BadRequestException('selectedMajors must contain 1 to 6 majors');
    }

    const existingRanking = item.fullMajorRanking as any;
    const candidateMajorRanking = dto.candidateMajorRanking
      ?? existingRanking?.candidateMajorRanking;
    if (!Array.isArray(candidateMajorRanking) || candidateMajorRanking.length === 0) {
      throw new BadRequestException('candidateMajorRanking is required for major selection updates');
    }

    const candidateIds = new Set<number>();
    const normalizedCandidateMajorRanking = candidateMajorRanking.map((major: any, index: number) => {
      candidateIds.add(Number(major.enrollmentPlanId));
      return { ...major, order: index + 1 };
    });

    const selectedIds = new Set<number>();
    for (const major of dto.selectedMajors) {
      const id = Number(major.enrollmentPlanId);
      if (!candidateIds.has(id)) {
        throw new BadRequestException('selectedMajors must come from candidateMajorRanking');
      }
      if (selectedIds.has(id)) {
        throw new BadRequestException('selectedMajors cannot contain duplicate majors');
      }
      selectedIds.add(id);
    }

    const selectedMajors = this.normalizeMajorOrder(dto.selectedMajors);
    return {
      recommendedOrder: selectedMajors.map((major) => major.majorName).join('、'),
      fullMajorRanking: {
        strategyVersion: 'major-group-manual-v1',
        acceptAdjust: true,
        selectedMajors,
        candidateMajorRanking: normalizedCandidateMajorRanking,
      },
      acceptAdjust: true,
      isManuallyModified: true,
    };
  }

  async add(planId: number, dto: AddPlanItemDto, actorUserId?: number) {
    const plan = await this.getEditablePlan(planId, actorUserId);

    const softFailReasons = dto.softFailReasons ?? [];
    if (softFailReasons.length > 0 && !dto.softFailOverrideConfirmed) {
      throw new ConflictException('灰色候选项需要老师确认风险后才能加入方案');
    }
    if (!plan.batchConfigId) throw new NotFoundException('方案缺少批次配置');

    const bc = await this.prisma.batchConfig.findUnique({ where: { id: plan.batchConfigId } });
    if (!bc) throw new NotFoundException('批次配置不存在');

    const count = await this.prisma.planItem.count({ where: { planId } });
    if (count >= bc.maxGroupCount) {
      throw new ConflictException(`已达到上限 ${bc.maxGroupCount} 组`);
    }

    const ep = await this.prisma.enrollmentPlan.findUnique({
      where: { id: dto.enrollmentPlanId },
      include: { university: true, major: true },
    });
    if (!ep) throw new NotFoundException('招生计划不存在');

    const duplicateGroup = await this.prisma.planItem.findFirst({
      where: {
        planId,
        universityId: ep.universityId,
        groupCode: ep.groupCode,
      },
    });
    if (duplicateGroup) {
      throw new ConflictException(
        `该方案已包含 ${ep.university.name} 专业组 ${ep.groupCode || '-'}，不可重复加入同一专业组`,
      );
    }

    // 录取快照: 先按专业全键匹配; miss 时回退同组任意行的组线 —— 提前批/专项的
    // admission_records 普遍只有组级线, 不回退会让快照(score25Group/rank25Group)落空,
    // 方案详情页与导出表对家长展示就没有任何历史线参考
    const arKey = {
      universityId: ep.universityId,
      subjects: ep.subjects,
      batch: ep.batch,
      recruitType: ep.recruitType,
      groupCode: ep.groupCode,
    };
    const arExact = await this.prisma.admissionRecord.findFirst({
      where: { ...arKey, majorCode: ep.majorCode, majorName: ep.majorName, year: 2025 },
    });
    // 组级回退行只可信组级字段; 专业级字段(score25Major)仅取精确匹配行
    const arGroup = arExact ?? await this.prisma.admissionRecord.findFirst({
      where: { ...arKey, year: 2025, groupMinRank: { not: null } },
    });
    const ar24 = await this.prisma.admissionRecord.findFirst({
      where: { ...arKey, majorCode: ep.majorCode, majorName: ep.majorName, year: 2024 },
    });

    const student = await this.prisma.studentProfile.findUnique({ where: { id: plan.studentId } });
    const rawRank = student?.provincialRank ?? 999999;
    // 落库梯度与候选管线同口径: 已确认政策加分参与投档, 用 裸分+加分 换算有效位次
    let studentRank = rawRank;
    const bonus = confirmedBonusPoints(student as any);
    const subjectsLabel = EXAM_TYPE_TO_SUBJECTS[(student as any)?.examType ?? ''];
    if (bonus > 0 && this.scoreSegment && subjectsLabel && typeof student?.totalScore === 'number') {
      try {
        const adjusted = await this.scoreSegment.scoreToRank(2025, subjectsLabel as any, student.totalScore + bonus);
        if (typeof adjusted.rank === 'number' && adjusted.rank > 0 && adjusted.rank < studentRank) {
          studentRank = adjusted.rank;
        }
      } catch {
        // 一分一段缺数据时保持裸分位次
      }
    }
    const historyMin = arGroup?.groupMinRank ?? arExact?.majorMinRank ?? null;
    // 无任何历史线的组(提前批新设定向组等)落库默认 CHONG: 它是录取概率未知的机会组,
    // calcGradient 的 BAO 兜底会让方案右栏/导出表把它当保底误导家长
    const gradient = dto.gradient ?? (historyMin ? calcGradient(studentRank, historyMin) : 'CHONG');
    const groupMajorsList = (ep.groupMajors ?? '').split(/[,，、/]/).filter(Boolean);
    const selectedMajors = (dto.selectedMajors ?? []).slice(0, 6);
    const fullMajorRanking = selectedMajors.length > 0
      ? {
          strategyVersion: 'major-group-fill-v1',
          acceptAdjust: true,
          selectedMajors,
          candidateMajorRanking: dto.candidateMajorRanking ?? selectedMajors,
        }
      : undefined;

    // sequence 取 max+1 而非 count+1: 删除会留下空洞, count+1 会撞 (planId, sequence) 唯一约束
    const maxSeq = await this.prisma.planItem.aggregate({
      where: { planId },
      _max: { sequence: true },
    });

    let created;
    try {
      created = await this.prisma.planItem.create({
      data: {
        planId,
        sequence: dto.sequence ?? (maxSeq._max.sequence ?? 0) + 1,
        gradient,
        universityId: ep.universityId,
        universityName: ep.university.name,
        universityCode: ep.university.code,
        groupCode: ep.groupCode,
        groupName: ep.groupName,
        majorId: ep.majorId,
        majorName: ep.majorName,
        majorCode: ep.majorCode,
        anchorMajor: ep.majorName,
        groupMajorCount: groupMajorsList.length,
        recommendedOrder: selectedMajors.length > 0
          ? selectedMajors.map((major) => major.majorName).join('、')
          : undefined,
        fullMajorRanking: fullMajorRanking as any,
        subjectRequirement: ep.subjectRequirements,
        acceptAdjust: selectedMajors.length > 0 ? true : dto.acceptAdjust ?? true,
        score25Group: arGroup?.groupMinScore ?? null,
        rank25Group: arGroup?.groupMinRank ?? null,
        score25Major: arExact?.majorMinScore ?? null,
        rank25Major: arExact?.majorMinRank ?? null,
        score24Major: ar24?.majorMinScore ?? null,
        rank24Major: ar24?.majorMinRank ?? null,
        planCount: ep.planCount,
        tuition: ep.tuition,
        selectionReason: dto.selectionReason ?? null,
        overrideSoftFail: softFailReasons.length > 0,
        softFailReasons: softFailReasons.length > 0 ? (softFailReasons as any) : undefined,
        overrideReason: dto.overrideReason ?? null,
      },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('志愿顺位冲突,请刷新页面后重试');
      }
      throw e;
    }
    // 触发风险重算(非阻塞)
    this.riskEngine.recomputeForPlan(planId).catch(() => {});
    return created;
  }

  async update(planId: number, itemId: number, dto: UpdatePlanItemDto, actorUserId?: number) {
    const isMajorSelectionUpdate = dto.selectedMajors !== undefined;
    const plan = await this.getEditablePlan(planId, actorUserId, {
      majorSelectionOnly: isMajorSelectionUpdate,
    });
    const item = await this.prisma.planItem.findUnique({ where: { id: itemId } });
    if (!item || item.planId !== planId) throw new NotFoundException('志愿项不存在');

    const { selectedMajors, candidateMajorRanking, ...legacyDto } = dto;
    if (candidateMajorRanking !== undefined && selectedMajors === undefined) {
      throw new BadRequestException('selectedMajors is required when candidateMajorRanking is provided');
    }
    const majorSelectionUpdate = this.buildMajorSelectionUpdate(item, dto);
    const itemUpdate = this.prisma.planItem.update({
      where: { id: itemId },
      data: majorSelectionUpdate ?? { ...legacyDto, isManuallyModified: true },
    });

    let result: any;
    if (majorSelectionUpdate && plan.status === 'PENDING_REVIEW') {
      const [updated] = await this.prisma.$transaction([
        itemUpdate,
        this.prisma.volunteerPlan.update({
          where: { id: planId },
          data: { status: 'DRAFT', currentReviewerId: null },
        }),
      ]);
      result = updated;
    } else {
      result = await itemUpdate;
    }
    // 触发风险重算(非阻塞)
    this.riskEngine.recomputeForPlan(planId).catch(() => {});
    return result;
  }

  async remove(planId: number, itemId: number, actorUserId?: number) {
    await this.getEditablePlan(planId, actorUserId);
    const item = await this.prisma.planItem.findUnique({ where: { id: itemId } });
    if (!item || item.planId !== planId) throw new NotFoundException('志愿项不存在');
    const deleted = await this.prisma.planItem.delete({ where: { id: itemId } });
    // 触发风险重算(非阻塞)
    this.riskEngine.recomputeForPlan(planId).catch(() => {});
    return deleted;
  }

  async reorder(planId: number, itemIds: number[], actorUserId?: number) {
    await this.getEditablePlan(planId, actorUserId);
    const count = await this.prisma.planItem.count({
      where: { planId, id: { in: itemIds } },
    });
    if (count !== itemIds.length) throw new NotFoundException('志愿项不存在');
    // 注意: PlanItem 有 @@unique([planId, sequence]) 复合唯一约束。
    // 直接逐条 update 到目标 sequence 会触发中间状态冲突 (例如把第 1 位换到第 2 位时,
    // 第一次 update 让两条记录同时拥有 sequence=2 ↘ unique violation)。
    // 两阶段提交: phase1 全部置为负数避让, phase2 再写入目标 sequence。
    await this.prisma.$transaction([
      ...itemIds.map((id, idx) =>
        this.prisma.planItem.update({ where: { id }, data: { sequence: -(idx + 1) } }),
      ),
      ...itemIds.map((id, idx) =>
        this.prisma.planItem.update({ where: { id }, data: { sequence: idx + 1 } }),
      ),
    ]);
    // 触发风险重算(非阻塞)
    this.riskEngine.recomputeForPlan(planId).catch(() => {});
    return { ok: true, count: itemIds.length };
  }
}
