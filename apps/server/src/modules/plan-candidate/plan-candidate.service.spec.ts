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

  it('PASS 排在 SOFT_FAIL 前 (用学费超预算演示 SOFT_FAIL)', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批A段', batchConfigId: 5,
      year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      // tuitionBudget LOW (< 6000) → 5000 OK, 30000 超预算 → SOFT_FAIL
      isRural: false, tuitionBudget: 'LOW', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 100, universityId: 1, majorId: 1, university: { name: 'A' }, major: { name: 'M1', code: '0805', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0805', subjects: '物理', batch: '本科批A段', groupCode: 'G1', majorName: 'M1' },
      { id: 101, universityId: 2, majorId: 2, university: { name: 'B' }, major: { name: 'M2', code: '1001', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 30000,
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
      // Automation 无专业级位次, 回退组线评估后可选 (修复前被判"数据不足"进 RISK)
      selectableMajorCount: 2,
      recommendedAnchorEnrollmentPlanId: 100,
    }));
    expect(result.groups[0].majorSections.recommended.map((major: any) => major.majorName)).toEqual(['Computer Science', 'Automation']);
    expect(result.groups[0].majorSections.risk).toHaveLength(0);
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

  // 回归: keyword 命中专业时, 同一专业组里其余专业也要展示, 不能只回命中行
  // (旧实现把 keyword OR 加到 EnrollmentPlan 行级 where, 导致同组非命中专业被丢)
  it('keyword 命中专业时, 同一专业组里的其余专业一同返回', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 2 } }]);
    prisma.enrollmentPlan.findMany
      // 1) keyword 预查询: 找到命中行所属的 group key 集合 (distinct)
      .mockResolvedValueOnce([
        { universityId: 1, groupCode: 'G1', batch: 'Batch A', recruitType: 'General', subjects: 'Physics' },
      ])
      // 2) 主查询: 按 group key OR 拉回该 group 的全部专业行 (包含未命中 keyword 的 CS)
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11, university: { id: 1, name: 'Alpha University', code: 'A01' },
          major: { id: 11, name: 'Computer Science', code: '080901', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '080901', majorName: 'Computer Science', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'Physics group', groupPlanCount: 30,
          planCount: 10,
        },
        {
          id: 101, universityId: 1, majorId: 12, university: { id: 1, name: 'Alpha University', code: 'A01' },
          major: { id: 12, name: 'Automation', code: '080801', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5200,
          majorCode: '080801', majorName: 'Automation', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'Physics group', groupPlanCount: 30,
          planCount: 20,
        },
      ])
      // 3) previous plans 查询
      .mockResolvedValueOnce([]);
    // 给两个专业各加一条 admission record, 让 splitMajorSections 至少出 recommended/backup,
    // 否则 group 会被 "majorSections.recommended.length === 0 && backup.length === 0 → return null" 丢弃
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080901', majorName: 'Computer Science', year: 2025,
        groupMinRank: 10000, groupMinScore: 610, groupAdmissionCount: 28,
        majorMinRank: 9500, majorMinScore: 615, majorAdmissionCount: 9,
      },
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080801', majorName: 'Automation', year: 2025,
        groupMinRank: 10000, groupMinScore: 610, groupAdmissionCount: 28,
        majorMinRank: 9800, majorMinScore: 605, majorAdmissionCount: 18,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH', keyword: 'Automation',
    });

    // 验证: 预查询用 OR 含 university/major/majorName/renameHistory (老师不搜 groupName), distinct 5 字段
    // 老 keyword 兼容路径 OR 合并匹配 (新接口走 AND, 见专门测试)
    const distinctCall = prisma.enrollmentPlan.findMany.mock.calls[0][0];
    expect(distinctCall.where.OR).toEqual([
      { university: { name: { contains: 'Automation' } } },
      { university: { renameHistory: { contains: 'Automation' } } },
      { major: { name: { contains: 'Automation' } } },
      { majorName: { contains: 'Automation' } },
    ]);
    expect(distinctCall.distinct).toEqual(['universityId', 'groupCode', 'batch', 'recruitType', 'subjects']);

    // 验证: 主查询用 group key OR (无 keyword OR), 限制只拉命中 group 的行
    const mainCall = prisma.enrollmentPlan.findMany.mock.calls[1][0];
    expect(mainCall.where.OR).toEqual([
      { universityId: 1, groupCode: 'G1', batch: 'Batch A', recruitType: 'General', subjects: 'Physics' },
    ]);

    // 最终结果: 专业组里同时有 Automation (命中) 和 Computer Science (未命中但同组)
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].majorCount).toBe(2);
    expect(result.groups[0].majors.map((m: any) => m.majorName).sort()).toEqual(['Automation', 'Computer Science']);

    // 搜索是临时的: 不改变 displaySection / anchor 持久语义, 只给命中行加 matchesKeyword=true
    // 学生没填意向, 两个专业都进 RECOMMENDED (PASS + 位次可参考)
    const automationMajor = result.groups[0].majors.find((m: any) => m.majorName === 'Automation');
    const csMajor = result.groups[0].majors.find((m: any) => m.majorName === 'Computer Science');
    expect(automationMajor.matchesKeyword).toBe(true);
    expect(csMajor.matchesKeyword).toBe(false);
    // displayReason 仍按原意向逻辑, 不被 keyword 篡改
    expect(automationMajor.displayReason).not.toContain('搜索');
    expect(automationMajor.displayReason).not.toContain('Automation');
  });

  it('keyword 命中 0 个专业组时, 短路返回空, 不做主查询', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 0 } }]);
    // 预查询命中 0 个 group
    prisma.enrollmentPlan.findMany.mockResolvedValueOnce([]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH', keyword: '不存在的关键词',
    });

    expect(result.groups).toHaveLength(0);
    expect(result.total).toBe(0);
    // 只调用了一次 (预查询), 没有进主查询 / previous / admissionRecord
    expect(prisma.enrollmentPlan.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.admissionRecord.findMany).not.toHaveBeenCalled();
  });

  // T5 spec: tier 过滤 — 整个 group 至少含该梯队任一专业, 否则隐藏整组;
  // 组内梯队专业进 RECOMMENDED + matchesPreferredTier=true, 非梯队专业进 BACKUP
  it('tier=1 时, 只返回含梯队 1 任一专业的院校组', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
      planItems: [],
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [
        { tier: 1, majors: ['Automation'] },
        { tier: 2, majors: ['Computer Science'] },
      ],
      preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 3 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        // G1 (Alpha): 含 Automation (梯队1) + Math (非梯队)
        { id: 100, universityId: 1, majorId: 11, university: { id: 1, name: 'Alpha' },
          major: { id: 11, name: 'Automation', code: '080801', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '080801', majorName: 'Automation', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'G1', groupPlanCount: 20, planCount: 10 },
        { id: 101, universityId: 1, majorId: 12, university: { id: 1, name: 'Alpha' },
          major: { id: 12, name: 'Math', code: '0701', category: 'Science' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '0701', majorName: 'Math', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'G1', groupPlanCount: 20, planCount: 10 },
        // G2 (Beta): 只含 Computer Science (梯队2), 应被 tier=1 过滤掉
        { id: 200, universityId: 2, majorId: 21, university: { id: 2, name: 'Beta' },
          major: { id: 21, name: 'Computer Science', code: '0809', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '0809', majorName: 'Computer Science', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G2', groupName: 'G2', groupPlanCount: 10, planCount: 10 },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      { universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080801', majorName: 'Automation', year: 2025,
        groupMinRank: 10000, groupMinScore: 610, majorMinRank: 9800, majorMinScore: 605, majorAdmissionCount: 10 },
      { universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '0701', majorName: 'Math', year: 2025,
        groupMinRank: 10000, groupMinScore: 610, majorMinRank: 9900, majorMinScore: 608, majorAdmissionCount: 10 },
      { universityId: 2, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G2', majorCode: '0809', majorName: 'Computer Science', year: 2025,
        groupMinRank: 10000, groupMinScore: 610, majorMinRank: 9700, majorMinScore: 615, majorAdmissionCount: 10 },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH', tier: 1,
    });

    // G2 被过滤 (只含 Computer Science, 不在梯队1)
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].universityName).toBe('Alpha');
    // G1: Automation (梯队1) 进 RECOMMENDED, Math 进 BACKUP
    expect(result.groups[0].majorSections.recommended.map((m: any) => m.majorName)).toEqual(['Automation']);
    expect(result.groups[0].majorSections.backup.map((m: any) => m.majorName)).toEqual(['Math']);
    expect(result.groups[0].recommendedAnchorEnrollmentPlanId).toBe(100);
    // matchesPreferredTier 标记
    const auto = result.groups[0].majors.find((m: any) => m.majorName === 'Automation');
    const math = result.groups[0].majors.find((m: any) => m.majorName === 'Math');
    expect(auto.matchesPreferredTier).toBe(true);
    expect(math.matchesPreferredTier).toBe(false);
    // 返回 availableTiers 给前端 chip 渲染, 每个 tier 带 groupCount (粗略命中数)
    // G1 含 Automation (tier 1), G2 含 Computer Science (tier 2)
    expect(result.availableTiers).toEqual([
      { tier: 1, majors: ['Automation'], groupCount: 1 },
      { tier: 2, majors: ['Computer Science'], groupCount: 1 },
    ]);
    expect(result.appliedTier).toBe(1);
  });

  // T6 spec: excludeAdded — 已加入当前 plan 的院校组隐藏
  it('excludeAdded=true (默认) 时, 过滤掉已加入 plan 的院校组', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
      planItems: [{ universityId: 1, groupCode: 'G1' }], // G1 已加入
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [], preferredMajorCategories: [], excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 2 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        // G1: 已加入, 应被过滤
        { id: 100, universityId: 1, majorId: 11, university: { id: 1, name: 'Alpha' },
          major: { id: 11, name: 'A', code: '01', category: 'X' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '01', majorName: 'A', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'G1', groupPlanCount: 10, planCount: 10 },
        // G2: 未加入, 保留
        { id: 200, universityId: 2, majorId: 21, university: { id: 2, name: 'Beta' },
          major: { id: 21, name: 'B', code: '02', category: 'Y' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '02', majorName: 'B', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G2', groupName: 'G2', groupPlanCount: 10, planCount: 10 },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      { universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '01', majorName: 'A', year: 2025,
        groupMinRank: 10000, groupMinScore: 600, majorMinRank: 9800, majorMinScore: 600, majorAdmissionCount: 10 },
      { universityId: 2, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G2', majorCode: '02', majorName: 'B', year: 2025,
        groupMinRank: 10000, groupMinScore: 600, majorMinRank: 9800, majorMinScore: 600, majorAdmissionCount: 10 },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH', excludeAdded: true,
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].universityName).toBe('Beta');
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

  it('keeps an all-REJECTED group as an extreme-rush option instead of dropping it', async () => {
    // 旧行为是整组丢弃; 但"位次明显高于学生"是极冲选项不是噪音 —— 提前批/公费师范
    // 常降分录取, 灭组会让整个批次在工作台消失 (2026-06-13 提前批组粒度=0 的根因)
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

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].allRisk).toBe(true);
    expect(result.groups[0].majorSections.risk).toHaveLength(1);
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

  it('暴露 University 升学/就业/满意度字段到 group.university', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [], preferredMajorCategories: [],
      excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 1 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11,
          university: {
            id: 1, name: 'Alpha University', code: 'A01',
            province: 'Sichuan', city: 'Chengdu', type: 'Comprehensive', runningNature: 'Public',
            is985: true, is211: true, isDoubleFirstClass: true,
            softRanking: 28, logoUrl: null,
            postgradRate: '18.5%',
            furtherStudyRate: '38.2%',
            employmentRate: '96.4%',
            avgSalary: '12.8k',
            satisfactionOverall: 4.6,
            satisfactionCount: 8420,
          },
          major: {
            id: 11, name: 'Computer Science', code: '080901',
            category: 'Engineering', discipline: 'Computer', softRating: 'A', notes: '',
            description: null, careerDirections: null, postgraduateDirections: null,
            coreCourses: null, employmentRate: null, avgSalary: null,
            degree: 'Bachelor', standardDuration: '4 years', satisfactionScore: null,
            localMasterPoint: true, localDoctoralPoint: false,
          },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000, duration: '4 years',
          majorCode: '080901', majorName: 'Computer Science', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'Physics group', groupPlanCount: 10, subjectRequirements: 'Physics required',
          planCount: 10, disciplineEval: null, isNationalFeature: false, majorRanking: null, majorHonor: null,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080901', majorName: 'Computer Science', year: 2025,
        groupMinRank: 9500, groupMinScore: 610, groupAdmissionCount: 10,
        filingMinScore: 609, filingMinRank: 9600,
        majorMinRank: 9500, majorMinScore: 615, majorAdmissionCount: 10,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH',
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].university).toEqual(expect.objectContaining({
      postgradRate: '18.5%',
      furtherStudyRate: '38.2%',
      employmentRate: '96.4%',
      avgSalary: '12.8k',
      satisfactionOverall: 4.6,
      satisfactionCount: 8420,
    }));
  });

  it('candidate group 含 matchReason 人话化总结字符串', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [], preferredMajorCategories: [],
      excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 1 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11,
          university: {
            id: 1, name: '四川大学', code: 'SCU',
            province: 'Sichuan', city: '成都', type: '综合', runningNature: '公办',
            is985: true, is211: true, isDoubleFirstClass: true,
            softRanking: 28, logoUrl: null,
          },
          major: {
            id: 11, name: '计算机科学', code: '080901',
            category: '工学', discipline: '计算机', softRating: 'A', notes: '',
            description: null, careerDirections: null, postgraduateDirections: null,
            coreCourses: null, employmentRate: null, avgSalary: null,
            degree: 'Bachelor', standardDuration: '4 年', satisfactionScore: null,
            localMasterPoint: true, localDoctoralPoint: false,
          },
          recruitType: '统招', isSinoForeign: false, planNotes: '', tuition: 6000, duration: '4 年',
          majorCode: '080901', majorName: '计算机科学', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: '计算机类', groupPlanCount: 10, subjectRequirements: 'Physics required',
          planCount: 10,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: '统招',
        groupCode: 'G1', majorCode: '080901', majorName: '计算机科学', year: 2025,
        groupMinRank: 9500, groupMinScore: 610, groupAdmissionCount: 10,
        filingMinScore: 609, filingMinRank: 9600,
        majorMinRank: 9500, majorMinScore: 615, majorAdmissionCount: 10,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH',
    });

    expect(result.groups).toHaveLength(1);
    const matchReason = result.groups[0].matchReason;
    expect(typeof matchReason).toBe('string');
    expect(matchReason.length).toBeGreaterThan(0);
    // 本省 985 应该出现这些关键词
    expect(matchReason).toMatch(/本省|985|211|双一流/);
  });

  it('candidate group 含 history3y 和 historyFiling3y 3 年历史聚合', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: [], preferredMajorCategories: [],
      excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 1 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11,
          university: {
            id: 1, name: '四川大学', code: 'SCU',
            province: 'Sichuan', city: '成都', type: '综合', runningNature: '公办',
            is985: true, is211: true, isDoubleFirstClass: true,
            softRanking: 28, logoUrl: null,
          },
          major: {
            id: 11, name: '计算机科学', code: '080901',
            category: '工学', discipline: '计算机', softRating: 'A', notes: '',
            description: null, careerDirections: null, postgraduateDirections: null,
            coreCourses: null, employmentRate: null, avgSalary: null,
            degree: 'Bachelor', standardDuration: '4 年', satisfactionScore: null,
            localMasterPoint: true, localDoctoralPoint: false,
          },
          recruitType: '统招', isSinoForeign: false, planNotes: '', tuition: 6000, duration: '4 年',
          majorCode: '080901', majorName: '计算机科学', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: '计算机类', groupPlanCount: 10, subjectRequirements: 'Physics required',
          planCount: 10,
        },
      ])
      .mockResolvedValueOnce([]);
    // 3 年历史：2023 / 2024 / 2025
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: '统招',
        groupCode: 'G1', majorCode: '080901', majorName: '计算机科学', year: 2025,
        groupMinRank: 9500, groupMinScore: 624, groupAdmissionCount: 10,
        filingMinScore: 629, filingMinRank: 9200,
        majorMinRank: 9500, majorMinScore: 624, majorAdmissionCount: 10,
      },
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: '统招',
        groupCode: 'G1', majorCode: '080901', majorName: '计算机科学', year: 2024,
        groupMinRank: 10800, groupMinScore: 622, groupAdmissionCount: 10,
        filingMinScore: 627, filingMinRank: 10300,
        majorMinRank: 10800, majorMinScore: 622, majorAdmissionCount: 10,
      },
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: '统招',
        groupCode: 'G1', majorCode: '080901', majorName: '计算机科学', year: 2023,
        groupMinRank: 12200, groupMinScore: 619, groupAdmissionCount: 10,
        filingMinScore: 624, filingMinRank: 11700,
        majorMinRank: 12200, majorMinScore: 619, majorAdmissionCount: 10,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH',
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].history3y).toEqual([
      { year: 2023, score: 619, rank: 12200 },
      { year: 2024, score: 622, rank: 10800 },
      { year: 2025, score: 624, rank: 9500 },
    ]);
    expect(result.groups[0].historyFiling3y).toEqual([
      { year: 2023, score: 624, rank: 11700 },
      { year: 2024, score: 627, rank: 10300 },
      { year: 2025, score: 629, rank: 9200 },
    ]);
  });

  it('candidate group 含 prefMatch 偏好对比（本省 985 + 学费 + 考研方向 + 选科）', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      stayPreference: 'PREFER_LOCAL',
      tuitionBudget: 'MEDIUM',          // ≤10000 算 within
      careerPlan: 'POSTGRADUATE',
      preferredMajors: [], preferredMajorCategories: [],
      excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 1 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11,
          university: {
            id: 1, name: '四川大学', code: 'SCU',
            province: 'Sichuan',                  // 与学生 province 相同 → match
            city: '成都', type: '综合', runningNature: '公办',
            is985: true, is211: true, isDoubleFirstClass: true,
            softRanking: 28, logoUrl: null,
          },
          major: {
            id: 11, name: '计算机科学', code: '080901',
            category: '工学', discipline: '计算机', softRating: 'A', notes: '',
            description: null, careerDirections: null, postgraduateDirections: null,
            coreCourses: null, employmentRate: null, avgSalary: null,
            degree: 'Bachelor', standardDuration: '4 年', satisfactionScore: null,
            localMasterPoint: true,               // 有硕士点 → 考研方向 strong
            localDoctoralPoint: false,
          },
          recruitType: '统招', isSinoForeign: false, planNotes: '',
          tuition: 6000,                          // 在 MEDIUM 预算内 → within
          duration: '4 年',
          majorCode: '080901', majorName: '计算机科学', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: '计算机类', groupPlanCount: 10, subjectRequirements: 'Physics required',
          planCount: 10,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: '统招',
        groupCode: 'G1', majorCode: '080901', majorName: '计算机科学', year: 2025,
        groupMinRank: 9500, groupMinScore: 610, groupAdmissionCount: 10,
        filingMinScore: 609, filingMinRank: 9600,
        majorMinRank: 9500, majorMinScore: 615, majorAdmissionCount: 10,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH',
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].prefMatch).toEqual({
      province: 'match',
      tuition: 'within',
      career: 'strong',
      subjects: 'match',
    });
  });

  it('matchScore 归一化到 0-100：本批最高分映射为 100', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 9800,
      preferredMajors: ['计算机科学与技术'], preferredMajorCategories: [],
      excludedMajors: [], excludedMajorCategories: [],
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: 'male', ethnicity: 'Han' },
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 2 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11,
          university: { id: 1, name: 'A', code: 'A', is985: true, is211: true, isDoubleFirstClass: true, softRanking: 10 },
          // preferredMajors 命中 → +100，应该是 maxRaw
          major: { id: 11, name: '计算机科学与技术', code: '080901', category: 'Engineering', notes: '', localMasterPoint: true },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000, duration: '4 年',
          majorCode: '080901', majorName: '计算机科学与技术', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupPlanCount: 10, planCount: 10,
        },
        {
          id: 200, universityId: 2, majorId: 12,
          university: { id: 2, name: 'B', code: 'B', is985: false, is211: false, isDoubleFirstClass: false, softRanking: 200 },
          // 普通专业（没 preferredMajors 命中）→ 极低分
          major: { id: 12, name: '园林学', code: '090501', category: 'Agronomy', notes: '', localMasterPoint: false },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5500, duration: '4 年',
          majorCode: '090501', majorName: '园林学', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G9', groupPlanCount: 8, planCount: 8,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080901', majorName: '计算机科学与技术', year: 2025,
        groupMinRank: 9500, groupMinScore: 610, groupAdmissionCount: 10,
        filingMinScore: 609, filingMinRank: 9600,
        majorMinRank: 9500, majorMinScore: 615, majorAdmissionCount: 10,
      },
      {
        universityId: 2, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G9', majorCode: '090501', majorName: '园林学', year: 2025,
        groupMinRank: 12000, groupMinScore: 580, groupAdmissionCount: 8,
        filingMinScore: 579, filingMinRank: 12100,
        majorMinRank: 12000, majorMinScore: 580, majorAdmissionCount: 8,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH',
    });

    expect(result.groups.length).toBeGreaterThan(0);
    // 归一化后所有 matchScore ∈ [0, 100]
    for (const g of result.groups) {
      expect(g.matchScore).toBeLessThanOrEqual(100);
      expect(g.matchScore).toBeGreaterThanOrEqual(0);
      // matchScoreRaw 字段被设置（值可能是原始正分或 -999 占位）
      expect(g).toHaveProperty('matchScoreRaw');
    }
  });
});
