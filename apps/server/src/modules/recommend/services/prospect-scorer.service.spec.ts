import { ProspectScorerService } from './prospect-scorer.service';
import { RawCandidate } from '../interfaces/recommend.types';

function makeCandidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    admissionRecordId: 1,
    universityId: 1,
    majorId: 1,
    year: 2025,
    province: '四川',
    majorMinRank: 30000,
    majorMinScore: 580,
    majorAvgRank: null,
    majorAdmissionCount: null,
    groupMinRank: null,
    groupCode: null,
    universityName: '测试大学',
    is985: false,
    is211: false,
    isDoubleFirstClass: false,
    runningNature: '公办',
    majorName: '测试专业',
    isSinoForeign: false,
    isNationalFeature: false,
    planCount: 10,
    universityEmploymentRate: '92%',
    universityFurtherStudyRate: '55%',
    universityAvgSalary: null,
    universitySatisfactionOverall: 4.2,
    universityRankingQS: 80,
    universityRankingAlumni: null,
    universityRankingUSNews: null,
    softRanking: null,
    majorCareerDirections: null,
    majorPostgraduateDirections: null,
    majorSatisfactionScore: 4.0,
    ...overrides,
  } as RawCandidate;
}

describe('ProspectScorerService', () => {
  let service: ProspectScorerService;

  beforeEach(() => {
    service = new ProspectScorerService();
  });

  // ---- employmentScore ----

  describe('employment score', () => {
    it('returns 3 when employment rate ≥90%', () => {
      const c = makeCandidate({ universityEmploymentRate: '92%' });
      const result = service.score(c, null);
      expect(result.prospectEmployment).toBe(3);
    });

    it('returns 2 when employment rate is 85%', () => {
      const c = makeCandidate({ universityEmploymentRate: '85%' });
      const result = service.score(c, null);
      expect(result.prospectEmployment).toBe(2);
    });

    it('returns 1 when employment rate is 75%', () => {
      const c = makeCandidate({ universityEmploymentRate: '75%' });
      const result = service.score(c, null);
      expect(result.prospectEmployment).toBe(1);
    });

    it('returns 0.5 when employment rate is below 70%', () => {
      const c = makeCandidate({ universityEmploymentRate: '60%' });
      const result = service.score(c, null);
      expect(result.prospectEmployment).toBe(0.5);
    });

    it('returns 1.5 (neutral) when employment rate is missing', () => {
      const c = makeCandidate({ universityEmploymentRate: null });
      const result = service.score(c, null);
      expect(result.prospectEmployment).toBe(1.5);
    });
  });

  // ---- salaryScore ----

  describe('salary score', () => {
    it('returns 3 when avg salary ≥10000', () => {
      const c = makeCandidate({ universityAvgSalary: '12000' });
      const result = service.score(c, null);
      expect(result.prospectSalary).toBe(3);
    });

    it('returns 2 when avg salary is 8000', () => {
      const c = makeCandidate({ universityAvgSalary: '8000' });
      const result = service.score(c, null);
      expect(result.prospectSalary).toBe(2);
    });

    it('returns 1 when avg salary is 6000', () => {
      const c = makeCandidate({ universityAvgSalary: '6000' });
      const result = service.score(c, null);
      expect(result.prospectSalary).toBe(1);
    });

    it('returns 0.5 when avg salary is below 5000', () => {
      const c = makeCandidate({ universityAvgSalary: '4000' });
      const result = service.score(c, null);
      expect(result.prospectSalary).toBe(0.5);
    });

    it('returns 1.5 (neutral) when salary is missing', () => {
      const c = makeCandidate({ universityAvgSalary: null });
      const result = service.score(c, null);
      expect(result.prospectSalary).toBe(1.5);
    });
  });

  // ---- satisfactionScore ----

  describe('satisfaction score', () => {
    it('returns 3 for weighted satisfaction ≥4.0 (uni 4.5 * 0.4 + major 3.8 * 0.6 = 4.08)', () => {
      const c = makeCandidate({
        universitySatisfactionOverall: 4.5,
        majorSatisfactionScore: 3.8,
      });
      const result = service.score(c, null);
      expect(result.prospectSatisfaction).toBe(3);
    });

    it('returns 2 for weighted satisfaction between 3.5 and 4.0', () => {
      // uni 3.8 * 0.4 + major 3.5 * 0.6 = 1.52 + 2.10 = 3.62
      const c = makeCandidate({
        universitySatisfactionOverall: 3.8,
        majorSatisfactionScore: 3.5,
      });
      const result = service.score(c, null);
      expect(result.prospectSatisfaction).toBe(2);
    });

    it('returns 1 for weighted satisfaction between 3.0 and 3.5', () => {
      // uni 3.2 * 0.4 + major 3.0 * 0.6 = 1.28 + 1.80 = 3.08
      const c = makeCandidate({
        universitySatisfactionOverall: 3.2,
        majorSatisfactionScore: 3.0,
      });
      const result = service.score(c, null);
      expect(result.prospectSatisfaction).toBe(1);
    });

    it('returns 0.5 for weighted satisfaction below 3.0', () => {
      const c = makeCandidate({
        universitySatisfactionOverall: 2.5,
        majorSatisfactionScore: 2.0,
      });
      const result = service.score(c, null);
      expect(result.prospectSatisfaction).toBe(0.5);
    });

    it('returns 1.5 (neutral) when both satisfaction fields are missing', () => {
      const c = makeCandidate({
        universitySatisfactionOverall: null,
        majorSatisfactionScore: null,
      });
      const result = service.score(c, null);
      expect(result.prospectSatisfaction).toBe(1.5);
    });

    it('uses only university satisfaction when major satisfaction is missing', () => {
      // uni 4.5 only → ≥4.0 → 3
      const c = makeCandidate({
        universitySatisfactionOverall: 4.5,
        majorSatisfactionScore: null,
      });
      const result = service.score(c, null);
      expect(result.prospectSatisfaction).toBe(3);
    });

    it('uses only major satisfaction when university satisfaction is missing', () => {
      // major 3.7 only → ≥3.5 → 2
      const c = makeCandidate({
        universitySatisfactionOverall: null,
        majorSatisfactionScore: 3.7,
      });
      const result = service.score(c, null);
      expect(result.prospectSatisfaction).toBe(2);
    });
  });

  // ---- rankingScore ----

  describe('ranking score', () => {
    it('returns 2 when best ranking is QS 80 (Top100)', () => {
      const c = makeCandidate({
        universityRankingQS: 80,
        universityRankingUSNews: null,
        universityRankingAlumni: null,
        softRanking: null,
      });
      const result = service.score(c, null);
      expect(result.prospectRanking).toBe(2);
    });

    it('returns 3 when best ranking is ≤50', () => {
      const c = makeCandidate({
        universityRankingQS: 45,
        universityRankingUSNews: null,
        universityRankingAlumni: null,
        softRanking: null,
      });
      const result = service.score(c, null);
      expect(result.prospectRanking).toBe(3);
    });

    it('returns 1 when best ranking is ≤200', () => {
      const c = makeCandidate({
        universityRankingQS: 150,
        universityRankingUSNews: null,
        universityRankingAlumni: null,
        softRanking: null,
      });
      const result = service.score(c, null);
      expect(result.prospectRanking).toBe(1);
    });

    it('returns 0 when ranking exceeds 200', () => {
      const c = makeCandidate({
        universityRankingQS: 300,
        universityRankingUSNews: null,
        universityRankingAlumni: null,
        softRanking: null,
      });
      const result = service.score(c, null);
      expect(result.prospectRanking).toBe(0);
    });

    it('returns 0 (not neutral) when all rankings are missing', () => {
      const c = makeCandidate({
        universityRankingQS: null,
        universityRankingUSNews: null,
        universityRankingAlumni: null,
        softRanking: null,
      });
      const result = service.score(c, null);
      expect(result.prospectRanking).toBe(0);
    });

    it('takes the best (minimum) ranking across multiple sources', () => {
      // QS=150, Alumni=40 → best=40 → ≤50 → 3
      const c = makeCandidate({
        universityRankingQS: 150,
        universityRankingAlumni: 40,
        universityRankingUSNews: null,
        softRanking: null,
      });
      const result = service.score(c, null);
      expect(result.prospectRanking).toBe(3);
    });

    it('ignores zero ranking values (treat as missing)', () => {
      // QS=0 (invalid), Alumni=80 → best=80 → ≤100 → 2
      const c = makeCandidate({
        universityRankingQS: 0,
        universityRankingAlumni: 80,
        universityRankingUSNews: null,
        softRanking: null,
      });
      const result = service.score(c, null);
      expect(result.prospectRanking).toBe(2);
    });
  });

  // ---- conditionalScore (5th factor — career plan dependent) ----

  describe('conditional score', () => {
    it('POSTGRADUATE plan boosts further study score (55% → 3)', () => {
      const c = makeCandidate({ universityFurtherStudyRate: '55%' });
      const result = service.score(c, 'POSTGRADUATE');
      expect(result.prospectConditional).toBe(3);
    });

    it('POSTGRADUATE plan with 35% further study rate → 2', () => {
      const c = makeCandidate({ universityFurtherStudyRate: '35%' });
      const result = service.score(c, 'POSTGRADUATE');
      expect(result.prospectConditional).toBe(2);
    });

    it('EMPLOYMENT plan doubles employment score', () => {
      // employment rate 92% → score 3
      const c = makeCandidate({ universityEmploymentRate: '92%' });
      const result = service.score(c, 'EMPLOYMENT');
      expect(result.prospectConditional).toBe(3);
    });

    it('ABROAD plan doubles ranking score', () => {
      // QS 80 → ranking score 2
      const c = makeCandidate({ universityRankingQS: 80 });
      const result = service.score(c, 'ABROAD');
      expect(result.prospectConditional).toBe(2);
    });

    it('null careerPlan uses 0.5 * furtherStudyScore', () => {
      // furtherStudy 55% → 3; 0.5 * 3 = 1.5
      const c = makeCandidate({ universityFurtherStudyRate: '55%' });
      const result = service.score(c, null);
      expect(result.prospectConditional).toBe(1.5);
    });

    it('unknown careerPlan uses 0.5 * furtherStudyScore', () => {
      // furtherStudy 35% → 2; 0.5 * 2 = 1
      const c = makeCandidate({ universityFurtherStudyRate: '35%' });
      const result = service.score(c, 'UNKNOWN_PLAN');
      expect(result.prospectConditional).toBe(1);
    });

    it('POSTGRADUATE with missing further study rate → neutral 1.5', () => {
      const c = makeCandidate({ universityFurtherStudyRate: null });
      const result = service.score(c, 'POSTGRADUATE');
      expect(result.prospectConditional).toBe(1.5);
    });
  });

  // ---- prospectRaw = sum of all 5 sub-factors ----

  describe('prospectRaw', () => {
    it('equals sum of all 5 sub-scores', () => {
      const c = makeCandidate({
        universityEmploymentRate: '92%',    // → 3
        universityAvgSalary: null,           // → 1.5 (neutral)
        universitySatisfactionOverall: 4.2,  // weighted with major below
        majorSatisfactionScore: 4.0,         // → 4.2*0.4 + 4.0*0.6 = 1.68+2.40 = 4.08 → 3
        universityRankingQS: 80,             // → 2 (top100)
        universityFurtherStudyRate: '55%',   // conditional (null plan) → 0.5*3 = 1.5
      });
      const result = service.score(c, null);
      // employment=3, salary=1.5, satisfaction=3, conditional=1.5, ranking=2
      const expected = result.prospectEmployment + result.prospectSalary +
        result.prospectSatisfaction + result.prospectConditional + result.prospectRanking;
      expect(result.prospectRaw).toBe(expected);
      expect(result.prospectRaw).toBeCloseTo(11, 5);
    });
  });
});
