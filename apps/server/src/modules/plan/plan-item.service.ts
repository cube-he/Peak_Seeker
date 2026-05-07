import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { AddPlanItemDto } from './dto/add-plan-item.dto';
import { UpdatePlanItemDto } from './dto/update-plan-item.dto';
import { calcGradient } from '../plan-candidate/gradient-calculator';

@Injectable()
export class PlanItemService {
  constructor(private prisma: PrismaService, private sm: PlanStateMachineService) {}

  async add(planId: number, dto: AddPlanItemDto) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!this.sm.canEditItems(plan.status)) {
      throw new ConflictException(`方案状态 ${plan.status} 不允许编辑`);
    }
    if (!plan.batchConfigId) throw new NotFoundException('方案缺少批次配置');

    const bc = await this.prisma.batchConfig.findUnique({ where: { id: plan.batchConfigId } });
    if (!bc) throw new NotFoundException('批次配置不存在');

    const count = await this.prisma.planItem.count({ where: { planId } });
    if (count >= bc.maxGroupCount) {
      throw new ConflictException(`已达上限 ${bc.maxGroupCount} 组`);
    }

    const ep = await this.prisma.enrollmentPlan.findUnique({
      where: { id: dto.enrollmentPlanId },
      include: { university: true, major: true },
    });
    if (!ep) throw new NotFoundException('招生计划不存在');

    const ar = await this.prisma.admissionRecord.findFirst({
      where: {
        universityId: ep.universityId, subjects: ep.subjects, batch: ep.batch,
        recruitType: ep.recruitType, groupCode: ep.groupCode,
        majorCode: ep.majorCode, majorName: ep.majorName, year: 2025,
      },
    });
    const ar24 = await this.prisma.admissionRecord.findFirst({
      where: {
        universityId: ep.universityId, subjects: ep.subjects, batch: ep.batch,
        recruitType: ep.recruitType, groupCode: ep.groupCode,
        majorCode: ep.majorCode, majorName: ep.majorName, year: 2024,
      },
    });

    const student = await this.prisma.studentProfile.findUnique({ where: { id: plan.studentId } });
    const studentRank = student?.provincialRank ?? 999999;
    const historyMin = ar?.groupMinRank ?? ar?.majorMinRank ?? null;
    const gradient = dto.gradient ?? calcGradient(studentRank, historyMin);

    const groupMajorsList = (ep.groupMajors ?? '').split(/[,，]/).filter(Boolean);

    return this.prisma.planItem.create({
      data: {
        planId, sequence: dto.sequence ?? count + 1, gradient,
        universityId: ep.universityId, universityName: ep.university.name, universityCode: ep.university.code,
        groupCode: ep.groupCode, groupName: ep.groupName,
        majorId: ep.majorId, majorName: ep.majorName, majorCode: ep.majorCode,
        anchorMajor: ep.majorName, groupMajorCount: groupMajorsList.length,
        subjectRequirement: ep.subjectRequirements,
        acceptAdjust: dto.acceptAdjust ?? true,
        score25Group: ar?.groupMinScore ?? null, rank25Group: ar?.groupMinRank ?? null,
        score25Major: ar?.majorMinScore ?? null, rank25Major: ar?.majorMinRank ?? null,
        score24Major: ar24?.majorMinScore ?? null, rank24Major: ar24?.majorMinRank ?? null,
        planCount: ep.planCount, tuition: ep.tuition,
        selectionReason: dto.selectionReason ?? null,
      },
    });
  }

  async update(planId: number, itemId: number, dto: UpdatePlanItemDto) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!this.sm.canEditItems(plan.status)) throw new ConflictException(`方案状态 ${plan.status} 不允许编辑`);
    const item = await this.prisma.planItem.findUnique({ where: { id: itemId } });
    if (!item || item.planId !== planId) throw new NotFoundException('志愿项不存在');
    return this.prisma.planItem.update({
      where: { id: itemId },
      data: { ...dto, isManuallyModified: true },
    });
  }

  async remove(planId: number, itemId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!this.sm.canEditItems(plan.status)) throw new ConflictException(`方案状态 ${plan.status} 不允许编辑`);
    return this.prisma.planItem.delete({ where: { id: itemId } });
  }

  async reorder(planId: number, itemIds: number[]) {
    const plan = await this.prisma.volunteerPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    if (!this.sm.canEditItems(plan.status)) throw new ConflictException(`方案状态 ${plan.status} 不允许编辑`);
    await this.prisma.$transaction(
      itemIds.map((id, idx) =>
        this.prisma.planItem.update({ where: { id }, data: { sequence: idx + 1 } }),
      ),
    );
    return { ok: true, count: itemIds.length };
  }
}
