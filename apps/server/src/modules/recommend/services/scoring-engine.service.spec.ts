import { ScoringEngineService } from './scoring-engine.service';
import {
  RawCandidate,
  StudentProfileSnapshot,
} from '../interfaces/recommend.types';

describe('ScoringEngineService', () => {
  let service: ScoringEngineService;

  // Helper to create a minimal raw candidate
  function makeCandidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
    return {
      admissionRecordId: 1,
      universityId: 100,
      majorId: 200,
      year: 2025,
      province: '四川',
      batch: '本科一批',
      majorMinRank: 30000,
      majorMinScore: 580,
      majorAvgRank: 28000,
      majorAdmissionCount: 10,
      groupMinRank: 32000,
      groupCode: 'A01',
      universityName: '测试大学',
      universityCode: '10001',
      universityProvince: '四川',
      universityCity: '成都',
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      runningNature: '公办',
      universityType: '综合',
      universityTags: null,
      postgradRate: '15',
      softRanking: 100,
      majorName: '计算机科学',
      majorCode: '080901',
      majorCategory: '工学',
      majorLevel: '本科',
      discipline: '计算机科学与技术',
      planCount: 10,
      tuition: 5000,
      isSinoForeign: false,
      subjects: '物理',
      subjectRequirements: '物理',
      enrollmentGroupCode: 'A01',
      enrollmentGroupName: '理工组',
      enrollmentGroupMajors: null,
      enrollmentGroupPlanCount: 30,
      disciplineEval: 'A',
      isNationalFeature: true,
      majorRanking: 'A类',
      majorHonor: '国家级特色专业',
      ...overrides,
    };
  }

  // Helper to create a minimal student profile
  function makeStudent(
    overrides: Partial<StudentProfileSnapshot> = {},
  ): StudentProfileSnapshot {
    return {
      id: 1,
      userId: 1,
      province: '四川',
      examType: 'PHYSICS',
      examYear: 2026,
      totalScore: 600,
      provincialRank: 25000,
      firstChoice: '物理',
      reChoices: ['化学', '生物'],
      colorBlind: false,
      colorWeak: false,
      vision: null,
      physicalLimits: null,
      priorityMode: 'UNIVERSITY_FIRST',
      preferredProvinces: ['四川', '北京'],
      preferredCities: ['成都', '北京'],
      preferredMajors: ['计算机科学'],
      preferredMajorCategories: ['工学'],
      preferredUniversities: null,
      preferredUniversityTypes: null,
      preferredTags: null,
      excludedProvinces: null,
      excludedCities: null,
      excludedUniversities: null,
      excludedMajors: null,
      tuitionBudget: null,
      acceptSinoForeign: false,
      acceptPrivate: null,
      careerPlan: null,
      stayPreference: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    service = new ScoringEngineService();
  });

  // ---- Weight function W(t, start, end) ----

  describe('W (dynamic weight function)', () => {
    it('should return start when t=0', () => {
      expect(service.W(0, 5.0, 3.5)).toBe(5.0);
    });

    it('should return end when t=1', () => {
      expect(service.W(1, 5.0, 3.5)).toBe(3.5);
    });

    it('should interpolate linearly at t=0.5', () => {
      expect(service.W(0.5, 5.0, 3.5)).toBe(4.25);
    });

    it('should handle same start and end', () => {
      expect(service.W(0.5, 3.0, 3.0)).toBe(3.0);
    });
  });

  // ---- Tier score ----

  describe('calcTierScore', () => {
    it('should return 5 for 985', () => {
      expect(service.calcTierScore(makeCandidate({ is985: true }))).toBe(5);
    });

    it('should return 4 for 211 (non-985)', () => {
      expect(
        service.calcTierScore(
          makeCandidate({ is985: false, is211: true }),
        ),
      ).toBe(4);
    });

    it('should return 3 for 双一流 (non-211)', () => {
      expect(
        service.calcTierScore(
          makeCandidate({
            is985: false,
            is211: false,
            isDoubleFirstClass: true,
          }),
        ),
      ).toBe(3);
    });

    it('should return 2 for provincial key university', () => {
      expect(
        service.calcTierScore(
          makeCandidate({
            is985: false,
            is211: false,
            isDoubleFirstClass: false,
            universityTags: ['省重点'],
          }),
        ),
      ).toBe(2);
    });

    it('should return 1 for ordinary university', () => {
      expect(
        service.calcTierScore(
          makeCandidate({
            is985: false,
            is211: false,
            isDoubleFirstClass: false,
            universityTags: null,
          }),
        ),
      ).toBe(1);
    });
  });

  // ---- Nature score ----

  describe('calcNatureScore', () => {
    it('should return 3 for 公办', () => {
      expect(
        service.calcNatureScore(makeCandidate({ runningNature: '公办' })),
      ).toBe(3);
    });

    it('should return 0 for 民办', () => {
      expect(
        service.calcNatureScore(makeCandidate({ runningNature: '民办' })),
      ).toBe(0);
    });

    it('should return 1.5 for unknown nature', () => {
      expect(
        service.calcNatureScore(makeCandidate({ runningNature: null })),
      ).toBe(1.5);
    });
  });

  // ---- Major score ----

  describe('calcMajorScore', () => {
    it('should give recommend=3 for preferred major', () => {
      const student = makeStudent({ preferredMajors: ['计算机科学'] });
      const result = service.calcMajorScore(makeCandidate(), student);
      expect(result.recommendScore).toBe(3);
    });

    it('should give recommend=3 for preferred category match', () => {
      const student = makeStudent({
        preferredMajors: [],
        preferredMajorCategories: ['工学'],
      });
      const result = service.calcMajorScore(
        makeCandidate({ majorCategory: '工学' }),
        student,
      );
      expect(result.recommendScore).toBe(3);
    });

    it('should give recommend=1 for neutral major', () => {
      const student = makeStudent({
        preferredMajors: ['经济学'],
        preferredMajorCategories: ['经济学'],
      });
      const result = service.calcMajorScore(
        makeCandidate({ majorName: '物理学', majorCategory: '理学' }),
        student,
      );
      expect(result.recommendScore).toBe(1);
    });

    it('should give discipline=4 for A-class evaluation', () => {
      const result = service.calcMajorScore(
        makeCandidate({ disciplineEval: 'A+' }),
        makeStudent(),
      );
      expect(result.disciplineScore).toBe(4);
    });

    it('should give discipline=3 for B-class evaluation', () => {
      const result = service.calcMajorScore(
        makeCandidate({ disciplineEval: 'B+' }),
        makeStudent(),
      );
      expect(result.disciplineScore).toBe(3);
    });

    it('should give discipline=2 for C-class evaluation', () => {
      const result = service.calcMajorScore(
        makeCandidate({ disciplineEval: 'C' }),
        makeStudent(),
      );
      expect(result.disciplineScore).toBe(2);
    });

    it('should give discipline=0 for no evaluation', () => {
      const result = service.calcMajorScore(
        makeCandidate({
          disciplineEval: null,
          isNationalFeature: false,
          majorRanking: null,
        }),
        makeStudent(),
      );
      expect(result.disciplineScore).toBe(0);
    });
  });

  // ---- Other score ----

  describe('calcOtherScore', () => {
    it('should give planScore=3 for >=10 plan count', () => {
      const result = service.calcOtherScore(
        makeCandidate({ planCount: 15 }),
        makeStudent(),
      );
      expect(result.planScore).toBe(3);
    });

    it('should give planScore=2 for 5-9 plan count', () => {
      const result = service.calcOtherScore(
        makeCandidate({ planCount: 7 }),
        makeStudent(),
      );
      expect(result.planScore).toBe(2);
    });

    it('should give planScore=1 for <5 plan count', () => {
      const result = service.calcOtherScore(
        makeCandidate({ planCount: 3 }),
        makeStudent(),
      );
      expect(result.planScore).toBe(1);
    });

    it('should give postgradScore=3 for >=10% rate', () => {
      const result = service.calcOtherScore(
        makeCandidate({ postgradRate: '15' }),
        makeStudent(),
      );
      expect(result.postgradScore).toBe(3);
    });

    it('should give locationScore=2 for preferred province', () => {
      const result = service.calcOtherScore(
        makeCandidate({ universityProvince: '四川' }),
        makeStudent({ preferredProvinces: ['四川'] }),
      );
      expect(result.locationScore).toBe(2);
    });

    it('should give locationScore=0 for non-preferred location', () => {
      const result = service.calcOtherScore(
        makeCandidate({ universityProvince: '甘肃', universityCity: '兰州' }),
        makeStudent({ preferredProvinces: ['四川'], preferredCities: ['成都'] }),
      );
      expect(result.locationScore).toBe(0);
    });
  });

  // ---- Bonus ----

  describe('calcBonus', () => {
    it('should give +3 for preferred university', () => {
      const result = service.calcBonus(
        makeCandidate({ universityName: '清华大学' }),
        makeStudent({ preferredUniversities: ['清华大学'] }),
      );
      expect(result).toBe(3);
    });

    it('should give 0 for no preference match', () => {
      const result = service.calcBonus(
        makeCandidate({ universityName: '某某大学' }),
        makeStudent({
          preferredUniversities: null,
          preferredUniversityTypes: null,
          preferredTags: null,
        }),
      );
      expect(result).toBe(0);
    });
  });

  // ---- Data reliability ----

  describe('calcDataReliabilityFactor', () => {
    it('should return 1.0 for current year new gaokao', () => {
      expect(service.calcDataReliabilityFactor(2025, 2026, true)).toBe(1.0);
    });

    it('should return 0.75 for previous year old gaokao', () => {
      expect(service.calcDataReliabilityFactor(2024, 2026, false)).toBe(0.75);
    });

    it('should return 0.65 for 2 years ago', () => {
      expect(service.calcDataReliabilityFactor(2023, 2026, true)).toBe(0.65);
    });

    it('should return 0.5 for 3+ years ago', () => {
      expect(service.calcDataReliabilityFactor(2022, 2026, true)).toBe(0.5);
    });
  });

  // ---- Full scoring pipeline ----

  describe('scoreCandidate', () => {
    it('should produce a scored candidate with valid breakdown', () => {
      const candidate = makeCandidate({
        is985: true,
        runningNature: '公办',
        disciplineEval: 'A+',
        planCount: 20,
        postgradRate: '25',
      });

      const student = makeStudent({ priorityMode: 'UNIVERSITY_FIRST' });
      const result = service.scoreCandidate(candidate, student, 0, 55);

      expect(result.compositeScore).toBeGreaterThan(0);
      expect(result.scoreBreakdown).toBeDefined();
      expect(result.scoreBreakdown.tier).toBeGreaterThan(0);
      expect(result.scoreBreakdown.nature).toBeGreaterThan(0);
      expect(result.scoreBreakdown.major).toBeGreaterThan(0);
      expect(result.scoreBreakdown.other).toBeGreaterThan(0);
      expect(result.scoreBreakdown.rawTotal).toBe(result.compositeScore);
    });

    it('should score differently for UNIVERSITY_FIRST vs MAJOR_FIRST', () => {
      const candidate = makeCandidate({
        is985: true,
        disciplineEval: 'A',
      });
      const student = makeStudent();

      const uniFirst = service.scoreCandidate(
        candidate,
        { ...student, priorityMode: 'UNIVERSITY_FIRST' },
        0,
        55,
      );

      const majorFirst = service.scoreCandidate(
        candidate,
        { ...student, priorityMode: 'MAJOR_FIRST' },
        0,
        55,
      );

      // Scores should differ because weights are swapped
      expect(uniFirst.compositeScore).not.toBe(majorFirst.compositeScore);
    });

    it('should produce higher tier weight at t=0 (冲端) than t=1 (保端) in UNIVERSITY_FIRST', () => {
      const candidate = makeCandidate({ is985: true });
      const student = makeStudent({ priorityMode: 'UNIVERSITY_FIRST' });

      const rushEnd = service.scoreCandidate(candidate, student, 0, 55);
      const safeEnd = service.scoreCandidate(candidate, student, 54, 55);

      // At t=0, tier weight = 5.0; at t=1, tier weight = 3.5
      // So tier contribution should be higher at t=0
      expect(rushEnd.scoreBreakdown.tier).toBeGreaterThan(
        safeEnd.scoreBreakdown.tier,
      );
    });
  });

  // ---- Correction ----

  describe('applyCorrection', () => {
    it('should multiply by stability and reliability factors', () => {
      const candidate = makeCandidate();
      const student = makeStudent();
      const scored = service.scoreCandidate(candidate, student, 25, 55);

      const corrected = service.applyCorrection(scored, 0.8, 0.75, 0);

      expect(corrected.compositeScore).toBeCloseTo(
        scored.scoreBreakdown.rawTotal * 0.8 * 0.75,
        2,
      );
      expect(corrected.stabilityFactor).toBe(0.8);
      expect(corrected.dataReliabilityFactor).toBe(0.75);
    });

    it('should add supplementary adjustment', () => {
      const candidate = makeCandidate();
      const student = makeStudent();
      const scored = service.scoreCandidate(candidate, student, 25, 55);

      const corrected = service.applyCorrection(scored, 1.0, 1.0, 2.5);

      expect(corrected.compositeScore).toBeCloseTo(
        scored.scoreBreakdown.rawTotal + 2.5,
        2,
      );
    });
  });
});
