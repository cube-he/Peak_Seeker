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
      admissionRecord: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([{ year: 2025 }]) },
      rankPrediction: { findMany: jest.fn().mockResolvedValue([]) },
      batchLine: { findFirst: jest.fn().mockResolvedValue(null) },
      scoreSegment: { findFirst: jest.fn().mockResolvedValue(null), groupBy: jest.fn().mockResolvedValue([{ year: 2025 }]) },
      supplementarySummary: { findMany: jest.fn().mockResolvedValue([]) },
      supplementaryRecord: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('2026 计划入库时解耦三个年份：sourceYear=2026, 录取/段表基线=2025', async () => {
    mockCandidateGroupRequest({
      plans: [makeGroupEnrollmentPlan()],
      records: [makeGroupAdmissionRecord({ year: 2025 })],
    });
    // 计划已有 2026 行；录取/段表仍止于 2025
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
    prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);
    prisma.scoreSegment.groupBy.mockResolvedValue([{ year: 2025 }]);

    const r: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(r.sourceYear).toBe(2026);
    expect(r.admissionBaselineYear).toBe(2025);
    expect(r.scoreSegmentYear).toBe(2025);
  });

  it('keystone: 2026 计划入库、录取止于 2025 时，组仍读 2025 线与梯度（不塌成无史线）', async () => {
    mockCandidateGroupRequest({
      plans: [makeGroupEnrollmentPlan()],
      records: [makeGroupAdmissionRecord({ year: 2025 })],
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
    prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);

    const r: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    // 解耦前：sourceYear=2026 严格取 2026 录取 → 空 → 全组 baseMinRank=null → 进 noLine 桶
    // 解耦后：录取线读 admissionBaselineYear=2025 → 有 baseMinRank、不进 noLine
    expect(r.groups).toHaveLength(1);
    expect(r.tierCounts.noLine).toBe(0);
    expect(r.groups[0].dynamicGradient.baseMinRank).not.toBeNull();
  });

  it('2026 场景下征集历史按 admissionBaselineYear=2025 取数（第3参为年份）', async () => {
    mockCandidateGroupRequest({
      plans: [makeGroupEnrollmentPlan()],
      records: [makeGroupAdmissionRecord({ year: 2025 })],
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
    prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);
    const supplSpy = jest.spyOn(service as any, 'loadSupplementaryByGroup');

    await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(supplSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), 2025, expect.anything());
  });

  it('2026 场景下 score↔rank 换算用 scoreSegmentYear=2025（不是 2026）', async () => {
    mockCandidateGroupRequest({
      plans: [makeGroupEnrollmentPlan()],
      records: [makeGroupAdmissionRecord({ year: 2025 })],
    });
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
    prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);
    prisma.scoreSegment.groupBy.mockResolvedValue([{ year: 2025 }]);
    scoreSegment.scoreToRank.mockResolvedValue({ rank: 50000, score: 600 });

    await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH', minScore: 580, maxScore: 620 });

    expect(scoreSegment.scoreToRank).toHaveBeenCalled();
    for (const call of scoreSegment.scoreToRank.mock.calls) {
      expect(call[0]).toBe(2025);
    }
  });

  it('pickGroupScore: 基线年无记录时回退到 ≤基线年的最近有线年份', async () => {
    // 组只有 2024 录取，基线年 2025 无记录 → 应回退取 2024 线
    const records = [makeGroupAdmissionRecord({ year: 2024, groupMinRank: 99000, groupMinScore: 540 })];
    const res = (service as any).pickGroupScore(records, 2025);
    expect(res.groupMinRank).toBe(99000);
    expect(res.scoreSource).toBe('GROUP');
  });

  it('getCandidates(次要路径) 用 admissionBaselineYear 查历史线（基线=2024 时取 2024 记录）', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026 });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    // 计划年 2026，但录取只到 2024 → admissionBaselineYear=2024
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
    prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2024 }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 300, universityId: 3, majorId: 3, university: { name: 'C' }, major: { name: 'M3', code: '0806', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0806', subjects: '物理', batch: 'Batch A', groupCode: 'G3', majorName: 'M3' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      { universityId: 3, subjects: '物理', batch: 'Batch A', recruitType: '普通类', groupCode: 'G3',
        majorCode: '0806', majorName: 'M3', year: 2024, groupMinRank: 88000, groupMinScore: 560, majorMinRank: 88000, majorMinScore: 560 },
    ]);

    const r: any = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: true });

    expect(r.admissionBaselineYear).toBe(2024);
    // 解耦前：getHist 硬编码查 "|2025" 键 → 2024 记录取不到 → null
    // 解耦后：基线=2024，当前年槽取到 2024 的线
    expect(r.items[0].history.rank25Group).toBe(88000);
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
          bookPageNumber: 42,
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
        // 去年同组: group_plan_count=24 (组级整组计划), 年度对比用它而非逐行求和
        // sourceYear=2025 → 上一年 2024; previousPlanCount 现按 year===sourceYear-1 过滤(4年聚合)
        {
          universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
          groupCode: 'G1', year: 2024, majorCode: '080901', groupPlanCount: 24, planCount: 9,
        },
        {
          universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
          groupCode: 'G1', year: 2024, majorCode: '080801', groupPlanCount: 24, planCount: 15,
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
    // 2026 招生考试报页码 透出: fixture EP.bookPageNumber=42 → CandidateMajor.bookPageNumber=42.
    // Automation 行(id=101) fixture 未设 → null (历史年 EP 也是 null, 历史不挂规则)
    expect(result.groups[0].majors[0].bookPageNumber).toBe(42);
    const autoMajor = result.groups[0].majors.find((m: any) => m.majorCode === '080801');
    expect(autoMajor.bookPageNumber).toBeNull();

    // ---- 专业优先模式: 每个 CandidateMajor 暴露 4 年历史(min/avg score+rank + planCount)
    // years = [-3, -2, -1, admissionBaselineYear] = [2022, 2023, 2024, 2025] (按年升序, 与 history3y 一致).
    // fixture 有 2025/2024 majorCode='080901' record, 2023/2022 缺 → null. Automation 全缺 → 4 个 null record.
    const csMajor = result.groups[0].majors.find((m: any) => m.majorCode === '080901');
    expect(csMajor.majorHistory4y).toHaveLength(4);
    expect(csMajor.majorHistory4y.map((h: any) => h.year)).toEqual([2022, 2023, 2024, 2025]);
    expect(csMajor.majorHistory4y[0].minScore).toBeNull();
    expect(csMajor.majorHistory4y[1].minScore).toBeNull();
    expect(csMajor.majorHistory4y[2]).toEqual({
      year: 2024, minScore: 605, minRank: 9800,
      avgScore: null, avgRank: null,
      planCount: 9, // 去年 EP.planCount(2024 previousPlans 里 080901=9)
    });
    expect(csMajor.majorHistory4y[3]).toEqual({
      year: 2025, minScore: 615, minRank: 9500,
      avgScore: null, avgRank: null, // fixture 未 mock avg* → null
      planCount: 10, // 当前年 EP.planCount(2025 计划记录里 080901=10)
    });

    // ---- 组级 previousMajorsAdmissionSum2025: 用本组 majorCode 列表回查 sourceYear-1 录取数和.
    // sourceYear=2025 → 取 2024 录取: 080901 majorAdmissionCount=8; 080801 无 record → sum=8.
    expect(result.groups[0].previousMajorsAdmissionSum2025).toBe(8);
  });

  it('全组所有专业上一年均无录取记录时, previousMajorsAdmissionSum2025 为 null', async () => {
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
    prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2025, _count: { _all: 1 } }]);
    prisma.enrollmentPlan.findMany
      .mockResolvedValueOnce([
        {
          id: 200, universityId: 2, majorId: 21,
          university: { id: 2, name: 'Beta University', code: 'B01' },
          major: { id: 21, name: 'Brand New Major', code: '999999', category: 'X' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '999999', majorName: 'Brand New Major', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G2', groupName: 'Physics group', groupPlanCount: 10,
          subjectRequirements: 'Physics required', planCount: 10,
        },
      ])
      .mockResolvedValueOnce([]); // 去年无任何 EP
    // 只有当前年 record, 上一年(2024) 无任何 majorCode 命中
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 2, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G2', majorCode: '999999', majorName: 'Brand New Major', year: 2025,
        groupMinRank: 50000, groupMinScore: 540, groupAdmissionCount: 10,
        majorMinRank: 50000, majorMinScore: 540, majorAdmissionCount: 10,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });
    expect(result.groups).toHaveLength(1);
    // 全组上一年(2024) 无录取 → null (而非 0, 避免显示"招生 X vs 去年 0 人"误导)
    expect(result.groups[0].previousMajorsAdmissionSum2025).toBeNull();
  });

  it('去年缺 group_plan_count 时不逐行求和, previousPlanCount/planCountChange 置空', async () => {
    // 复现生产数据形态: 当前年 group_plan_count 齐全(每行=组总数 245);
    // 去年 group_plan_count 全 NULL 且 plan_count 存的是组级数(187/228)复制到每行。
    // 旧逻辑会把去年逐行求和(187+228=415)当组总数 → 卡片显示假"计划变动"(planCountChange 错位)。
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
      .mockResolvedValueOnce([
        {
          id: 100, universityId: 1, majorId: 11, university: { id: 1, name: 'Alpha University', code: 'A01' },
          major: { id: 11, name: 'Computer Science', code: '080901', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '080901', majorName: 'Computer Science', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'Physics group', groupPlanCount: 245, subjectRequirements: 'Physics required',
          planCount: 21,
        },
        {
          id: 101, universityId: 1, majorId: 12, university: { id: 1, name: 'Alpha University', code: 'A01' },
          major: { id: 12, name: 'Software Engineering', code: '080902', category: 'Engineering' },
          recruitType: 'General', isSinoForeign: false, planNotes: '', tuition: 5000,
          majorCode: '080902', majorName: 'Software Engineering', subjects: 'Physics', batch: 'Batch A',
          groupCode: 'G1', groupName: 'Physics group', groupPlanCount: 245, subjectRequirements: 'Physics required',
          planCount: 2,
        },
      ])
      .mockResolvedValueOnce([
        { universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General', groupCode: 'G1', groupPlanCount: null, planCount: 187 },
        { universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General', groupCode: 'G1', groupPlanCount: null, planCount: 228 },
      ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 1, subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G1', majorCode: '080901', majorName: 'Computer Science', year: 2025,
        groupMinRank: 10000, groupMinScore: 610, groupAdmissionCount: 28,
        majorMinRank: 9500, majorMinScore: 615, majorAdmissionCount: 21,
      },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toEqual(expect.objectContaining({
      currentPlanCount: 245,
      previousPlanCount: null,
      planCountChange: null,
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

  // 验证: 院校优先(groupBy=UNIVERSITY)视图同样应用硬规则(剔除)+软规则(includeSoftFails 控显隐)。
  // 硬/软过滤都在"建组层"(上卷之前)执行, 院校卡复用同一份 value.groups → 两条规则自动透传到院校视图。
  // 此前 groupBy=UNIVERSITY 路径无集成测试, 这里补特征测试, 既证明院校优先规则确实生效, 也防回归。
  describe('groupBy=UNIVERSITY 视图应用硬规则与软规则', () => {
    // 同一所院校(id 9)同一个组(G9)放三个专业:
    //   计算机科学 = PASS (学费 5000, 在 LOW 预算内)
    //   护理学     = 硬规则失败 (planNotes 仅限女生, 男生 → 直接剔除, 不进任何分区)
    //   临床医学   = 软规则失败 (学费 30000 超 LOW 预算 → TuitionRule SOFT_FAIL, 由 includeSoftFails 控显隐)
    const uniGroupPlans = [
      makeGroupEnrollmentPlan({
        id: 901, majorId: 91, majorCode: 'CS01', majorName: '计算机科学', tuition: 5000,
        major: { id: 91, name: '计算机科学', code: 'CS01', category: '工学', notes: '' },
      }),
      makeGroupEnrollmentPlan({
        id: 902, majorId: 92, majorCode: 'NUR1', majorName: '护理学', tuition: 5000,
        major: { id: 92, name: '护理学', code: 'NUR1', category: '医学', notes: '' },
        planNotes: '本专业仅限女生',
      }),
      makeGroupEnrollmentPlan({
        id: 903, majorId: 93, majorCode: 'MED1', majorName: '临床医学', tuition: 30000,
        major: { id: 93, name: '临床医学', code: 'MED1', category: '医学', notes: '' },
      }),
    ];
    const uniGroupRecords = [
      makeGroupAdmissionRecord({
        majorCode: 'CS01', majorName: '计算机科学',
        groupMinRank: 10000, majorMinRank: 9500, groupMinScore: 610, majorMinScore: 615,
      }),
    ];
    // tuitionBudget LOW (< 6000): 5000 OK, 30000 超预算 → SOFT_FAIL
    const maleStudentLowBudget = {
      provincialRank: 9800,
      tuitionBudget: 'LOW',
      user: { gender: '男', ethnicity: '汉族' },
    };

    const majorNamesOf = (result: any): string[] =>
      result.universities[0].groups[0].majors.map((m: any) => m.majorName);

    it('includeSoftFails=true: 硬规则专业被剔除, 软规则专业进风险区(可见)', async () => {
      mockCandidateGroupRequest({ student: maleStudentLowBudget, plans: uniGroupPlans, records: uniGroupRecords });

      const result: any = await service.getCandidateGroups(1, {
        page: 1, pageSize: 10, includeSoftFails: true, groupBy: 'UNIVERSITY',
      });

      expect(result.groupBy).toBe('UNIVERSITY');
      expect(result.universities).toHaveLength(1);
      const names = majorNamesOf(result);
      expect(names).toContain('计算机科学'); // PASS
      expect(names).toContain('临床医学'); // 软规则失败但 includeSoftFails=true → 仍展示
      expect(names).not.toContain('护理学'); // 硬规则(限女生)失败 → 永远剔除
      expect(result.universities[0].groups[0].softFailCount).toBe(1);
    });

    it('includeSoftFails=false: 软规则专业被隐藏, 硬规则专业仍被剔除, 只留 PASS', async () => {
      mockCandidateGroupRequest({ student: maleStudentLowBudget, plans: uniGroupPlans, records: uniGroupRecords });

      const result: any = await service.getCandidateGroups(1, {
        page: 1, pageSize: 10, includeSoftFails: false, groupBy: 'UNIVERSITY',
      });

      expect(result.universities).toHaveLength(1);
      const names = majorNamesOf(result);
      expect(names).toEqual(['计算机科学']); // 软规则专业隐藏 + 硬规则专业剔除
      expect(names).not.toContain('临床医学');
      expect(names).not.toContain('护理学');
      expect(result.universities[0].groups[0].softFailCount).toBe(0);
    });
  });

  // 验证: 院校优先(groupBy=UNIVERSITY)也支持"非意向地区折叠"——整所院校省市都不在学生意向地区时
  // 默认折叠隐藏(院校卡视角下比组视角更自然), includeRegionMismatch=true 展开, 并回 regionMismatchCount。
  it('groupBy=UNIVERSITY: 默认折叠非意向地区院校, includeRegionMismatch=true 展开并回 count', async () => {
    // 学生意向四川: 四川大学(四川)命中, 北京大学(北京)属非意向地区 → 默认折叠
    const plans = [
      makeGroupEnrollmentPlan({
        id: 911, universityId: 9, majorId: 91, majorCode: 'SC01', majorName: '川大计科', groupCode: 'G9',
        university: { id: 9, name: '四川大学', code: 'SCU', province: '四川', city: '成都' },
        major: { id: 91, name: '川大计科', code: 'SC01', category: '工学', notes: '' },
      }),
      makeGroupEnrollmentPlan({
        id: 912, universityId: 8, majorId: 81, majorCode: 'BJ01', majorName: '北大计科', groupCode: 'G8',
        university: { id: 8, name: '北京大学', code: 'PKU', province: '北京', city: '北京' },
        major: { id: 81, name: '北大计科', code: 'BJ01', category: '工学', notes: '' },
      }),
    ];
    const records = [
      makeGroupAdmissionRecord({ universityId: 9, groupCode: 'G9', majorCode: 'SC01', majorName: '川大计科', groupMinRank: 10000, majorMinRank: 9500 }),
      makeGroupAdmissionRecord({ universityId: 8, groupCode: 'G8', majorCode: 'BJ01', majorName: '北大计科', groupMinRank: 11000, majorMinRank: 10500 }),
    ];
    mockCandidateGroupRequest({
      student: { provincialRank: 9800, preferredProvinces: ['四川'], preferredCities: [] },
      plans, records,
    });

    // 默认(折叠): 只剩意向地区院校, 但 count 仍报告被折叠的数量
    const folded: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, groupBy: 'UNIVERSITY' });
    expect(folded.regionMismatchCount).toBe(1);
    expect(folded.universities.map((u: any) => u.universityId)).toEqual([9]);

    // 展开: includeRegionMismatch=true (命中同一缓存, 仅分页层重新折叠) → 两校都在
    const expanded: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, groupBy: 'UNIVERSITY', includeRegionMismatch: true });
    expect(expanded.regionMismatchCount).toBe(1);
    expect(expanded.universities.map((u: any) => u.universityId).sort((a: number, b: number) => a - b)).toEqual([8, 9]);
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
    // 本用例录取数据在 2026，让录取线基准年与之一致（否则解耦后默认基线 2025 取不到这批记录）
    prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2026 }]);
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

  it('ignores supplementary records from a different batch/group', async () => {
    // 征集按 (院校,批次,组代码) 匹配; 不同批次的征集不挂到本组
    prisma.supplementaryRecord.findMany.mockResolvedValue([
      { universityId: 7, batch: 'Batch B', groupCode: 'G7', subject: '物理', majorCode: '1', majorName: 'M', planCount: 8, roundNumber: 1 },
    ]);

    const groups = new Map<string, any>([
      ['7|G7|Batch A|General|物理', [{ universityId: 7, batch: 'Batch A', groupCode: 'G7' }]],
    ]);
    const result: Map<string, any> = await (service as any).loadSupplementaryByGroup(groups, 'Sichuan', 2025, '物理');

    expect(result.has('7|G7|Batch A|General|物理')).toBe(false);
  });

  it('aggregates group-level supplementary by subject + rounds', async () => {
    // 同组同科类多轮累计: round1 物理 12 + round2 物理 22 = 34, 2 轮
    prisma.supplementaryRecord.findMany.mockResolvedValue([
      { universityId: 7, batch: 'Batch A', groupCode: 'G7', subject: '物理', majorCode: '0813', majorName: '化工', planCount: 12, roundNumber: 1 },
      { universityId: 7, batch: 'Batch A', groupCode: 'G7', subject: '物理', majorCode: '0813', majorName: '化工', planCount: 22, roundNumber: 2 },
    ]);
    const groups = new Map<string, any>([
      ['7|G7|Batch A|General|物理', [{ universityId: 7, batch: 'Batch A', groupCode: 'G7' }]],
    ]);
    const result: Map<string, any> = await (service as any).loadSupplementaryByGroup(groups, 'Sichuan', 2025, '物理');
    const s = result.get('7|G7|Batch A|General|物理');
    expect(s.scope).toBe('GROUP_SUBJECT');
    expect(s.totalPlanCount).toBe(34);
    expect(s.totalRounds).toBe(2);
    expect(s.byMajorCode.get('0813')).toBe(34);
  });

  it('exposes group-level supplementary filtered by student subject + per-major breakdown', async () => {
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
          majorCode: '0808', majorName: 'Scoped Major', subjects: '物理', batch: 'Batch A',
          groupCode: 'G8', groupName: null, groupPlanCount: 10, subjectRequirements: '',
          planCount: 10, disciplineEval: '', isNationalFeature: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          universityId: 8, subjects: '物理', batch: 'Batch A', recruitType: 'General',
          groupCode: 'G8', groupPlanCount: 10, planCount: 10,
        },
      ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      {
        universityId: 8, subjects: '物理', batch: 'Batch A', recruitType: 'General',
        groupCode: 'G8', majorCode: '0808', majorName: 'Scoped Major', year: 2025,
        groupMinRank: 10000, groupMinScore: 600, groupAdmissionCount: 10,
        majorMinRank: 10000, majorMinScore: 600, majorAdmissionCount: 10,
      },
    ]);
    // 组内: 物理 0808 两轮 5+3=8; 另有历史一行(应被科类过滤掉)
    prisma.supplementaryRecord.findMany.mockResolvedValue([
      { universityId: 8, batch: 'Batch A', groupCode: 'G8', subject: '物理', majorCode: '0808', majorName: 'Scoped Major', planCount: 5, roundNumber: 1 },
      { universityId: 8, batch: 'Batch A', groupCode: 'G8', subject: '物理', majorCode: '0808', majorName: 'Scoped Major', planCount: 3, roundNumber: 2 },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const group = result.groups[0];
    expect(group.supplementary).toEqual({
      scope: 'GROUP_SUBJECT', subject: '物理', sourceYear: 2025, totalPlanCount: 8, totalRounds: 2,
    });
    // payload 不外泄 Map
    expect(group.supplementary.byMajorCode).toBeUndefined();
    // 专业级征集挂到专业行
    const major = group.majors.find((m: any) => m.majorCode === '0808');
    expect(major.supplementaryCount).toBe(8);
  });

  it('sorts by SAFETY axis: 默认(DESC)最稳在前, 方向翻转(ASC)最冲在前', () => {
    const groups = [
      {
        universityName: 'Reach',
        softFailCount: 0,
        suggestedGradient: 'CHONG',
        dynamicGradient: { tier: 'CHONG', adjustedMinRank: 5000, rankGapRatio: -0.5 },
        matchScore: 50,
        currentPlanCount: 10,
      },
      {
        universityName: 'Safe',
        softFailCount: 0,
        suggestedGradient: 'BAO',
        dynamicGradient: { tier: 'BAO', adjustedMinRank: 20000, rankGapRatio: 0.5 },
        matchScore: 50,
        currentPlanCount: 10,
      },
    ];

    // 默认方向 = 偏保: 最稳的 (兜底→保→稳→冲) 排前
    (service as any).sortCandidateGroups(groups, 'SAFETY', 10000);
    expect(groups.map((group) => group.universityName)).toEqual(['Safe', 'Reach']);

    // 翻转 = 偏冲: 最冲的排前
    (service as any).sortCandidateGroups(groups, 'SAFETY', 10000, 'ASC');
    expect(groups.map((group) => group.universityName)).toEqual(['Reach', 'Safe']);
  });

  it('sorts by MAJOR_MIN_SCORE axis: 默认(DESC)分高在前, 方向翻转(ASC)分低在前', () => {
    const groups = [
      {
        universityName: 'LowScore',
        softFailCount: 0,
        suggestedGradient: 'WEN',
        dynamicGradient: { tier: 'WEN', adjustedMinRank: 10000, rankGapRatio: 0 },
        anchorMajorMinScore: 540,
        matchScore: 50,
        currentPlanCount: 10,
      },
      {
        universityName: 'HighScore',
        softFailCount: 0,
        suggestedGradient: 'WEN',
        dynamicGradient: { tier: 'WEN', adjustedMinRank: 10000, rankGapRatio: 0 },
        anchorMajorMinScore: 620,
        matchScore: 50,
        currentPlanCount: 10,
      },
    ];

    (service as any).sortCandidateGroups(groups, 'MAJOR_MIN_SCORE', 10000);
    expect(groups.map((group) => group.universityName)).toEqual(['HighScore', 'LowScore']);

    (service as any).sortCandidateGroups(groups, 'MAJOR_MIN_SCORE', 10000, 'ASC');
    expect(groups.map((group) => group.universityName)).toEqual(['LowScore', 'HighScore']);
  });

  it('paginateCandidateGroups: 默认折叠非意向地区组, 开关展开; count 始终为全口径', () => {
    const mk = (name: string, regionMismatch: boolean) => ({ groupKey: name, universityName: name, regionMismatch });
    const value: any = {
      total: 3,
      groups: [mk('In-A', false), mk('Out-B', true), mk('Out-C', true)],
      tierCounts: { rush: 0, stable: 3, safe: 0, noLine: 0 },
    };
    const sumTiers = (tc: any) => tc.rush + tc.stable + tc.safe + tc.noLine;

    // 默认(includeRegionMismatch=false): 折叠掉非意向地区组, 只剩 In-A; count 仍报全口径 2
    const hidden = (service as any).paginateCandidateGroups(value, 1, 20, undefined, undefined, null, false);
    expect(hidden.groups.map((g: any) => g.universityName)).toEqual(['In-A']);
    expect(hidden.total).toBe(1);
    expect(hidden.regionMismatchCount).toBe(2);
    // 折叠态: 梯度 chip 计数须扣掉被隐藏的非意向地区组, 与 total 对齐(否则 chip 数 > 可见候选)
    expect(sumTiers(hidden.tierCounts)).toBe(hidden.total);

    // 展开(includeRegionMismatch=true): 全部显示; count 不变; tierCounts 回到全池口径
    const shown = (service as any).paginateCandidateGroups(value, 1, 20, undefined, undefined, null, true);
    expect(shown.groups.map((g: any) => g.universityName)).toEqual(['In-A', 'Out-B', 'Out-C']);
    expect(shown.total).toBe(3);
    expect(shown.regionMismatchCount).toBe(2);
    expect(sumTiers(shown.tierCounts)).toBe(shown.total);
  });

  it('buildRollupContext: 意向省/市归一去后缀(修"成都市"对不上库里"成都")', () => {
    const ctx = (service as any).buildRollupContext({
      preferredProvinces: ['四川省'],
      preferredCities: ['成都市', '绵阳市'],
    });
    expect(ctx.preferredRegions.has('四川')).toBe(true);
    expect(ctx.preferredRegions.has('成都')).toBe(true);
    expect(ctx.preferredRegions.has('绵阳')).toBe(true);
    expect(ctx.preferredRegions.has('成都市')).toBe(false);
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

  it('keeps a no-history-line group (all INSUFFICIENT_DATA) instead of dropping it', async () => {
    // 与 all-REJECTED 同理: 提前批/公费师范的新设定向组没有任何历史线,
    // 整组 INSUFFICIENT_DATA 是"待人工判断"的真实库存, 灭组会让这些组只能靠关键词搜出来
    // (2026-06-13 提前批默认池只剩有线极冲组、无线机会组全部不可见的根因)
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

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].allRisk).toBe(true);
    expect(result.groups[0].majorSections.risk).toHaveLength(1);
  });

  it('attaches sibling line band to no-history-line groups and counts them in tierCounts.noLine', async () => {
    // 无史线组的人工判断锚点 = 同校同 recruitType 有线组的分数带;
    // 同时 tierCounts 把无史线组从"保底"里单列出来, 避免保底数虚高
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({ id: 910, groupCode: 'G9', groupName: 'Lined group' }),
        makeGroupEnrollmentPlan({
          id: 911,
          groupCode: 'G8',
          groupName: 'New group',
          majorId: 92,
          majorName: 'New Major',
          majorCode: '0002',
          major: { id: 92, name: 'New Major', code: '0002', category: 'Science' },
        }),
      ],
      records: [makeGroupAdmissionRecord()],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('FORMAL', 120000));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(2);
    const noLine = result.groups.find((g: any) => g.groupCode === 'G8');
    const lined = result.groups.find((g: any) => g.groupCode === 'G9');
    expect(noLine.siblingLineBand).toEqual({ min: 530, max: 530, count: 1, scope: 'UNIVERSITY' });
    expect(lined.siblingLineBand ?? null).toBeNull();
    expect(result.tierCounts.noLine).toBe(1);
    expect(result.tierCounts.safe).toBe(0);
  });

  it('falls back to batch-wide recruitType band when the university has no lined sibling', async () => {
    // 公费师范的现实数据形态: 整校有线(川师) vs 整校无线(西华师大/内江/成都师院),
    // 同校口径常落空 — 回退到"全批次同 recruitType 有线组"的分数带
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({ id: 920, groupCode: 'G9', groupName: 'Lined group' }),
        makeGroupEnrollmentPlan({
          id: 921,
          universityId: 8,
          university: { id: 8, name: 'Other University', code: 'OU' },
          groupCode: 'G7',
          groupName: 'New group elsewhere',
        }),
      ],
      records: [makeGroupAdmissionRecord()],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('FORMAL', 120000));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const noLine = result.groups.find((g: any) => g.groupCode === 'G7');
    expect(noLine.siblingLineBand).toEqual({ min: 530, max: 530, count: 1, scope: 'BATCH' });
  });

  it('exposes anchor major employment/salary/tuition for the card metric strip', async () => {
    // 卡片指标条优先用专业级就业/薪资(院校级常空), 学费上折叠态 — 透传锚定专业字段
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 950,
          tuition: 6800,
          major: { id: 91, name: 'Candidate Major', code: '0001', category: 'Science', employmentRate: 94, avgSalary: 7200 },
        }),
      ],
      records: [makeGroupAdmissionRecord()],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('FORMAL', 120000));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups[0].anchorEmploymentRate).toBe(94);
    expect(result.groups[0].anchorAvgSalary).toBe(7200);
    expect(result.groups[0].anchorTuition).toBe(6800);
  });

  it('exposes supplementary summary alongside base-rank gradient', async () => {
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
    prisma.supplementaryRecord.findMany.mockResolvedValue([
      { universityId: 7, batch: 'Batch A', groupCode: 'G7', subject: '物理', majorCode: '0813', majorName: 'Chemistry Engineering', planCount: 5, roundNumber: 1 },
      { universityId: 7, batch: 'Batch A', groupCode: 'G7', subject: '物理', majorCode: '0813', majorName: 'Chemistry Engineering', planCount: 3, roundNumber: 2 },
    ]);

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const group = result.groups[0];
    // baseMinRank=10000, studentRank=13000 → 历史线远好于学生位次, 落入 CHONG 档
    expect(group.suggestedGradient).toBe('CHONG');
    // 四因子调整已下线, adjustedMinRank === baseMinRank, reasons 恒空
    expect(group.dynamicGradient.adjustedMinRank).toBe(group.dynamicGradient.baseMinRank);
    expect(group.dynamicGradient.adjustedMinRank).toBe(10000);
    expect(group.dynamicGradient.reasons).toEqual([]);
    // 征集字段仍按原口径暴露(组级·科类级·多轮累计), 不再喂梯度
    expect(group.supplementary.totalPlanCount).toBe(8);
    expect(group.supplementary.scope).toBe('GROUP_SUBJECT');
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
      { year: 2023, score: 619, rank: 12200, count: 10 },
      { year: 2024, score: 622, rank: 10800, count: 10 },
      { year: 2025, score: 624, rank: 9500, count: 10 },
    ]);
    expect(result.groups[0].historyFiling3y).toEqual([
      { year: 2023, score: 624, rank: 11700 },
      { year: 2024, score: 627, rank: 10300 },
      { year: 2025, score: 629, rank: 9200 },
    ]);
  });

  it('candidate group 含 prefMatch 偏好对比（本省 985 + 学费 + 考研方向）', async () => {
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
          localMasterPoint: '计算机科学',          // EP 级硕士点(真值在 enrollment_plan) → anchorHasMasterPoint=true → 考研方向 strong
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

  it('paginateCandidateGroups: 招生类型过滤 + availableRecruitTypes(全量池不塌缩) + tierCounts一致', () => {
    const mk = (name: string, recruitType: string) => ({ groupKey: name, universityName: name, recruitType, regionMismatch: false });
    const value: any = {
      total: 3,
      groups: [mk('A', '普通类本科'), mk('B', '普通类本科'), mk('C', '民族班')],
      tierCounts: { rush: 0, stable: 3, safe: 0, noLine: 0 },
    };
    const sumTiers = (tc: any) => tc.rush + tc.stable + tc.safe + tc.noLine;
    const only: any = (service as any).paginateCandidateGroups(value, 1, 20, undefined, undefined, null, false, '普通类本科');
    expect(only.groups.map((g: any) => g.universityName)).toEqual(['A', 'B']);
    expect(only.total).toBe(2);
    expect(only.availableRecruitTypes).toEqual(['普通类本科', '民族班']);
    expect(sumTiers(only.tierCounts)).toBe(only.total);
    const all: any = (service as any).paginateCandidateGroups(value, 1, 20, undefined, undefined, null, false);
    expect(all.total).toBe(3);
    expect(all.availableRecruitTypes).toEqual(['普通类本科', '民族班']);
  });

  it('getCandidateGroups: 响应带 availableRecruitTypes(全量池招生类型)', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({ id: 801, universityId: 81, groupCode: 'G81', recruitType: '普通类本科', university: { id: 81, name: 'U81', code: 'U81' }, majorName: 'M81', majorCode: '0001', major: { id: 811, name: 'M81', code: '0001', category: 'Science' } }),
        makeGroupEnrollmentPlan({ id: 802, universityId: 82, groupCode: 'G82', recruitType: '民族班', university: { id: 82, name: 'U82', code: 'U82' }, majorName: 'M82', majorCode: '0002', major: { id: 822, name: 'M82', code: '0002', category: 'Science' } }),
      ],
      records: [],
    });
    const res: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true });
    expect(res.availableRecruitTypes).toEqual(expect.arrayContaining(['普通类本科', '民族班']));
  });

  it('getCandidateGroups: recruitType 过滤只留选中类(GROUP 视图)', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({ id: 801, universityId: 81, groupCode: 'G81', recruitType: '普通类本科', university: { id: 81, name: 'U81', code: 'U81' }, majorName: 'M81', majorCode: '0001', major: { id: 811, name: 'M81', code: '0001', category: 'Science' } }),
        makeGroupEnrollmentPlan({ id: 802, universityId: 82, groupCode: 'G82', recruitType: '民族班', university: { id: 82, name: 'U82', code: 'U82' }, majorName: 'M82', majorCode: '0002', major: { id: 822, name: 'M82', code: '0002', category: 'Science' } }),
      ],
      records: [],
    });
    const res: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, recruitType: '普通类本科' });
    expect(res.groups.length).toBeGreaterThan(0);
    expect(res.groups.every((g: any) => g.recruitType === '普通类本科')).toBe(true);
    expect(res.availableRecruitTypes).toEqual(expect.arrayContaining(['普通类本科', '民族班']));
  });

  it('getCandidateGroups: recruitType 过滤(院校优先视图, 上卷前收窄)', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({ id: 801, universityId: 81, groupCode: 'G81', recruitType: '普通类本科', university: { id: 81, name: 'U81', code: 'U81' }, majorName: 'M81', majorCode: '0001', major: { id: 811, name: 'M81', code: '0001', category: 'Science' } }),
        makeGroupEnrollmentPlan({ id: 802, universityId: 82, groupCode: 'G82', recruitType: '民族班', university: { id: 82, name: 'U82', code: 'U82' }, majorName: 'M82', majorCode: '0002', major: { id: 822, name: 'M82', code: '0002', category: 'Science' } }),
      ],
      records: [],
    });
    const res: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, groupBy: 'UNIVERSITY', recruitType: '普通类本科' });
    const types = new Set((res.universities ?? []).flatMap((u: any) => (u.groups ?? []).map((g: any) => g.recruitType)));
    expect(Array.from(types)).toEqual(['普通类本科']);
    expect(res.availableRecruitTypes).toEqual(expect.arrayContaining(['普通类本科', '民族班']));
  });

  // 回归: UNIVERSITY 视图必须接 nature 的 5 项识别 (sinoForeign/hkMacau/independent), 不只 public|private。
  // 修复前 paginateAsUniversities 只有一个 if (q.nature==='public'||==='private') 的硬编码块,
  // 选 nature=sinoForeign 时不过滤 → 两所院校都返回。修复后改为 chain filterGroupsByNature 5 项识别。
  it('getCandidateGroups: nature=sinoForeign 过滤(院校优先视图, 5 项识别)', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 901, universityId: 91, groupCode: 'G91',
          university: { id: 91, name: '中外校', code: 'SF', runningNature: '公办 中外合作办学' },
          majorName: 'M91', majorCode: '0001',
          major: { id: 911, name: 'M91', code: '0001', category: 'Science' },
        }),
        makeGroupEnrollmentPlan({
          id: 902, universityId: 92, groupCode: 'G92',
          university: { id: 92, name: '普通校', code: 'PU', runningNature: '公办' },
          majorName: 'M92', majorCode: '0002',
          major: { id: 922, name: 'M92', code: '0002', category: 'Science' },
        }),
      ],
      records: [],
    });
    const res: any = await service.getCandidateGroups(1, {
      page: 1, pageSize: 10, includeSoftFails: true,
      groupBy: 'UNIVERSITY', nature: 'sinoForeign',
    });
    expect(res.universities).toHaveLength(1);
    expect(res.universities[0].universityId).toBe(91);
  });
});
