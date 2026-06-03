// batch-eligibility.spec.ts — Plan A Task 4 (TDD RED)
import { judgeBatchEligibility } from './batch-eligibility';
import type { EligibilityRulesJson } from './types';

const baseStudent = {
  examType: 'PHYSICS' as const,
  totalScore: 480,
  isRural: true,
  county: '叙永县',
  politicalStatus: null,
  birthDate: new Date('2008-01-01'),
};
const baseBatchConfig = (overrides: any = {}) => ({
  id: 1,
  batch: '本科批A段',
  examType: '物理',
  eligibilityRules: null as any,
  ...overrides,
});
const line = (score: number) => ({ score });

describe('judgeBatchEligibility', () => {
  it('总分 >= 本科线 → ELIGIBLE + SCORE_PASS', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理', '历史'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.reasons.find(x => x.type === 'SCORE_PASS')).toBeDefined();
  });

  it('总分 < 本科线 + 无容错 → INELIGIBLE + SCORE_FAIL', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility({ ...baseStudent, totalScore: 400 }, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.reasons.find(x => x.type === 'SCORE_FAIL')).toBeDefined();
  });

  it('总分 < 本科线 但在容错内 → CONDITIONAL + SCORE_DOWN_TOLERANCE', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
      examTypes: ['物理'], volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility({ ...baseStudent, totalScore: 425 }, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('CONDITIONAL');
    expect(r.reasons.find(x => x.type === 'SCORE_DOWN_TOLERANCE')).toBeDefined();
  });

  it('选科不匹配 → INELIGIBLE + EXAM_TYPE_MISMATCH', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['历史'], volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.reasons.find(x => x.type === 'EXAM_TYPE_MISMATCH')).toBeDefined();
  });

  it('子类硬资格不满足 → CONDITIONAL + HARD_SUBSET_FAIL', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: ['某外县'] },
      }],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('CONDITIONAL');
    expect(r.reasons.find(x => x.type === 'HARD_SUBSET_FAIL' && x.subset === '地方专项')).toBeDefined();
  });

  it('子类硬资格 RURAL_HOUSEHOLD_IN_REGION 满足 → ELIGIBLE', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: ['叙永县', '古蔺县'] },
      }],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.reasons.find(x => x.type === 'HARD_SUBSET_FAIL')).toBeUndefined();
  });

  it('AGE_RANGE: 年龄超出 → HARD_SUBSET_FAIL', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'SPECIAL_LINE' },
      examTypes: ['物理'], volunteerMode: 'SEQUENTIAL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '军队院校',
        rule: 'AGE_RANGE',
        params: { min: 16, max: 20, asOf: '2025-08-31' },
      }],
    };
    // 高分学生 (520 ≥ 518) + birthDate 2008-01-01 → 截至 2025-08-31 ~17 岁,满足
    const highScoreStudent = { ...baseStudent, totalScore: 520 };
    const r1 = judgeBatchEligibility(highScoreStudent, baseBatchConfig({ eligibilityRules: rules }), line(518));
    expect(r1.reasons.find(x => x.type === 'HARD_SUBSET_FAIL' && x.subset === '军队院校')).toBeUndefined();
    // 高分学生 + 出生 2000-01-01 → 25 岁,超出
    const r2 = judgeBatchEligibility({ ...highScoreStudent, birthDate: new Date('2000-01-01') }, baseBatchConfig({ eligibilityRules: rules }), line(518));
    expect(r2.verdict).toBe('CONDITIONAL');
    expect(r2.reasons.find(x => x.type === 'HARD_SUBSET_FAIL' && x.subset === '军队院校')).toBeDefined();
  });

  it('county 缺失时 RURAL_HOUSEHOLD_IN_REGION → SOFT_HINT 不阻止', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: ['叙永县'] },
      }],
    };
    const r = judgeBatchEligibility({ ...baseStudent, county: null }, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.reasons.find(x => x.type === 'SOFT_HINT')).toBeDefined();
  });

  it('SCORE_FAIL 即使有 HARD_SUBSET 也直接 INELIGIBLE', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{ scope: 'SUBSET', subset: '地方专项', rule: 'RURAL_HOUSEHOLD_IN_REGION', params: { regions: ['叙永县'] } }],
    };
    const r = judgeBatchEligibility({ ...baseStudent, totalScore: 400 }, baseBatchConfig({ eligibilityRules: rules }), line(438));
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('batchLine 为 null → CONDITIONAL + SOFT_HINT 提示数据缺失', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), null);
    expect(r.verdict).toBe('CONDITIONAL');
    expect(r.reasons.find(x => x.type === 'SOFT_HINT' && x.message.includes('分数线'))).toBeDefined();
  });

  it('eligibilityRules null → ELIGIBLE (老数据兼容)', () => {
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: null }), line(438));
    expect(r.verdict).toBe('ELIGIBLE');
  });
});

describe('judgeBatchEligibility V2 (subsets 数组)', () => {
  const baseStudent = {
    examType: 'PHYSICS' as const,
    totalScore: 480,
    isRural: true,
    county: '叙永县',
    politicalStatus: null,
    birthDate: new Date('2008-01-01'),
  };
  const baseBatchConfig = (rules: any) => ({
    id: 1,
    batch: '本科批A段',
    examType: '物理',
    eligibilityRules: rules,
  });

  it('subsets 中至少一个 ELIGIBLE → 批次 verdict=ELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [
        {
          code: 'puton',
          name: '普通类',
          description: '一般本科',
          hardRules: [],
          references: [],
        },
        {
          code: 'guojia_zhuanxiang',
          name: '国家专项',
          description: '面向贫困县',
          hardRules: [{
            scope: 'SUBSET', subset: '国家专项',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: ['其他县'] },
          }],
          references: [],
        },
      ],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('ELIGIBLE');
  });

  it('subsets 全部 INELIGIBLE → 批次 verdict=INELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [
        {
          code: 'guojia',
          name: '国家专项',
          description: '',
          hardRules: [{
            scope: 'SUBSET', subset: '国家专项',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: ['其他县'] },
          }],
          references: [],
        },
      ],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('subsets dataPending → 该 subset 不参与聚合, 整批仍 ELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [
        { code: 'puton', name: '普通类', description: '', hardRules: [], references: [] },
        { code: 'qiangji', name: '强基计划', description: '', dataPending: true, references: [] },
      ],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('ELIGIBLE');
    expect((r as any).subsetResults).toBeDefined();
    expect((r as any).subsetResults).toHaveLength(2);
    expect((r as any).subsetResults.find((s: any) => s.code === 'qiangji').verdict).toBe('DATA_PENDING');
  });

  it('SCORE_FAIL 时 subsets 不需要判定, 直接 INELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [{ code: 'puton', name: '普通类', description: '', hardRules: [], references: [] }],
    };
    const r = judgeBatchEligibility(
      { ...baseStudent, totalScore: 400 },
      baseBatchConfig(rules),
      { score: 438 },
    );
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('subsets 缺失 → 退化到老逻辑 (向后兼容)', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('ELIGIBLE');
  });
});
