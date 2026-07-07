export type PlanRisk = {
  id: number;
  planItemId?: number;
  ruleCode: string;
  severity: 'critical' | 'moderate' | 'minor';
  category: string;
  message: string;
  resolvedAt: string | null;
  isBlocking?: boolean;
  duplicateCount?: number;
  planItem?: { sequence: number; universityName: string; majorName: string };
};

const BLOCKING_RISK_RULE_CODES = new Set([
  'SUBJECT_MISMATCH',
  'COLOR_BLIND_RESTRICTION',
  'ZERO_PLAN_COUNT',
  'BODY_CONDITION_RESTRICTION',
  'DIRECTIONAL_QUALIFICATION_MISMATCH',
  'BATCH_QUALIFICATION_MISMATCH',
  'POLICY_QUALIFICATION_MISMATCH',
]);

export function isBlockingPlanRisk(risk: Pick<PlanRisk, 'ruleCode' | 'isBlocking'>) {
  return risk.isBlocking === true || BLOCKING_RISK_RULE_CODES.has(risk.ruleCode);
}

export function summarizePlanRisks(risks: PlanRisk[] | undefined) {
  const unresolved = Array.isArray(risks) ? risks.filter((risk) => !risk.resolvedAt) : [];
  const blocking = unresolved.filter(isBlockingPlanRisk);
  const soft = unresolved.filter((risk) => !isBlockingPlanRisk(risk));
  return {
    unresolvedCount: unresolved.length,
    blockingCount: blocking.length,
    softCount: soft.length,
    blocking,
    soft,
  };
}
