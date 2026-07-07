import {
  SubjectMismatchRule,
  ColorBlindRule,
  MissingHistoricalDataRule,
  ZeroPlanCountRule,
} from './rules/qualification.rule';
import { FillDifferenceRule, StableDifferenceRule, SafeDifferenceRule } from './rules/gradient.rule';
import type { RuleContext } from './risk-rule.interface';
import { isBlockingRisk, normalizeRiskSeverity } from './risk-classification';
import { RiskEngineService } from './risk-engine.service';

const mkCtx = (item: any, student: any = {}): RuleContext => ({
  item,
  allItems: [item],
  student,
  plan: {},
});

describe('Risk classification', () => {
  it('blocks only hard qualification risks', () => {
    expect(isBlockingRisk('SUBJECT_MISMATCH')).toBe(true);
    expect(isBlockingRisk('COLOR_BLIND_RESTRICTION')).toBe(true);
    expect(isBlockingRisk('ZERO_PLAN_COUNT')).toBe(true);
    expect(isBlockingRisk('FILL_DIFF_TOO_HIGH')).toBe(false);
    expect(isBlockingRisk('MISSING_HISTORICAL_DATA')).toBe(false);
  });

  it('downgrades old critical soft-risk rows for submit gating', () => {
    expect(normalizeRiskSeverity('FILL_DIFF_TOO_HIGH', 'critical')).toBe('moderate');
    expect(normalizeRiskSeverity('SUBJECT_MISMATCH', 'critical')).toBe('critical');
  });
});

describe('RiskEngineService submit counts', () => {
  it('dedupes rows and counts only hard risks as critical blockers', async () => {
    const prisma = {
      planItemRisk: {
        findMany: jest.fn().mockResolvedValue([
          { planItemId: 1, ruleCode: 'FILL_DIFF_TOO_HIGH', severity: 'critical', message: '冲分差 20 分' },
          { planItemId: 1, ruleCode: 'FILL_DIFF_TOO_HIGH', severity: 'critical', message: '冲分差 20 分' },
          { planItemId: 2, ruleCode: 'SUBJECT_MISMATCH', severity: 'critical', message: '选科不符' },
        ]),
      },
    };
    const service = new RiskEngineService(prisma as any);

    await expect(service.countByPlan(7)).resolves.toEqual({
      critical: 1,
      moderate: 1,
      minor: 0,
    });
  });
});

describe('Qualification rules', () => {
  describe('SubjectMismatchRule', () => {
    it('flags when student missing required subject', () => {
      const findings = SubjectMismatchRule.evaluate(
        mkCtx(
          { subjectRequirement: '物理+化学' },
          { examType: 'PHYSICS', reChoices: ['生物'] },
        ),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(isBlockingRisk(findings[0].ruleCode)).toBe(true);
    });

    it('passes when subjects match', () => {
      const findings = SubjectMismatchRule.evaluate(
        mkCtx(
          { subjectRequirement: '物理+化学' },
          { examType: 'PHYSICS', reChoices: ['化学'] },
        ),
      );
      expect(findings).toHaveLength(0);
    });

    it('skips when item has no requirement', () => {
      const findings = SubjectMismatchRule.evaluate(
        mkCtx({}, { examType: 'PHYSICS', reChoices: ['化学'] }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe('ColorBlindRule', () => {
    it('flags color blind student for restricted major', () => {
      const findings = ColorBlindRule.evaluate(
        mkCtx({ riskWarning: '色盲色弱不予录取' }, { colorBlind: true }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(isBlockingRisk(findings[0].ruleCode)).toBe(true);
    });

    it('skips non-color-blind student', () => {
      const findings = ColorBlindRule.evaluate(
        mkCtx({ riskWarning: '色盲色弱不予录取' }, { colorBlind: false, colorWeak: false }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe('MissingHistoricalDataRule', () => {
    it('flags missing historical data as a soft risk', () => {
      const findings = MissingHistoricalDataRule.evaluate(mkCtx({}));
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('moderate');
      expect(isBlockingRisk(findings[0].ruleCode)).toBe(false);
    });

    it('passes when has any data', () => {
      const findings = MissingHistoricalDataRule.evaluate(
        mkCtx({ score25Major: 580 }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe('ZeroPlanCountRule', () => {
    it('flags planCount=0 as hard blocking', () => {
      const findings = ZeroPlanCountRule.evaluate(mkCtx({ planCount: 0 }));
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(isBlockingRisk(findings[0].ruleCode)).toBe(true);
    });

    it('passes planCount>0', () => {
      const findings = ZeroPlanCountRule.evaluate(mkCtx({ planCount: 5 }));
      expect(findings).toHaveLength(0);
    });
  });
});

describe('Gradient rules', () => {
  describe('FillDifferenceRule', () => {
    it('uses group line before major line for plan-level score diff', () => {
      const findings = FillDifferenceRule.evaluate(
        mkCtx(
          { gradient: 'CHONG', score25Group: 590, score25Major: 610 },
          { totalScore: 580 },
        ),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].detail).toMatchObject({
        studentScore: 580,
        hist: 590,
        diff: -10,
        scoreSource: 'group25',
      });
      expect(findings[0].message).toContain('专业组线');
    });

    it('moderate when CHONG diff is very aggressive', () => {
      const findings = FillDifferenceRule.evaluate(
        mkCtx({ gradient: 'CHONG', score25Major: 600 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('moderate');
      expect(isBlockingRisk(findings[0].ruleCode)).toBe(false);
    });

    it('moderate when CHONG diff is 7-15', () => {
      const findings = FillDifferenceRule.evaluate(
        mkCtx({ gradient: 'CHONG', score25Major: 590 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('moderate');
    });

    it('no risk for non-CHONG', () => {
      const findings = FillDifferenceRule.evaluate(
        mkCtx({ gradient: 'WEN', score25Major: 600 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(0);
    });

    it('no risk for small diff', () => {
      const findings = FillDifferenceRule.evaluate(
        mkCtx({ gradient: 'CHONG', score25Major: 583 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe('StableDifferenceRule', () => {
    it('moderate when WEN diff < 2', () => {
      const findings = StableDifferenceRule.evaluate(
        mkCtx({ gradient: 'WEN', score25Major: 579 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('moderate');
    });

    it('passes when diff >= 2', () => {
      const findings = StableDifferenceRule.evaluate(
        mkCtx({ gradient: 'WEN', score25Major: 575 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe('SafeDifferenceRule', () => {
    it('moderate when BAO diff < 2', () => {
      const findings = SafeDifferenceRule.evaluate(
        mkCtx({ gradient: 'BAO', score25Major: 579 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('moderate');
    });

    it('passes when diff >= 2', () => {
      const findings = SafeDifferenceRule.evaluate(
        mkCtx({ gradient: 'BAO', score25Major: 570 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(0);
    });
  });
});
