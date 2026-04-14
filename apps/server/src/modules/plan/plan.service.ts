import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlanService {
  constructor(private prisma: PrismaService) {}

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

  async toggleFavorite(id: number, userId: number) {
    const plan = await this.findById(id, userId);

    return this.prisma.volunteerPlan.update({
      where: { id },
      data: {
        isFavorite: !plan.isFavorite,
      },
    });
  }
}
