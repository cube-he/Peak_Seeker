import { RiskFinding, RiskRule } from '../risk-rule.interface';

type HistScore = {
  score: number;
  source: 'group25' | 'major25' | 'major24' | 'legacy';
  label: string;
};

function getHistScore(item: any): HistScore | null {
  if (item?.score25Group != null) {
    return { score: item.score25Group, source: 'group25', label: '专业组线' };
  }
  if (item?.score25Major != null) {
    return { score: item.score25Major, source: 'major25', label: '专业线' };
  }
  if (item?.score24Major != null) {
    return { score: item.score24Major, source: 'major24', label: '2024专业线' };
  }
  if (item?.lastYearMinScore != null) {
    return { score: item.lastYearMinScore, source: 'legacy', label: '历史线' };
  }
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

    const diff = studentScore - hist.score;
    if (diff < -15) {
      findings.push({
        ruleCode: 'FILL_DIFF_TOO_HIGH',
        severity: 'moderate',
        category: 'gradient',
        message: `冲分差 ${Math.abs(diff)} 分(${hist.label}),过激进可能录不上`,
        detail: { studentScore, hist: hist.score, diff, scoreSource: hist.source },
      });
    } else if (diff < -7) {
      findings.push({
        ruleCode: 'FILL_DIFF_TOO_HIGH',
        severity: 'moderate',
        category: 'gradient',
        message: `冲分差 ${Math.abs(diff)} 分(${hist.label}),偏激进`,
        detail: { studentScore, hist: hist.score, diff, scoreSource: hist.source },
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

    const diff = studentScore - hist.score;
    if (diff < 2) {
      findings.push({
        ruleCode: 'STABLE_DIFF_TOO_SMALL',
        severity: 'moderate',
        category: 'gradient',
        message: `稳分差 ${diff} 分(${hist.label}),不够稳可能滑档`,
        detail: { studentScore, hist: hist.score, diff, scoreSource: hist.source },
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

    const diff = studentScore - hist.score;
    if (diff < 2) {
      findings.push({
        ruleCode: 'SAFE_DIFF_TOO_SMALL',
        severity: 'moderate',
        category: 'gradient',
        message: `保分差 ${diff} 分(${hist.label}),保底也不够安全`,
        detail: { studentScore, hist: hist.score, diff, scoreSource: hist.source },
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
