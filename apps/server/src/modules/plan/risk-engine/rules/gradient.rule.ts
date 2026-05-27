import { RiskRule, RiskFinding, RuleContext } from '../risk-rule.interface';

function getHistScore(item: any): number | null {
  if (item?.score25Major != null) return item.score25Major;
  if (item?.score25Group != null) return item.score25Group;
  if (item?.score24Major != null) return item.score24Major;
  if (item?.lastYearMinScore != null) return item.lastYearMinScore;
  return null;
}

export const FillDifferenceRule: RiskRule = {
  ruleCode: 'FILL_DIFF_TOO_HIGH',
  category: 'gradient',
  evaluate(ctx) {
    const findings: RiskFinding[] = [];
    const studentScore = ctx.student?.totalScore;
    if (typeof studentScore !== 'number') return findings;
    if (ctx.item?.gradient !== 'CHONG') return findings;
    const hist = getHistScore(ctx.item);
    if (hist == null) return findings;

    const diff = studentScore - hist;
    if (diff < -15) {
      findings.push({
        ruleCode: 'FILL_DIFF_TOO_HIGH',
        severity: 'critical',
        category: 'gradient',
        message: `冲分差 ${Math.abs(diff)} 分,过激进可能录不上`,
        detail: { studentScore, hist, diff },
      });
    } else if (diff < -7) {
      findings.push({
        ruleCode: 'FILL_DIFF_TOO_HIGH',
        severity: 'moderate',
        category: 'gradient',
        message: `冲分差 ${Math.abs(diff)} 分,偏激进`,
        detail: { studentScore, hist, diff },
      });
    }
    return findings;
  },
};

export const StableDifferenceRule: RiskRule = {
  ruleCode: 'STABLE_DIFF_TOO_SMALL',
  category: 'gradient',
  evaluate(ctx) {
    const findings: RiskFinding[] = [];
    const studentScore = ctx.student?.totalScore;
    if (typeof studentScore !== 'number') return findings;
    if (ctx.item?.gradient !== 'WEN') return findings;
    const hist = getHistScore(ctx.item);
    if (hist == null) return findings;

    const diff = studentScore - hist;
    if (diff < 2) {
      findings.push({
        ruleCode: 'STABLE_DIFF_TOO_SMALL',
        severity: 'moderate',
        category: 'gradient',
        message: `稳分差 ${diff} 分,不够稳可能滑档`,
        detail: { studentScore, hist, diff },
      });
    }
    return findings;
  },
};

export const SafeDifferenceRule: RiskRule = {
  ruleCode: 'SAFE_DIFF_TOO_SMALL',
  category: 'gradient',
  evaluate(ctx) {
    const findings: RiskFinding[] = [];
    const studentScore = ctx.student?.totalScore;
    if (typeof studentScore !== 'number') return findings;
    if (ctx.item?.gradient !== 'BAO') return findings;
    const hist = getHistScore(ctx.item);
    if (hist == null) return findings;

    const diff = studentScore - hist;
    if (diff < 2) {
      findings.push({
        ruleCode: 'SAFE_DIFF_TOO_SMALL',
        severity: 'moderate',
        category: 'gradient',
        message: `保分差 ${diff} 分,保底也不够安全`,
        detail: { studentScore, hist, diff },
      });
    }
    return findings;
  },
};

export const GradientRules: RiskRule[] = [
  FillDifferenceRule,
  StableDifferenceRule,
  SafeDifferenceRule,
];
