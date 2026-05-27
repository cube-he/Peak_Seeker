import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { AddPlanItemDto } from './dto/add-plan-item.dto';
import { UpdatePlanItemDto } from './dto/update-plan-item.dto';
import { calcGradient } from '../plan-candidate/gradient-calculator';
import { RiskEngineService } from './risk-engine/risk-engine.service';

@Injectable()
export class PlanItemService {
  constructor(
    private prisma: PrismaService,
    private sm: PlanStateMachineService,
    private riskEngine: RiskEngineService,
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

    const ar = await this.prisma.admissionRecord.findFirst({
      where: {
        universityId: ep.universityId,
        subjects: ep.subjects,
        batch: ep.batch,
        recruitType: ep.recruitType,
        groupCode: ep.groupCode,
        majorCode: ep.majorCode,
        majorName: ep.majorName,
        year: 2025,
      },
    });
    const ar24 = await this.prisma.admissionRecord.findFirst({
      where: {
        universityId: ep.universityId,
        subjects: ep.subjects,
        batch: ep.batch,
        recruitType: ep.recruitType,
        groupCode: ep.groupCode,
        majorCode: ep.majorCode,
        majorName: ep.majorName,
        year: 2024,
      },
    });

    const student = await this.prisma.studentProfile.findUnique({ where: { id: plan.studentId } });
    const studentRank = student?.provincialRank ?? 999999;
    const historyMin = ar?.groupMinRank ?? ar?.majorMinRank ?? null;
    const gradient = dto.gradient ?? calcGradient(studentRank, historyMin);
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

    const created = await this.prisma.planItem.create({
      data: {
        planId,
        sequence: dto.sequence ?? count + 1,
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
        score25Group: ar?.groupMinScore ?? null,
        rank25Group: ar?.groupMinRank ?? null,
        score25Major: ar?.majorMinScore ?? null,
        rank25Major: ar?.majorMinRank ?? null,
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
    await this.prisma.$transaction(
      itemIds.map((id, idx) =>
        this.prisma.planItem.update({ where: { id }, data: { sequence: idx + 1 } }),
      ),
    );
    // 触发风险重算(非阻塞)
    this.riskEngine.recomputeForPlan(planId).catch(() => {});
    return { ok: true, count: itemIds.length };
  }
}
