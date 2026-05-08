import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanV2Dto } from './dto/create-plan-v2.dto';
import { PlanStateMachineService } from './plan-state-machine.service';

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
}
