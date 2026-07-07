export const BLOCKING_RISK_RULE_CODES = new Set([
  'SUBJECT_MISMATCH',
  'COLOR_BLIND_RESTRICTION',
  'ZERO_PLAN_COUNT',
  'BODY_CONDITION_RESTRICTION',
  'DIRECTIONAL_QUALIFICATION_MISMATCH',
  'BATCH_QUALIFICATION_MISMATCH',
  'POLICY_QUALIFICATION_MISMATCH',
]);

export function isBlockingRisk(ruleCode: string) {
  return BLOCKING_RISK_RULE_CODES.has(ruleCode);
}

export function normalizeRiskSeverity(
  ruleCode: string,
  severity: 'critical' | 'moderate' | 'minor' | string,
) {
  if (severity === 'critical' && !isBlockingRisk(ruleCode)) {
    return 'moderate';
  }
  return severity;
}

export function riskIdentityKey(risk: {
  planItemId: number;
  ruleCode: string;
  message: string;
}) {
  return `${risk.planItemId}:${risk.ruleCode}:${risk.message}`;
}
