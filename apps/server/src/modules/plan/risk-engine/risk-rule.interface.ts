export type RiskSeverity = 'critical' | 'moderate' | 'minor';
export type RiskCategory = 'qualification' | 'gradient' | 'volatility' | 'concentration';

export interface RiskFinding {
  ruleCode: string;
  severity: RiskSeverity;
  category: RiskCategory;
  message: string;
  detail?: Record<string, unknown>;
}

export interface RuleContext {
  item: any;
  allItems: any[];
  student: any;
  plan: any;
}

export interface RiskRule {
  ruleCode: string;
  category: RiskCategory;
  evaluate(ctx: RuleContext): RiskFinding[];
}
