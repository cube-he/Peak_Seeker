import {
  SubjectMismatchRule,
  ColorBlindRule,
  MissingHistoricalDataRule,
  ZeroPlanCountRule,
} from './rules/qualification.rule';
import { FillDifferenceRule, StableDifferenceRule, SafeDifferenceRule } from './rules/gradient.rule';
import type { RuleContext } from './risk-rule.interface';

const mkCtx = (item: any, student: any = {}): RuleContext => ({
  item,
  allItems: [item],
  student,
  plan: {},
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
    });

    it('skips non-color-blind student', () => {
      const findings = ColorBlindRule.evaluate(
        mkCtx({ riskWarning: '色盲色弱不予录取' }, { colorBlind: false, colorWeak: false }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe('MissingHistoricalDataRule', () => {
    it('flags when no historical data', () => {
      const findings = MissingHistoricalDataRule.evaluate(mkCtx({}));
      expect(findings).toHaveLength(1);
    });

    it('passes when has any data', () => {
      const findings = MissingHistoricalDataRule.evaluate(
        mkCtx({ score25Major: 580 }),
      );
      expect(findings).toHaveLength(0);
    });
  });

  describe('ZeroPlanCountRule', () => {
    it('flags planCount=0', () => {
      const findings = ZeroPlanCountRule.evaluate(mkCtx({ planCount: 0 }));
      expect(findings).toHaveLength(1);
    });

    it('passes planCount>0', () => {
      const findings = ZeroPlanCountRule.evaluate(mkCtx({ planCount: 5 }));
      expect(findings).toHaveLength(0);
    });
  });
});

describe('Gradient rules', () => {
  describe('FillDifferenceRule', () => {
    it('critical when diff > 15 (CHONG)', () => {
      const findings = FillDifferenceRule.evaluate(
        mkCtx({ gradient: 'CHONG', score25Major: 600 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
    });

    it('moderate when diff 7-15 (CHONG)', () => {
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
    });

    it('passes when diff >= 2', () => {
      const findings = SafeDifferenceRule.evaluate(
        mkCtx({ gradient: 'BAO', score25Major: 570 }, { totalScore: 580 }),
      );
      expect(findings).toHaveLength(0);
    });
  });
});
