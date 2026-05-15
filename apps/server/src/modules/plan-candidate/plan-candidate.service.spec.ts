// plan-candidate.service.spec.ts
import { Test } from '@nestjs/testing';
import { PlanCandidateService } from './plan-candidate.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScoreSegmentService } from '../score-segment/score-segment.service';
import { RankStrategyService } from '../recommend/services/rank-strategy.service';

describe('PlanCandidateService', () => {
  let service: PlanCandidateService;
  let prisma: any;
  let scoreSegment: any;
  let rankStrategy: any;

  function makeRankStrategyResult(eligibility: string, candidateRank: number | null = 10000) {
    return {
      sourceAdmissionYear: 2025,
      rankSourceYear: '2025_ESTIMATED',
      candidateRank,
      requiredEasierDelta: null,
      safetyMargin: null,
      rushFormalLimit: 16000,
      rushObserveLimit: 28000,
      safeNormalMargin: 8000,
      safeStrongMargin: 17000,
      rankBucket: '100k-200k',
      sampleScope: 'RANK_BUCKET',
      sampleSize: 120,
      basisPairs: [{ fromYear: 2024, toYear: 2025 }],
      insufficientData: eligibility === 'INSUFFICIENT_DATA',
      eligibility,
      reason: `${eligibility} rank strategy`,
    };
  }

  function makeGroupEnrollmentPlan(overrides: any = {}) {
    return {
      id: 900,
      universityId: 9,
      majorId: 91,
      university: { id: 9, name: 'Candidate University', code: 'CU' },
      major: { id: 91, name: 'Candidate Major', code: '0001', category: 'Science' },
      recruitType: 'General',
      isSinoForeign: false,
      planNotes: '',
      tuition: 5000,
      majorCode: '0001',
      majorName: 'Candidate Major',
      subjects: 'Physics',
      batch: 'Batch A',
      groupCode: 'G9',
      groupName: 'Candidate group',
      groupPlanCount: 10,
      subjectRequirements: '',
      planCount: 10,
      disciplineEval: '',
      isNationalFeature: false,
      ...overrides,
    };
  }

  function makeGroupAdmissionRecord(overrides: any = {}) {
    return {
      universityId: 9,
      subjects: 'Physics',
      batch: 'Batch A',
      recruitType: 'General',
      groupCode: 'G9',
      majorCode: '0001',
      majorName: 'Candidate Major',
      year: 2025,
      groupMinRank: 120000,
      groupMinScore: 530,
      groupAdmissionCount: 10,
      majorMinRank: 120000,
      majorMinScore: 530,
      majorAdmissionCount: 10,
      ...overrides,
    };
  }

  function mockCandidateGroupRequest(options: {
    student?: any;
    plans: any[];
    records: any[];
  }) {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1,
      studentId: 10,
      batchName: 'Batch A',
      batchConfigId: 5,
      year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10,
      province: 'Sichuan',
      examType: 'PHYSICS',
      provincialRank: 156077,
      preferredMajors: [],
      preferredMajorCategories: [],
      excludedMajors: [],
      excludedMajorCategories: [],
      colorBlind: false,
      colorWeak: false,
      visionLeft: 5,
      visionRight: 5,
      isRural: false,
      tuitionBudget: 'UNLIMITED',
      acceptSinoForeign: true,
      acceptPrivate: 'RELAXED',
      user: { gender: 'male', ethnicity: 'Han' },
      ...options.student,
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 1 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce(options.plans)
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue(options.records);
  }

  beforeEach(async () => {
    prisma = {
      volunteerPlan: { findUnique: jest.fn() },
      studentProfile: { findUnique: jest.fn() },
      enrollmentPlan: {
        findMany: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]),
      },
      admissionRecord: { findMany: jest.fn() },
      rankPrediction: { findMany: jest.fn().mockResolvedValue([]) },
      batchLine: { findFirst: jest.fn().mockResolvedValue(null) },
      scoreSegment: { findFirst: jest.fn().mockResolvedValue(null) },
      supplementarySummary: { findMany: jest.fn().mockResolvedValue([]) },
      healthRestriction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    scoreSegment = { scoreToRank: jest.fn() };
    rankStrategy = {
      evaluateCandidate: jest.fn((input: any) =>
        Promise.resolve(makeRankStrategyResult('FORMAL', input.candidateRank)),
      ),
    };
    const mod = await Test.createTestingModule({
      providers: [
        PlanCandidateService,
        { provide: PrismaService, useValue: prisma },
        { provide: ScoreSegmentService, useValue: scoreSegment },
        { provide: RankStrategyService, useValue: rankStrategy },
      ],
    }).compile();
    service = mod.get(PlanCandidateService);
  });

  it('方案年份没有招生计划时回退到同批次最新可用年份', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批B段', batchConfigId: 22, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 18886 } }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 300, universityId: 3, majorId: 3, university: { name: 'C' }, major: { name: 'M3', code: '0806', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0806', subjects: '物理', batch: '本科批B段', groupCode: 'G3', majorName: 'M3' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    const r: any = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: true });

    expect(prisma.enrollmentPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          year: 2025,
          province: '四川',
          batch: '本科批B段',
          subjects: '物理',
        }),
      }),
    );
    expect(r.planYear).toBe(2026);
    expect(r.sourceYear).toBe(2025);
    expect(r.sourceBatchName).toBe('本科批B段');
    expect(r.isFallbackYear).toBe(true);
    expect(r.items).toHaveLength(1);
  });

  it('使用紧凑条件查询历史记录，避免为大量候选生成巨大 OR', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批B段', batchConfigId: 22, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 18886 } }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 300, universityId: 3, majorId: 3, university: { name: 'C' }, major: { name: 'M3', code: '0806', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0806', subjects: '物理', batch: '本科批B段', groupCode: 'G3', majorName: 'M3' },
      { id: 301, universityId: 4, majorId: 4, university: { name: 'D' }, major: { name: 'M4', code: '0807', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5200,
        majorCode: '0807', subjects: '物理', batch: '本科批B段', groupCode: 'G4', majorName: 'M4' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    await service.getCandidates(1, { page: 1, pageSize: 60, includeSoftFails: true });

    const where = prisma.admissionRecord.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where).toEqual(
      expect.objectContaining({
        year: { in: [2024, 2025] },
        subjects: { in: ['物理'] },
        batch: { in: ['本科批B段'] },
        recruitType: { in: ['普通类'] },
        universityId: { in: [3, 4] },
        groupCode: { in: ['G3', 'G4'] },
        majorCode: { in: ['0806', '0807'] },
      }),
    );
  });

  it('按页面大小限制招生计划预取量', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批B段', batchConfigId: 22, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 18886 } }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([]);

    await service.getCandidates(1, { page: 1, pageSize: 60, includeSoftFails: true });

    expect(prisma.enrollmentPlan.findMany.mock.calls[0][0].take).toBe(300);
  });

  it('PASS 排在 SOFT_FAIL 前', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批A段', batchConfigId: 5,
      year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 100, universityId: 1, majorId: 1, university: { name: 'A' }, major: { name: 'M1', code: '0805', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0805', subjects: '物理', batch: '本科批A段', groupCode: 'G1', majorName: 'M1' },
      { id: 101, universityId: 2, majorId: 2, university: { name: 'B' }, major: { name: 'M2', code: '1001', notes: '本专业仅限女生报考' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '1001', subjects: '物理', batch: '本科批A段', groupCode: 'G2', majorName: 'M2' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    const r = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: true });
    expect(r.items.length).toBe(2);
    expect(r.items[0].matchStatus).toBe('PASS');
    expect(r.items[1].matchStatus).toBe('SOFT_FAIL');
  });

  it('includeSoftFails=false 仅返回 PASS', async () => {
    // 同上 mock 设置...（此处略，实际写时复制上面 mock）
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批A段', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 101, universityId: 2, majorId: 2, university: { name: 'B' }, major: { name: 'M2', code: '1001', notes: '本专业仅限女生报考' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '1001', subjects: '物理', batch: '本科批A段', groupCode: 'G2', majorName: 'M2' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    const r = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: false });
    expect(r.items.length).toBe(0);
  });

  it('正确合并 AdmissionRecord 历史快照', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批A段', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 8000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 200, universityId: 1, majorId: 1, university: { name: 'A' }, major: { name: 'M', code: '0805', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0805', majorName: 'M', subjects: '物理', batch: '本科批A段', groupCode: 'G1' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      { universityId: 1, subjects: '物理', batch: '本科批A段', recruitType: '普通类',
        groupCode: 'G1', majorCode: '0805', majorName: 'M', year: 2025,
        groupMinRank: 10000, groupMinScore: 600, majorMinRank: 9500, majorMinScore: 605 },
    ]);

    const r = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: true });
    expect(r.items[0].history.rank25Group).toBe(10000);
    expect(r.items[0].suggestedGradient).toBe('BAO'); // 10000/8000 = 1.25
  });

  it('groups enrollment plans by university and major group with plan count and score comparison', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: ['Computer Science'], preferredMajorCategories: ['Engineering'],
      excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 2 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11, university: { id: 1, name: 'Alpha University', code: 'A01', is985: true, is211: true, isDoubleFirstClass: true },
          major: { id: 11, name: 'Computer Science', code: '080901', category: 'Engineering', discipline: 'Computer', softRating: 'A', description: 'CS detail', careerDirections: ['Engineer'], postgraduateDirections: ['AI'], coreCourses: ['Algorithms'], employmentRate: 95, avgSalary: 12000, degree: 'Bachelor', standardDuration: '4 years', localMasterPoint: true, localDoctoralPoint: false, satisfactionScore: 4.5 },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000, duration: '4 years',
          majorCode: '080901', majorName: 'Computer Science', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'Physics group', groupPlanCount: 30, subjectRequirements: 'Physics required',
          planCount: 10, disciplineEval: 'A-', isNationalFeature: true, majorRanking: 'Top 10', majorHonor: 'National feature',
        },
        {
          id: 101, universityId: 1, majorId: 12, university: { id: 1, name: 'Alpha University', code: 'A01', is985: true, is211: true, isDoubleFirstClass: true },
          major: { id: 12, name: 'Automation', code: '080801', category: 'Engineering', discipline: 'Automation', softRating: 'B+', description: 'Auto detail', careerDirections: ['Control'], postgraduateDirections: [], coreCourses: ['Control Theory'], employmentRate: 90, avgSalary: 10000, degree: 'Bachelor', standardDuration: '4 years', localMasterPoint: false, localDoctoralPoint: false, satisfactionScore: 4.1 },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5200, duration: '4 years',
          majorCode: '080801', majorName: 'Automation', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'Physics group', groupPlanCount: 30, subjectRequirements: 'Physics required',
          planCount: 20, disciplineEval: 'B+', isNationalFeature: false, majorRanking: null, majorHonor: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
          groupCode: 'G1', groupPlanCount: null, planCount: 9,
        },
        {
          universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
          groupCode: 'G1', groupPlanCount: null, planCount: 15,
        },
      ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080901', majorName: 'Computer Science', year: 2025,
        groupMinRank: 10000, groupMinScore: 610, groupAdmissionCount: 28,
        filingMinScore: 609, filingMinRank: 10100,
        majorMinRank: 9500, majorMinScore: 615, majorAdmissionCount: 9,
      },
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080901', majorName: 'Computer Science', year: 2024,
        groupMinRank: 12000, groupMinScore: 600, groupAdmissionCount: 24,
        filingMinScore: 599, filingMinRank: 12100,
        majorMinRank: 9800, majorMinScore: 605, majorAdmissionCount: 8,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toEqual(expect.objectContaining({
      groupKey: '1|G1|Batch A|General|Physics',
      universityName: 'Alpha University',
      groupCode: 'G1',
      currentPlanCount: 30,
      previousPlanCount: 24,
      planCountChange: 6,
      groupMinScore: 610,
      groupMinRank: 10000,
      scoreSource: 'GROUP',
      majorCount: 2,
      selectableMajorCount: 1,
      recommendedAnchorEnrollmentPlanId: 100,
    }));
    expect(result.groups[0].majorSections.recommended.map((major: any) => major.majorName)).toEqual(['Computer Science']);
    expect(result.groups[0].majorSections.risk.map((major: any) => major.majorName)).toEqual(['Automation']);
    expect(result.groups[0].majors[0]).toEqual(expect.objectContaining({
      enrollmentPlanId: 100,
      majorName: 'Computer Science',
      isRecommendedAnchor: true,
      majorMinScore: 615,
      majorMinRank: 9500,
    }));
  });

  it('filters empty groups when soft-fail majors are hidden', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: ['Medicine'], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 200, universityId: 2, majorId: 21, university: { id: 2, name: 'Beta Medical', code: 'B01' },
          major: { id: 21, name: 'Medicine', code: '100201', category: 'Medicine', discipline: 'Clinical' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 6000,
          majorCode: '100201', majorName: 'Medicine', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G2', groupName: 'Medical group', groupPlanCount: null, subjectRequirements: 'Physics required',
          planCount: 5,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: false, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('uses score-segment rank for fallback-year candidate groups when stored rank is impossible', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', totalScore: 479, provincialRank: 1,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 2 } }]);
    scoreSegment.scoreToRank.mockResolvedValue({ year: 2025, examType: 'Physics', score: 479, rank: 156000, percentile: 0.55 });
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 300, universityId: 3, majorId: 31, university: { id: 3, name: 'Close University', code: 'C' },
          major: { id: 31, name: 'Close Major', code: '0801', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '0801', majorName: 'Close Major', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G3', groupName: null, groupPlanCount: 10, subjectRequirements: '',
          planCount: 10, disciplineEval: '', isNationalFeature: false,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 3, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G3', majorCode: '0801', majorName: 'Close Major', year: 2025,
        groupMinRank: 155000, groupMinScore: 480, groupAdmissionCount: 10,
        majorMinRank: 155000, majorMinScore: 480, majorAdmissionCount: 10,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.studentRankUsed).toBe(156000);
    expect(result.studentRankSource).toBe('SCORE_SEGMENT');
    expect(result.storedRank).toBe(1);
    expect(result.scoreBasedRank).toBe(156000);
    expect(result.groups[0].suggestedGradient).toBe('WEN');
  });

  it('ranks admission fit ahead of generic major strength for teacher-facing groups', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 156000,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 400, universityId: 4, majorId: 41, university: { id: 4, name: 'Prestige University', code: 'P' },
          major: { id: 41, name: 'Strong Major', code: '0802', category: 'Engineering', employmentRate: 20 },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '0802', majorName: 'Strong Major', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G4', groupName: null, groupPlanCount: 10, subjectRequirements: '',
          planCount: 10, disciplineEval: 'A+', isNationalFeature: false,
        },
        {
          id: 500, universityId: 5, majorId: 51, university: { id: 5, name: 'Fit University', code: 'F' },
          major: { id: 51, name: 'Fit Major', code: '0803', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '0803', majorName: 'Fit Major', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G5', groupName: null, groupPlanCount: 10, subjectRequirements: '',
          planCount: 10, disciplineEval: '', isNationalFeature: false,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 4, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G4', majorCode: '0802', majorName: 'Strong Major', year: 2026,
        groupMinRank: 45000, groupMinScore: 570, majorMinRank: 45000, majorMinScore: 570,
      },
      {
        universityId: 5, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G5', majorCode: '0803', majorName: 'Fit Major', year: 2026,
        groupMinRank: 155000, groupMinScore: 480, majorMinRank: 155000, majorMinScore: 480,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups[0].universityName).toBe('Fit University');
    expect(result.groups[0].suggestedGradient).toBe('WEN');
    expect(result.groups[1].universityName).toBe('Prestige University');
    expect(result.groups[1].suggestedGradient).toBe('CHONG');
  });

  it('loads the full candidate group pool before sorting and paginating', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 156000,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    await service.getCandidateGroups(1, { page: 2, pageSize: 12, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(prisma.enrollmentPlan.findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it('ignores supplementary summaries from a different batch', async () => {
    prisma.supplementarySummary.findMany.mockResolvedValue([
      {
        universityId: 7,
        batch: 'Batch B',
        year: 2025,
        totalRounds: 2,
        totalPlanCount: 8,
        supplementaryRate: 0.18,
      },
    ]);

    const groups = new Map([
      ['7|G7|Batch A|General|Physics', [{ universityId: 7, batch: 'Batch A' }]],
    ]);
    const result: Map<string, any> = await (service as any).loadSupplementaryByGroup(groups, 'Sichuan', [2025]);

    expect(result.has('7|G7|Batch A|General|Physics')).toBe(false);
  });

  it('does not let university-batch supplementary summaries loosen group risk', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 10000,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 1 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 800, universityId: 8, majorId: 81, university: { id: 8, name: 'Scoped University', code: 'S' },
          major: { id: 81, name: 'Scoped Major', code: '0808', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '0808', majorName: 'Scoped Major', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G8', groupName: null, groupPlanCount: 10, subjectRequirements: '',
          planCount: 10, disciplineEval: '', isNationalFeature: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          universityId: 8, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
          groupCode: 'G8', groupPlanCount: 10, planCount: 10,
        },
      ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 8, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G8', majorCode: '0808', majorName: 'Scoped Major', year: 2025,
        groupMinRank: 10000, groupMinScore: 600, groupAdmissionCount: 10,
        majorMinRank: 10000, majorMinScore: 600, majorAdmissionCount: 10,
      },
    ]);
    prisma.supplementarySummary.findMany.mockResolvedValue([
      {
        universityId: 8,
        batch: 'Batch A',
        year: 2025,
        totalRounds: 3,
        totalPlanCount: 28,
        supplementaryRate: 933.33,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const group = result.groups[0];
    expect(group.supplementary).toEqual(expect.objectContaining({
      scope: 'UNIVERSITY_BATCH',
      totalPlanCount: 28,
    }));
    expect(group.dynamicGradient.adjustedMinRank).toBe(10000);
    expect(group.dynamicGradient.reasons).not.toEqual(expect.arrayContaining([
      expect.stringContaining('supplementary'),
    ]));
  });

  it('sorts candidate groups by supplementary rate when requested', () => {
    const groups = [
      {
        universityName: 'Low Supplementary',
        softFailCount: 0,
        suggestedGradient: 'WEN',
        dynamicGradient: { tier: 'WEN', adjustedMinRank: 10000, rankGapRatio: 0 },
        matchScore: 80,
        currentPlanCount: 50,
        supplementary: { supplementaryRate: 0.02, totalPlanCount: 2, totalRounds: 1 },
      },
      {
        universityName: 'High Supplementary',
        softFailCount: 0,
        suggestedGradient: 'WEN',
        dynamicGradient: { tier: 'WEN', adjustedMinRank: 10000, rankGapRatio: 0 },
        matchScore: 10,
        currentPlanCount: 5,
        supplementary: { supplementaryRate: 0.18, totalPlanCount: 8, totalRounds: 2 },
      },
    ];

    (service as any).sortCandidateGroups(groups, 'SUPPLEMENTARY_RATE_DESC', 10000);

    expect(groups.map((group) => group.universityName)).toEqual([
      'High Supplementary',
      'Low Supplementary',
    ]);
  });

  it('treats zero school ranking as missing when sorting by university rank', () => {
    const groups = [
      {
        universityName: 'Missing Rank University',
        universityRank: 0,
        university: { is985: true, is211: true, isDoubleFirstClass: true },
        softFailCount: 0,
        suggestedGradient: 'WEN',
        dynamicGradient: { tier: 'WEN', adjustedMinRank: 10000, rankGapRatio: 0 },
        matchScore: 80,
        currentPlanCount: 50,
      },
      {
        universityName: 'Ranked University',
        universityRank: 120,
        university: { is985: false, is211: false, isDoubleFirstClass: false },
        softFailCount: 0,
        suggestedGradient: 'WEN',
        dynamicGradient: { tier: 'WEN', adjustedMinRank: 10000, rankGapRatio: 0 },
        matchScore: 10,
        currentPlanCount: 5,
      },
    ];

    (service as any).sortCandidateGroups(groups, 'UNIVERSITY_RANK', 10000);

    expect(groups.map((group) => group.universityName)).toEqual([
      'Ranked University',
      'Missing Rank University',
    ]);
  });

  it('drops a group when all acceptable majors are clearly unreachable', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 900,
          university: { id: 9, name: 'Impossible University', code: 'I' },
          majorName: 'Impossible Major',
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          groupMinRank: 88,
          majorMinRank: 88,
          majorName: 'Impossible Major',
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('REJECTED', 88));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('keeps a group with a recommended major and puts the unreachable sibling into risk', async () => {
    mockCandidateGroupRequest({
      student: { preferredMajors: ['Preferred Major'] },
      plans: [
        makeGroupEnrollmentPlan({
          id: 901,
          majorId: 101,
          majorCode: '0001',
          majorName: 'Preferred Major',
          major: { id: 101, name: 'Preferred Major', code: '0001', category: 'Science' },
        }),
        makeGroupEnrollmentPlan({
          id: 902,
          majorId: 102,
          majorCode: '0002',
          majorName: 'Impossible Major',
          major: { id: 102, name: 'Impossible Major', code: '0002', category: 'Science' },
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          majorCode: '0001',
          majorName: 'Preferred Major',
          majorMinRank: 150000,
        }),
        makeGroupAdmissionRecord({
          majorCode: '0002',
          majorName: 'Impossible Major',
          majorMinRank: 88,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockImplementation(({ candidateRank }: any) =>
      Promise.resolve(
        candidateRank === 88
          ? makeRankStrategyResult('REJECTED', candidateRank)
          : makeRankStrategyResult('FORMAL', candidateRank),
      ),
    );

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].majorSections.recommended.map((major: any) => major.majorName)).toEqual(['Preferred Major']);
    expect(result.groups[0].majorSections.risk.map((major: any) => major.majorName)).toEqual(['Impossible Major']);
    expect(result.groups[0].majors.map((major: any) => major.majorName)).toEqual(['Preferred Major', 'Impossible Major']);
  });

  it('keeps a feasible non-preferred major as a backup group when the student has strict preferences', async () => {
    mockCandidateGroupRequest({
      student: { preferredMajors: ['Wanted Major'] },
      plans: [
        makeGroupEnrollmentPlan({
          id: 903,
          majorName: 'Other Major',
          major: { id: 103, name: 'Other Major', code: '0003', category: 'Science' },
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          majorName: 'Other Major',
          majorMinRank: 150000,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('FORMAL', 150000));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].selectableMajorCount).toBe(1);
    expect(result.groups[0].recommendedAnchorEnrollmentPlanId).toBe(903);
    expect(result.groups[0].majorSections.recommended).toHaveLength(0);
    expect(result.groups[0].majorSections.backup.map((major: any) => major.majorName)).toEqual(['Other Major']);
  });

  it('lets an unexcluded feasible major support a group when the student has no major preference', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 904,
          majorName: 'Open Major',
          major: { id: 104, name: 'Open Major', code: '0004', category: 'Science' },
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          majorName: 'Open Major',
          majorMinRank: 150000,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('FORMAL', 150000));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].majorSections.recommended[0].majorName).toBe('Open Major');
  });

  it('puts missing-rank majors into risk and does not let them support a group', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 905,
          majorName: 'New Major',
          major: { id: 105, name: 'New Major', code: '0005', category: 'Science' },
        }),
      ],
      records: [],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('INSUFFICIENT_DATA', null));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(0);
  });

  it('adds dynamic gradient details from competition and selection pool while exposing supplementary summaries', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 13000,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 2 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 700, universityId: 7, majorId: 71, university: { id: 7, name: 'Dynamic University', code: 'D' },
          major: { id: 71, name: 'Chemistry Engineering', code: '0813', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '0813', majorName: 'Chemistry Engineering', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G7', groupName: 'Chemistry group', groupPlanCount: 36, subjectRequirements: 'Physics and Chemistry required',
          planCount: 36, disciplineEval: '', isNationalFeature: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          universityId: 7, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
          groupCode: 'G7', groupPlanCount: 30, planCount: 30,
        },
      ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 7, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G7', majorCode: '0813', majorName: 'Chemistry Engineering', year: 2025,
        groupMinRank: 10000, groupMinScore: 590, groupAdmissionCount: 30,
        majorMinRank: 10000, majorMinScore: 590, majorAdmissionCount: 30,
      },
    ]);
    prisma.batchLine.findFirst
      .mockResolvedValueOnce({ score: 438 })
      .mockResolvedValueOnce({ score: 459 });
    prisma.scoreSegment.findFirst
      .mockResolvedValueOnce({ cumulativeCount: 190000 })
      .mockResolvedValueOnce({ cumulativeCount: 210000 });
    prisma.supplementarySummary.findMany.mockResolvedValue([
      {
        universityId: 7,
        batch: 'Batch A',
        year: 2025,
        totalRounds: 2,
        totalPlanCount: 8,
        supplementaryRate: 0.18,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const group = result.groups[0];
    expect(group.suggestedGradient).toBe('CHONG');
    expect(group.dynamicGradient.adjustedMinRank).toBeGreaterThan(10000);
    expect(group.dynamicGradient.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('plan increased'),
      expect.stringContaining('competition pool decreased'),
    ]));
    expect(group.dynamicGradient.reasons).not.toEqual(expect.arrayContaining([
      expect.stringContaining('supplementary'),
    ]));
    expect(group.competition.currentCount).toBe(190000);
    expect(group.competition.previousCount).toBe(210000);
    expect(group.selectionCompetition.eligibleCount).toBe(308010);
    expect(group.supplementary.totalPlanCount).toBe(8);
    expect(group.supplementary.scope).toBe('UNIVERSITY_BATCH');
  });
});
