import { AdmissionService } from './admission.service';

type AdmissionRecordMock = {
  universityId: number;
  majorId: number;
  year: number;
  majorCode: string;
  majorName: string;
  groupCode: string;
  batch: string;
  subjects: string;
  recruitType: string;
  majorMinScore: number | null;
  majorMinRank: number | null;
  majorAvgScore: number | null;
  majorAvgRank: number | null;
  majorAdmissionCount: number | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
  university: {
    id: number;
    name: string;
    code: string;
    province: string;
    city: string;
    type: string | null;
    runningNature: string | null;
    is985: boolean;
    is211: boolean;
    isDoubleFirstClass: boolean;
    logoUrl: string | null;
  };
  major: {
    id: number;
    name: string;
    category: string | null;
    discipline: string | null;
    softRating: string | null;
  };
};

function buildRecord(overrides: Partial<AdmissionRecordMock> = {}): AdmissionRecordMock {
  return {
    universityId: 1,
    majorId: 10,
    year: 2024,
    majorCode: '080902',
    majorName: '软件工程',
    groupCode: '01',
    batch: '本科一批',
    subjects: '物理',
    recruitType: '普通类',
    majorMinScore: 600,
    majorMinRank: 12000,
    majorAvgScore: 610,
    majorAvgRank: 10000,
    majorAdmissionCount: 30,
    groupMinScore: 598,
    groupMinRank: 12500,
    groupAdmissionCount: 90,
    university: {
      id: 1,
      name: '四川大学',
      code: 'SCU',
      province: '四川',
      city: '成都',
      type: '综合',
      runningNature: '公办',
      is985: true,
      is211: true,
      isDoubleFirstClass: true,
      logoUrl: null,
    },
    major: {
      id: 10,
      name: '软件工程',
      category: '工学',
      discipline: '计算机类',
      softRating: 'A',
    },
    ...overrides,
  };
}

function buildService(records: AdmissionRecordMock[]) {
  const mockPrisma = {
    admissionRecord: { findMany: jest.fn().mockResolvedValue(records) },
    enrollmentPlan: { findMany: jest.fn().mockResolvedValue([]) },
    supplementarySummary: { findMany: jest.fn().mockResolvedValue([]) },
    rankPrediction: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new AdmissionService(mockPrisma as never), mockPrisma };
}

describe('AdmissionService.findAggregated', () => {
  it('keeps physics and history records as separate groups', async () => {
    const { service } = buildService([
      buildRecord({ subjects: '物理', year: 2024 }),
      buildRecord({ subjects: '物理', year: 2023 }),
      buildRecord({ subjects: '历史', year: 2024 }),
    ]);

    const result = await service.findAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
      range: 30000,
    });

    // The where clause filters to subjects=物理, so the prisma mock would in
    // reality return only physics rows; here all three are returned, and the
    // grouping key (now including subjects) must split 物理 from 历史.
    const subjectsSeen = new Set(result.data.map((d) => d.subjects));
    expect(subjectsSeen.has('物理')).toBe(true);
    expect(subjectsSeen.has('历史')).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('returns lightweight items without yearlyData / currentPlan / supplementary', async () => {
    const { service } = buildService([buildRecord()]);

    const result = await service.findAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
      range: 30000,
    });

    const item = result.data[0] as unknown as Record<string, unknown>;
    expect(item.yearlyData).toBeUndefined();
    expect(item.currentPlan).toBeUndefined();
    expect(item.supplementary).toBeUndefined();
    expect(item.majorCode).toBe('080902');
    expect(item.groupCode).toBe('01');
    expect(item).toHaveProperty('predictedMinRank');
    expect((item.university as Record<string, unknown>).id).toBe(1);
  });

  it('does not apply offset pagination — returns the whole window with a flat total', async () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      buildRecord({ universityId: i + 1, university: { ...buildRecord().university, id: i + 1 } }),
    );
    const { service } = buildService(records);

    const result = await service.findAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
      range: 30000,
    });

    expect(result.data).toHaveLength(25);
    expect(result.total).toBe(25);
    expect((result as unknown as Record<string, unknown>).pagination).toBeUndefined();
  });
});

describe('AdmissionService.findAggregatedDetail', () => {
  function buildYearRecord(year: number, majorMinRank: number) {
    return {
      universityId: 1,
      majorId: 10,
      year,
      majorCode: '080902',
      majorName: '软件工程',
      groupCode: '01',
      batch: '本科一批',
      subjects: '物理',
      recruitType: '普通类',
      majorMinScore: 600 + (2024 - year),
      majorMinRank,
      majorAvgScore: 610,
      majorAvgRank: 10000,
      majorAdmissionCount: 30,
      groupMinScore: 598,
      groupMinRank: majorMinRank + 500,
      groupAdmissionCount: 90,
    };
  }

  it('returns every available year, currentPlan and supplementary', async () => {
    const records = [
      buildYearRecord(2024, 12000),
      buildYearRecord(2023, 13000),
      buildYearRecord(2022, 14000),
    ];
    const mockPrisma = {
      admissionRecord: { findMany: jest.fn().mockResolvedValue(records) },
      enrollmentPlan: {
        findFirst: jest.fn().mockResolvedValue({
          planCount: 32,
          tuition: 4900,
          duration: '四年',
          subjectRequirements: '物理必选',
          disciplineEval: 'A',
          majorRanking: '5',
          majorHonor: '国家级一流专业',
          localMasterPoint: '软件工程硕士点',
          localDoctoralPoint: null,
          isNew: false,
          isSinoForeign: false,
          planNotes: null,
        }),
      },
      supplementarySummary: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AdmissionService(mockPrisma as never);

    const detail = await service.findAggregatedDetail({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    });

    expect(detail.yearlyData.map((y) => y.year)).toEqual([2024, 2023, 2022]);
    expect(detail.yearlyData[0].majorMinRank).toBe(12000);
    expect(detail.yearlyData[0].groupMinRank).toBe(12500);
    expect(detail.currentPlan?.planCount).toBe(32);
    expect(detail.currentPlan?.disciplineEval).toBe('A');
    expect(detail.supplementary).toBeNull();
    expect(mockPrisma.admissionRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          universityId: 1,
          majorCode: '080902',
          groupCode: '01',
          batch: '本科一批',
          recruitType: '普通类',
          province: '四川',
          subjects: '物理',
        }),
      }),
    );
  });

  it('maps supplementarySummary into the SupplementaryInfo shape', async () => {
    const mockPrisma = {
      admissionRecord: { findMany: jest.fn().mockResolvedValue([buildYearRecord(2024, 12000)]) },
      enrollmentPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      supplementarySummary: {
        findFirst: jest.fn().mockResolvedValue({
          totalRounds: 2,
          totalPlanCount: 15,
          supplementaryRate: 3.5,
        }),
      },
    };
    const service = new AdmissionService(mockPrisma as never);

    const detail = await service.findAggregatedDetail({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    });

    expect(detail.currentPlan).toBeNull();
    expect(detail.supplementary).toEqual({
      totalRounds: 2,
      totalPlanCount: 15,
      supplementaryRate: 3.5,
    });
  });
});
