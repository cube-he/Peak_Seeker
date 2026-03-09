import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlanService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, dto: CreatePlanDto) {
    return this.prisma.volunteerPlan.create({
      data: {
        userId,
        name: dto.name,
        year: dto.year,
        province: dto.province,
        items: dto.items,
        strategy: dto.strategy,
        notes: dto.notes,
      },
    });
  }

  async findAll(userId: number) {
    return this.prisma.volunteerPlan.findMany({
      where: { userId },
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

    if (plan.userId !== userId) {
      throw new ForbiddenException('无权访问此方案');
    }

    return plan;
  }

  async update(id: number, userId: number, dto: UpdatePlanDto) {
    await this.findById(id, userId);

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.items !== undefined) data.items = dto.items;
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
