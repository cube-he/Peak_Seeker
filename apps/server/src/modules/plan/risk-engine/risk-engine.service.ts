import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RiskFinding, RuleContext, RiskRule } from './risk-rule.interface';
import { QualificationRules } from './rules/qualification.rule';

@Injectable()
export class RiskEngineService {
  private readonly rules: RiskRule[] = [
    ...QualificationRules,
  ];

  constructor(private prisma: PrismaService) {}

  evaluate(ctx: RuleContext): RiskFinding[] {
    const findings: RiskFinding[] = [];
    for (const rule of this.rules) {
      try {
        const r = rule.evaluate(ctx);
        findings.push(...r);
      } catch {
        // 单条规则失败不影响其它规则
      }
    }
    return findings;
  }

  async recomputeForPlan(planId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: {
        student: true,
        planItems: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!plan) return { evaluated: 0, totalFindings: 0 };

    const allItems = plan.planItems;
    const itemIds = allItems.map((i) => i.id);

    await this.prisma.planItemRisk.deleteMany({
      where: { planItemId: { in: itemIds }, resolvedAt: null },
    });

    let totalFindings = 0;
    for (const item of allItems) {
      const ctx: RuleContext = {
        item,
        allItems,
        student: plan.student,
        plan: { id: plan.id, status: plan.status, batchName: plan.batchName },
      };
      const findings = this.evaluate(ctx);
      if (findings.length > 0) {
        await this.prisma.planItemRisk.createMany({
          data: findings.map((f) => ({
            planItemId: item.id,
            ruleCode: f.ruleCode,
            severity: f.severity,
            category: f.category,
            message: f.message,
            detail: (f.detail ?? null) as Prisma.InputJsonValue | null,
          })) as any,
        });
        totalFindings += findings.length;
      }
    }

    return { evaluated: allItems.length, totalFindings };
  }

  async getPlanRisks(planId: number) {
    return this.prisma.planItemRisk.findMany({
      where: {
        planItem: { planId },
      },
      include: { planItem: { select: { sequence: true, universityName: true, majorName: true } } },
      orderBy: [{ severity: 'asc' }, { id: 'asc' }],
    });
  }

  async countByPlan(planId: number) {
    const risks = await this.prisma.planItemRisk.findMany({
      where: { planItem: { planId }, resolvedAt: null },
      select: { severity: true },
    });
    const counts: Record<string, number> = { critical: 0, moderate: 0, minor: 0 };
    for (const r of risks) {
      counts[r.severity] = (counts[r.severity] ?? 0) + 1;
    }
    return counts as { critical: number; moderate: number; minor: number };
  }

  async resolve(
    userId: number,
    riskId: number,
    resolution: 'accepted' | 'replaced' | 'ignored',
    note?: string,
  ) {
    return this.prisma.planItemRisk.update({
      where: { id: riskId },
      data: {
        resolvedAt: new Date(),
        resolvedById: userId,
        resolution,
        resolverNote: note,
      },
    });
  }
}
