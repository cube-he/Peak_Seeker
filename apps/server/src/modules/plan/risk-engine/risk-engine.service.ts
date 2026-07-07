import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RiskFinding, RuleContext, RiskRule } from './risk-rule.interface';
import { QualificationRules } from './rules/qualification.rule';
import { GradientRules } from './rules/gradient.rule';
import { confirmedBonusPoints } from '../../policy/bonus-points.util';
import { isBlockingRisk, normalizeRiskSeverity, riskIdentityKey } from './risk-classification';

@Injectable()
export class RiskEngineService {
  private readonly rules: RiskRule[] = [
    ...QualificationRules,
    ...GradientRules,
  ];

  private readonly recomputeQueues = new Map<number, Promise<unknown>>();

  constructor(private prisma: PrismaService) {}

  evaluate(ctx: RuleContext): RiskFinding[] {
    const findings: RiskFinding[] = [];
    for (const rule of this.rules) {
      try {
        findings.push(...rule.evaluate(ctx));
      } catch {
        // A single failed rule should not stop the rest of the risk check.
      }
    }
    return findings;
  }

  async recomputeForPlan(planId: number) {
    const previous = this.recomputeQueues.get(planId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.doRecomputeForPlan(planId));

    const queued = next.finally(() => {
      if (this.recomputeQueues.get(planId) === queued) {
        this.recomputeQueues.delete(planId);
      }
    });
    this.recomputeQueues.set(planId, queued);

    return next;
  }

  private async doRecomputeForPlan(planId: number) {
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

    const bonusPoints = confirmedBonusPoints(plan.student as any);
    const studentForRules =
      bonusPoints > 0 && typeof (plan.student as any)?.totalScore === 'number'
        ? { ...plan.student, totalScore: (plan.student as any).totalScore + bonusPoints }
        : plan.student;

    const riskRows: Prisma.PlanItemRiskCreateManyInput[] = [];
    for (const item of allItems) {
      const ctx: RuleContext = {
        item,
        allItems,
        student: studentForRules,
        plan: { id: plan.id, status: plan.status, batchName: plan.batchName },
      };

      const uniqueFindings = new Map<string, RiskFinding>();
      for (const finding of this.evaluate(ctx)) {
        uniqueFindings.set(`${finding.ruleCode}:${finding.message}`, finding);
      }

      for (const finding of uniqueFindings.values()) {
        riskRows.push({
          planItemId: item.id,
          ruleCode: finding.ruleCode,
          severity: normalizeRiskSeverity(finding.ruleCode, finding.severity),
          category: finding.category,
          message: finding.message,
          detail: (finding.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.planItemRisk.deleteMany({
        where: { planItemId: { in: itemIds }, resolvedAt: null },
      });

      if (riskRows.length > 0) {
        await tx.planItemRisk.createMany({ data: riskRows });
      }
    });

    return { evaluated: allItems.length, totalFindings: riskRows.length };
  }

  async getPlanRisks(planId: number) {
    const risks = await this.prisma.planItemRisk.findMany({
      where: { planItem: { planId } },
      include: { planItem: { select: { sequence: true, universityName: true, majorName: true } } },
      orderBy: [{ severity: 'asc' }, { id: 'asc' }],
    });

    const byKey = new Map<string, any>();
    for (const risk of risks) {
      const normalized = {
        ...risk,
        severity: normalizeRiskSeverity(risk.ruleCode, risk.severity),
        isBlocking: isBlockingRisk(risk.ruleCode),
        duplicateCount: 1,
      };
      const key = riskIdentityKey(risk);
      const existing = byKey.get(key);
      if (existing) {
        existing.duplicateCount += 1;
      } else {
        byKey.set(key, normalized);
      }
    }

    return [...byKey.values()];
  }

  async countByPlan(planId: number) {
    const risks = await this.prisma.planItemRisk.findMany({
      where: { planItem: { planId }, resolvedAt: null },
      select: { planItemId: true, severity: true, ruleCode: true, message: true },
    });
    const counts: Record<string, number> = { critical: 0, moderate: 0, minor: 0 };
    const seen = new Set<string>();

    for (const risk of risks) {
      const key = riskIdentityKey(risk);
      if (seen.has(key)) continue;
      seen.add(key);

      if (isBlockingRisk(risk.ruleCode)) {
        counts.critical += 1;
        continue;
      }

      const severity = normalizeRiskSeverity(risk.ruleCode, risk.severity);
      counts[severity] = (counts[severity] ?? 0) + 1;
    }

    return counts as { critical: number; moderate: number; minor: number };
  }

  async resolve(
    userId: number,
    riskId: number,
    resolution: 'accepted' | 'replaced' | 'ignored',
    note?: string,
  ) {
    await this.assertCanAccessRisk(userId, riskId);
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

  private async assertCanAccessRisk(userId: number, riskId: number) {
    const risk = await this.prisma.planItemRisk.findUnique({
      where: { id: riskId },
      include: {
        planItem: {
          include: {
            plan: {
              include: { student: { select: { userId: true } } },
            },
          },
        },
      },
    });
    if (!risk) throw new NotFoundException('风险不存在');

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { isSupervisor: true },
    });
    const plan = risk.planItem.plan;
    const canAccess =
      profile?.isSupervisor ||
      plan.createdById === userId ||
      plan.student?.userId === userId;
    if (!canAccess) throw new ForbiddenException('无权处理该风险');
  }
}
