import { Test, TestingModule } from '@nestjs/testing';
import { CandidateFilterService } from './candidate-filter.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { HealthFilterService } from './health-filter.service';
import { RegionFilterService } from './region-filter.service';
import { StudentProfileSnapshot } from '../interfaces/recommend.types';

describe('CandidateFilterService', () => {
  let service: CandidateFilterService;
  let prisma: any;

  // Mock student profile
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
      preferredProvinces: ['四川'],
      preferredCities: ['成都'],
      preferredMajors: null,
      preferredMajorCategories: null,
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

  // Mock admission record with university and major
  function makeAdmissionRecord(overrides: any = {}) {
    return {
      id: 1,
      universityId: 100,
      majorId: 200,
      year: 2025,
      province: '四川',
      batch: '本科一批',
      majorMinRank: 25000,
      majorMinScore: 580,
      majorAvgRank: 23000,
      majorAdmissionCount: 10,
      groupMinRank: 26000,
      university: {
        id: 100,
        name: '测试大学',
        code: '10001',
        province: '四川',
        city: '成都',
        is985: false,
        is211: true,
        isDoubleFirstClass: true,
        runningNature: '公办',
        type: '综合',
        tags: null,
        postgradRate: '15',
        softRanking: 80,
      },
      major: {
        id: 200,
        name: '计算机科学',
        code: '080901',
        category: '工学',
        level: '本科',
        discipline: '计算机科学与技术',
        isRestricted: false,
        notes: null,
      },
      ...overrides,
    };
  }

  // Mock health filter: no exclusions by default
  const mockHealthFilter = {
    loadRestrictions: jest.fn().mockResolvedValue(undefined),
    mapLegacyConditions: jest.fn().mockReturnValue([]),
    checkCandidate: jest.fn().mockReturnValue({ excluded: false, risks: [] }),
  };

  // Mock region filter: no special programs by default
  const mockRegionFilter = {
    loadRegions: jest.fn().mockResolvedValue(undefined),
    detectSpecialProgram: jest.fn().mockReturnValue(null),
    isEligible: jest.fn().mockReturnValue({ eligible: true }),
  };

  beforeEach(async () => {
    prisma = {
      admissionRecord: {
        findMany: jest.fn().mockResolvedValue([makeAdmissionRecord()]),
      },
      enrollmentPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            universityId: 100,
            majorId: 200,
            year: 2026,
            province: '四川',
            planCount: 10,
            tuition: 5000,
            isSinoForeign: false,
            subjects: '物理',
            subjectRequirements: '物理',
            groupCode: 'A01',
            groupName: '理工组',
            groupMajors: null,
            groupPlanCount: 30,
            disciplineEval: 'A',
            isNationalFeature: true,
            majorRanking: 'A类',
            majorHonor: null,
          },
        ]),
      },
    };

    // Reset mocks between tests
    mockHealthFilter.loadRestrictions.mockClear();
    mockHealthFilter.mapLegacyConditions.mockClear().mockReturnValue([]);
    mockHealthFilter.checkCandidate.mockClear().mockReturnValue({ excluded: false, risks: [] });
    mockRegionFilter.loadRegions.mockClear();
    mockRegionFilter.detectSpecialProgram.mockClear().mockReturnValue(null);
    mockRegionFilter.isEligible.mockClear().mockReturnValue({ eligible: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateFilterService,
        { provide: PrismaService, useValue: prisma },
        { provide: HealthFilterService, useValue: mockHealthFilter },
        { provide: RegionFilterService, useValue: mockRegionFilter },
      ],
    }).compile();

    service = module.get<CandidateFilterService>(CandidateFilterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return candidates within rank range', async () => {
    const student = makeStudent();
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(1);
    expect(result[0].universityName).toBe('测试大学');
    expect(result[0].majorName).toBe('计算机科学');
  });

  it('should filter out excluded universities', async () => {
    const student = makeStudent({ excludedUniversities: ['测试大学'] });
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(0);
  });

  it('should filter out excluded majors', async () => {
    const student = makeStudent({ excludedMajors: ['计算机科学'] });
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(0);
  });

  it('should filter out excluded provinces', async () => {
    const student = makeStudent({ excludedProvinces: ['四川'] });
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(0);
  });

  it('should filter out sino-foreign if not accepted', async () => {
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      {
        universityId: 100,
        majorId: 200,
        year: 2026,
        province: '四川',
        planCount: 10,
        tuition: 50000,
        isSinoForeign: true,
        planNotes: '(中外合作办学)',
        subjects: '物理',
        subjectRequirements: null,
        groupCode: 'A01',
        groupName: '中外合作',
        groupMajors: null,
        groupPlanCount: 10,
        disciplineEval: null,
        isNationalFeature: false,
        majorRanking: null,
        majorHonor: null,
      },
    ]);

    const student = makeStudent({ acceptSinoForeign: false });
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(0);
  });

  it('should keep sino-foreign if accepted', async () => {
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      {
        universityId: 100,
        majorId: 200,
        year: 2026,
        province: '四川',
        planCount: 10,
        tuition: 50000,
        isSinoForeign: true,
        planNotes: '(中外合作办学)',
        subjects: null,
        subjectRequirements: null,
        groupCode: 'A01',
        groupName: '中外合作',
        groupMajors: null,
        groupPlanCount: 10,
        disciplineEval: null,
        isNationalFeature: false,
        majorRanking: null,
        majorHonor: null,
      },
    ]);

    const student = makeStudent({ acceptSinoForeign: true });
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(1);
  });

  it('should filter private university when acceptPrivate is STRICT', async () => {
    prisma.admissionRecord.findMany.mockResolvedValue([
      makeAdmissionRecord({
        university: {
          ...makeAdmissionRecord().university,
          runningNature: '民办',
        },
      }),
    ]);

    const student = makeStudent({ acceptPrivate: 'STRICT' });
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(0);
  });

  it('should filter by tuition budget', async () => {
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      {
        universityId: 100,
        majorId: 200,
        year: 2026,
        province: '四川',
        planCount: 10,
        tuition: 25000, // Over LOW budget limit of 6000
        isSinoForeign: false,
        subjects: null,
        subjectRequirements: null,
        groupCode: 'A01',
        groupName: '理工组',
        groupMajors: null,
        groupPlanCount: 30,
        disciplineEval: null,
        isNationalFeature: false,
        majorRanking: null,
        majorHonor: null,
      },
    ]);

    const student = makeStudent({ tuitionBudget: 'LOW' });
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(0);
  });

  it('should handle empty admission records', async () => {
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    const student = makeStudent();
    const range = { rangeUp: 5000, rangeDown: 5000 };

    const result = await service.filter(student, range);

    expect(result.length).toBe(0);
  });
});
