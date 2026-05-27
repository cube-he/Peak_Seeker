import {
  SubjectMismatchRule,
  ColorBlindRule,
  MissingHistoricalDataRule,
  ZeroPlanCountRule,
} from './rules/qualification.rule';
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
