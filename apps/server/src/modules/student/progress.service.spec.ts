import { Test } from '@nestjs/testing';
import { ProgressService } from './progress.service';

const FULL_REQUIRED: Record<string, unknown> = {
  realName: '张三', gender: 'MALE', phone: '13800138000', ethnicity: '汉族',
  province: '四川', city: '成都市', county: '武侯区', isRural: false,
  examLocationProvince: '四川', examLocationCity: '成都市', examLocationCounty: '武侯区',
  colorBlind: false, colorWeak: false,
  examYear: 2026, examSource: 'GAOKAO_REAL',
  firstChoice: 'HISTORY', reChoices: ['POL', 'GEO'],
  scoreChinese: 116, scoreMath: 79, scoreEnglish: 120,
  scoreFirstChoice: 66, scoreSub1: 87, scoreSub2: 84,
};

describe('ProgressService — single-layer REQUIRED_FIELDS', () => {
  let svc: ProgressService;
  beforeEach(async () => {
    const m = await Test.createTestingModule({ providers: [ProgressService] }).compile();
    svc = m.get(ProgressService);
  });

  it('21 个必填全填 (色觉 2 列都给) → isRecommendable=true, missing 为空', () => {
    const p = svc.compute(FULL_REQUIRED);
    expect(p.isRecommendable).toBe(true);
    expect(p.missingFieldsForRecommend).toEqual([]);
  });

  it('缺 totalScore (旧硬约束之一) 不再阻塞 → isRecommendable 仍 true', () => {
    const p = svc.compute({ ...FULL_REQUIRED });
    expect(p.isRecommendable).toBe(true);
  });

  it('缺 birthDate / politicalStatus / preferredMajors / height (旧三层硬约束) 不再阻塞', () => {
    const p = svc.compute(FULL_REQUIRED);
    expect(p.isRecommendable).toBe(true);
    expect(p.missingFieldsForRecommend).not.toContain('birthDate');
    expect(p.missingFieldsForRecommend).not.toContain('politicalStatus');
    expect(p.missingFieldsForRecommend).not.toContain('preferredMajors');
    expect(p.missingFieldsForRecommend).not.toContain('height');
  });

  it('缺 examYear/examSource 不再阻塞 (选择器已删/隐藏, 移出必填门) → isRecommendable 仍 true', () => {
    const { examYear: _y, examSource: _s, ...rest } = FULL_REQUIRED;
    const p = svc.compute(rest);
    expect(p.isRecommendable).toBe(true);
    expect(p.missingFieldsForRecommend).not.toContain('examYear');
    expect(p.missingFieldsForRecommend).not.toContain('examSource');
  });

  it('缺 colorBlind → isRecommendable=false (色觉必填)', () => {
    const { colorBlind: _omit, ...rest } = FULL_REQUIRED;
    const p = svc.compute(rest);
    expect(p.isRecommendable).toBe(false);
    expect(p.missingFieldsForRecommend).toContain('colorBlind');
  });

  it('reChoices 空数组视为未填', () => {
    const p = svc.compute({ ...FULL_REQUIRED, reChoices: [] });
    expect(p.isRecommendable).toBe(false);
    expect(p.missingFieldsForRecommend).toContain('reChoices');
  });
});

describe('ProgressService — overallCompleteness 双档加权', () => {
  let svc: ProgressService;
  beforeEach(async () => {
    const m = await Test.createTestingModule({ providers: [ProgressService] }).compile();
    svc = m.get(ProgressService);
  });

  it('必填全填 + 推荐全空 → overall = 70', () => {
    const p = svc.compute(FULL_REQUIRED);
    expect(p.overallCompleteness).toBe(70);
  });

  it('必填全空 + 推荐部分填 → overall <= 30', () => {
    const recOnly: Record<string, unknown> = {
      parentPhone: '13800138001', politicalStatus: 'MEMBER_OF_LEAGUE',
      height: 175, weight: 65,
      preferredMajors: [{ tier: 1, majors: ['计算机'] }],
    };
    const p = svc.compute(recOnly);
    expect(p.overallCompleteness).toBeGreaterThanOrEqual(0);
    expect(p.overallCompleteness).toBeLessThanOrEqual(30);
  });

  it('必填全填 + 推荐全填 → overall = 100', () => {
    const recValues: Record<string, unknown> = {
      parentPhone: '13800138001', politicalStatus: 'MEMBER_OF_LEAGUE',
      birthDate: new Date('2008-01-01'), examType: 'HISTORY', formFiller: 'TOGETHER',
      totalScore: 552, bonusPolicyStatus: 'NONE', bonusItems: ['NONE'],
      height: 175, weight: 65,
      visionLeft: 5.0, visionRight: 5.0, visionLeftCorrected: 5.0, visionRightCorrected: 5.0,
      medicalHistory: '-', physicalLimits: ['-'],
      preferredProvinces: ['四川'], preferredCities: ['成都'],
      preferredMajors: [{ tier: 1, majors: ['计算机'] }],
      preferredUniversities: ['四川大学'], preferredMajorCategories: ['工学'],
      priorityMode: 'BALANCE', careerPlan: 'EMPLOY', careerDirection: '-',
      preferredBatches: ['本科批'], remoteAreaAcceptance: 'NEUTRAL',
      coldMajorAcceptance: 'NEUTRAL', stayPreference: 'NEUTRAL',
      preferredTags: ['双一流'],
      excludedProvinces: ['-'], excludedCities: ['-'], excludedUniversities: ['-'],
      excludedMajors: ['-'], excludedMajorCategories: ['-'],
      interests: ['编程'], personalityType: 'ISTJ', selfDescription: '-',
      militaryInterest: true, teacherInterest: true,
      tuitionBudget: 'BELOW_8K', acceptSinoForeign: true,
      acceptPrivate: 'CONSIDER', acceptCooperation: 'CONSIDER',
      otherRequirements: '-', highSchool: '成都七中', classInfo: '高三1班',
    };
    const all = { ...FULL_REQUIRED, ...recValues };
    const p = svc.compute(all);
    expect(p.overallCompleteness).toBe(100);
  });
});
