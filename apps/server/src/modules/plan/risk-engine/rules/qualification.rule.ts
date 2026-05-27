import { RiskRule, RiskFinding, RuleContext } from '../risk-rule.interface';

export const SubjectMismatchRule: RiskRule = {
  ruleCode: 'SUBJECT_MISMATCH',
  category: 'qualification',
  evaluate(ctx) {
    const findings: RiskFinding[] = [];
    const required = ctx.item?.subjectRequirement;
    const studentExamType = ctx.student?.examType;
    const studentReChoices = Array.isArray(ctx.student?.reChoices) ? ctx.student.reChoices : [];

    if (!required) return findings;
    if (!studentExamType) return findings;

    const studentSubjects = new Set<string>();
    if (studentExamType === 'PHYSICS') studentSubjects.add('物理');
    else if (studentExamType === 'HISTORY') studentSubjects.add('历史');
    for (const c of studentReChoices) studentSubjects.add(c);

    const candidates = ['物理', '历史', '化学', '生物', '地理', '政治'];
    const missing = candidates.filter(
      (s) => required.includes(s) && !studentSubjects.has(s),
    );
    if (missing.length > 0) {
      findings.push({
        ruleCode: 'SUBJECT_MISMATCH',
        severity: 'critical',
        category: 'qualification',
        message: `选科不符:该专业要求 ${required},学生未选 ${missing.join('、')}`,
        detail: { required, studentSubjects: Array.from(studentSubjects), missing },
      });
    }
    return findings;
  },
};

export const ColorBlindRule: RiskRule = {
  ruleCode: 'COLOR_BLIND_RESTRICTION',
  category: 'qualification',
  evaluate(ctx) {
    const findings: RiskFinding[] = [];
    const warning = ctx.item?.riskWarning ?? '';
    const studentColorBlind = ctx.student?.colorBlind === true;
    const studentColorWeak = ctx.student?.colorWeak === true;

    if (studentColorBlind && warning.includes('色盲')) {
      findings.push({
        ruleCode: 'COLOR_BLIND_RESTRICTION',
        severity: 'critical',
        category: 'qualification',
        message: '该专业不招色盲考生,但学生标记色盲',
        detail: { warning },
      });
    }
    if (studentColorWeak && warning.includes('色弱')) {
      findings.push({
        ruleCode: 'COLOR_BLIND_RESTRICTION',
        severity: 'critical',
        category: 'qualification',
        message: '该专业不招色弱考生,但学生标记色弱',
        detail: { warning },
      });
    }
    return findings;
  },
};

export const MissingHistoricalDataRule: RiskRule = {
  ruleCode: 'MISSING_HISTORICAL_DATA',
  category: 'qualification',
  evaluate(ctx) {
    const findings: RiskFinding[] = [];
    const has25Major = ctx.item?.score25Major != null;
    const has25Group = ctx.item?.score25Group != null;
    const has24Major = ctx.item?.score24Major != null;
    const hasLegacy = ctx.item?.lastYearMinScore != null;
    if (!has25Major && !has25Group && !has24Major && !hasLegacy) {
      findings.push({
        ruleCode: 'MISSING_HISTORICAL_DATA',
        severity: 'critical',
        category: 'qualification',
        message: '历史无录取数据,无法评估梯度合理性',
        detail: { itemId: ctx.item?.id },
      });
    }
    return findings;
  },
};

export const ZeroPlanCountRule: RiskRule = {
  ruleCode: 'ZERO_PLAN_COUNT',
  category: 'qualification',
  evaluate(ctx) {
    const findings: RiskFinding[] = [];
    if (ctx.item?.planCount === 0) {
      findings.push({
        ruleCode: 'ZERO_PLAN_COUNT',
        severity: 'critical',
        category: 'qualification',
        message: '该专业今年招生计划为 0(可能停招)',
        detail: { planCount: 0 },
      });
    }
    return findings;
  },
};

export const QualificationRules: RiskRule[] = [
  SubjectMismatchRule,
  ColorBlindRule,
  MissingHistoricalDataRule,
  ZeroPlanCountRule,
];
