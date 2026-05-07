// health-restriction.rule.spec.ts
import { HealthRestrictionRule } from './health-restriction.rule';

const restrictions = [
  { id: 1, conditionCode: 'COLOR_BLIND', conditionName: '色盲', restrictionType: '不予录取',
    severity: 'high', restrictionScope: 'major', majorCode: '0805', majorName: '材料类', section: null, majorCategory: null },
  { id: 2, conditionCode: 'VISION_LOW', conditionName: '裸眼视力<4.8', restrictionType: '不宜就读',
    severity: 'medium', restrictionScope: 'major', majorCode: '1001', majorName: '医学', section: null, majorCategory: null },
];

const rule = new HealthRestrictionRule(restrictions as any);

describe('HealthRestrictionRule', () => {
  it('色盲学生 + 材料类专业 → 软不符合', () => {
    const student = { colorBlind: true, colorWeak: false, visionLeft: 5.0, visionRight: 5.0 } as any;
    const cand = { majorCode: '0805', major: { code: '0805', name: '材料化学' } } as any;
    const r = rule.check(student, cand);
    expect(r.pass).toBe(false);
    expect(r.reason?.rule).toBe('health.color');
  });

  it('视力 4.5 + 医学专业 → 软不符合', () => {
    const student = { colorBlind: false, colorWeak: false, visionLeft: 4.5, visionRight: 5.0 } as any;
    const cand = { majorCode: '1001', major: { code: '1001', name: '临床医学' } } as any;
    const r = rule.check(student, cand);
    expect(r.pass).toBe(false);
    expect(r.reason?.rule).toBe('health.vision');
  });

  it('健康学生 → 通过', () => {
    const student = { colorBlind: false, colorWeak: false, visionLeft: 5.0, visionRight: 5.0 } as any;
    const cand = { majorCode: '0805', major: { code: '0805', name: '材料化学' } } as any;
    expect(rule.check(student, cand).pass).toBe(true);
  });

  it('色弱+材料类（高严重）→ 通过（仅色盲触发）', () => {
    const student = { colorBlind: false, colorWeak: true, visionLeft: 5.0, visionRight: 5.0 } as any;
    const cand = { majorCode: '0805', major: { code: '0805', name: '材料化学' } } as any;
    expect(rule.check(student, cand).pass).toBe(true);
  });
});
