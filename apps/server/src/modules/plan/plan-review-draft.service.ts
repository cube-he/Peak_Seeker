import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertReviewDraftDto } from './dto/upsert-review-draft.dto';

@Injectable()
export class PlanReviewDraftService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取当前用户对该方案的审核草稿。
   * 不存在则返回 null(不是 404)——前端拿到 null 直接走"空草稿"路径。
   */
  async getDraft(planId: number, reviewerId: number) {
    await this.assertPlanExists(planId);
    return this.prisma.planReviewDraft.findUnique({
      where: { planId_reviewerId: { planId, reviewerId } },
    });
  }

  /**
   * Upsert 草稿。前端 debounce 后调用,频率约每 800ms 一次。
   * 只更新 dto 中显式提供的字段(未提供的保留旧值由 Prisma upsert 语义保证)。
   */
  async upsertDraft(planId: number, reviewerId: number, dto: UpsertReviewDraftDto) {
    await this.assertPlanExists(planId);

    const itemAnnotations = dto.itemAnnotations as unknown as Prisma.InputJsonValue | undefined;

    return this.prisma.planReviewDraft.upsert({
      where: { planId_reviewerId: { planId, reviewerId } },
      create: { planId, reviewerId, comment: dto.comment, itemAnnotations },
      update: { comment: dto.comment, itemAnnotations },
    });
  }

  /**
   * 清空草稿。审核动作提交成功后由 PlanService.reviewPlan 事务内调用。
   * 用 deleteMany 而非 delete,缺失时静默通过(idempotent)。
   */
  async clearDraft(planId: number, reviewerId: number) {
    await this.prisma.planReviewDraft.deleteMany({
      where: { planId, reviewerId },
    });
  }

  private async assertPlanExists(planId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('方案不存在');
  }
}
