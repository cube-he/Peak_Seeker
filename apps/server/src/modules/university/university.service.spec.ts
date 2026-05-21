import { UniversityService } from './university.service';

describe('UniversityService.findById campuses', () => {
  const setup = (universityRow: any, qiangji: any[] = [], predictions: any[] = []) => {
    const prisma = {
      university: {
        findUnique: jest.fn().mockResolvedValue(universityRow),
      },
      qiangjiAdmission: {
        findMany: jest.fn().mockResolvedValue(qiangji),
      },
      rankPrediction: {
        findMany: jest.fn().mockResolvedValue(predictions),
      },
    };
    const redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
    };
    const admissionService = {
      getTargetYear: jest.fn().mockResolvedValue(2026),
    };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc, prisma, redis };
  };

  it('includes verified campuses in the response', async () => {
    const { svc, prisma } = setup({
      id: 1, name: '哈工大',
      campuses: [
        {
          id: 10, name: '本部', isMain: true,
          province: '黑龙江省', city: '哈尔滨市', district: '南岗区',
          address: 'X', latitude: 45.74, longitude: 126.63,
          distanceToCityCenter: 5200,
          nearestSubwayMeters: 380,
          nearestAirportKm: 38.0,
          geoStatus: 'verified',
        },
      ],
      enrollmentPlans: [],
      admissionRecords: [],
    });
    const result: any = await svc.findById(1);
    expect(result.campuses).toHaveLength(1);
    expect(result.campuses[0].name).toBe('本部');
    expect(prisma.university.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          campuses: expect.objectContaining({
            where: { geoStatus: 'verified' },
          }),
        }),
      }),
    );
  });

  it('returns empty array when university has no verified campuses', async () => {
    const { svc } = setup({
      id: 2, name: 'X',
      campuses: [],
      enrollmentPlans: [],
      admissionRecords: [],
    });
    const result: any = await svc.findById(2);
    expect(result.campuses).toEqual([]);
  });

  it('coerces Decimal lat/lng to plain numbers in campuses', async () => {
    // Simulate Prisma's Decimal type: an object with toNumber() method
    const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n) });
    const { svc } = setup({
      id: 1, name: 'X',
      campuses: [
        {
          id: 10, name: '本部', isMain: true,
          province: '北京市', city: '北京市', district: null,
          address: 'X',
          latitude: decimal(40.0),
          longitude: decimal(116.331),
          distanceToCityCenter: 5200,
          nearestSubwayMeters: 380,
          nearestAirportKm: decimal(38.0),
          geoStatus: 'verified',
        },
      ],
      enrollmentPlans: [],
      admissionRecords: [],
    });
    const result: any = await svc.findById(1);
    expect(result.campuses[0].latitude).toBe(40.0);
    expect(typeof result.campuses[0].latitude).toBe('number');
    expect(result.campuses[0].longitude).toBe(116.331);
    expect(result.campuses[0].nearestAirportKm).toBe(38.0);
  });
});

describe('UniversityService.getCampusPois', () => {
  const buildService = (poiRows: any[]) => {
    const prisma = {
      universityCampus: {
        findUnique: jest.fn().mockResolvedValue({ id: 10, universityId: 1 }),
      },
      universityCampusPoi: {
        findMany: jest.fn().mockResolvedValue(poiRows),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    return new UniversityService(prisma as any, redis as any, admissionService as any);
  };

  it('returns POIs filtered by category, sorted by distance, with limit', async () => {
    const svc = buildService([
      { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
      { id: 2, amapId: 'B', name: '哈工大',   category: 'subway', distance: 520, metadata: null },
    ]);
    const result = await svc.getCampusPois(1, 10, { category: 'subway', limit: 5 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('西大直街');
    expect(result[0].category).toBe('subway');
    expect(result[0]).toEqual({
      id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null,
    });
  });

  it('rejects when campus does not belong to the requested university', async () => {
    const prisma = {
      universityCampus: {
        findUnique: jest.fn().mockResolvedValue({ id: 99, universityId: 2 }),
      },
      universityCampusPoi: { findMany: jest.fn() },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    await expect(
      svc.getCampusPois(1, 99, { category: 'subway', limit: 5 }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects when campus does not exist', async () => {
    const prisma = {
      universityCampus: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      universityCampusPoi: { findMany: jest.fn() },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    await expect(
      svc.getCampusPois(1, 999, { category: 'subway', limit: 5 }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('getPickerOptions', () => {
  const buildService = () => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: 'SC001', name: '四川大学' },
          { id: 2, code: 'SC002', name: '电子科技大学' },
        ]),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { service, prisma };
  };

  it('returns array of {id, code, name} for all universities', async () => {
    const { service } = buildService();
    const result = await service.getPickerOptions();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        code: expect.any(String),
        name: expect.any(String),
      }),
    );
  });

  it('queries with select projection (id/code/name only, no relations) and filters to in-Sichuan', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.university, 'findMany');
    await service.getPickerOptions();
    expect(findManySpy).toHaveBeenCalledWith({
      where: { enrollmentPlans: { some: { province: '四川' } } },
      select: { id: true, code: true, name: true },
      orderBy: { id: 'asc' },
    });
  });

  it('dedupes by name when same name appears multiple times', async () => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: '10001', name: '东南大学' },
          { id: 2, code: '10002', name: '东南大学' },  // 重名
          { id: 3, code: '10003', name: '清华大学' },
        ]),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new UniversityService(prisma as any, redis as any, admissionService as any);
    const result = await service.getPickerOptions();
    expect(result).toHaveLength(2);
    expect(result.find(r => r.name === '东南大学')?.id).toBe(1);
  });

  it('sorts result alphabetically by name (zh-CN locale)', async () => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: 'A', name: '清华大学' },
          { id: 2, code: 'B', name: '北京大学' },
          { id: 3, code: 'C', name: '安庆师范大学' },
        ]),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new UniversityService(prisma as any, redis as any, admissionService as any);
    const result = await service.getPickerOptions();
    // 拼音 zh-CN sort: 安(a) < 北(b) < 清(q)
    expect(result.map(r => r.name)).toEqual(['安庆师范大学', '北京大学', '清华大学']);
  });
});

describe('UniversityService.findAll latestAdmission', () => {
  const setup = (universities: any[], latestYear: number | null = 2025) => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue(universities),
        count: jest.fn().mockResolvedValue(universities.length),
      },
      admissionRecord: {
        findFirst: jest.fn().mockResolvedValue(
          latestYear == null ? null : { year: latestYear },
        ),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc, prisma };
  };

  it('aggregates latestAdmission to the lowest admission score across the year records', async () => {
    // 院校最低分 = 该年度全部专业组里最低的一条，而不是任取第一条
    const { svc } = setup([
      {
        id: 1, name: 'X',
        admissionRecords: [
          { year: 2025, majorMinScore: null, majorMinRank: null, groupMinScore: 520, groupMinRank: 30000 },
          { year: 2025, majorMinScore: null, majorMinRank: null, groupMinScore: 480, groupMinRank: 55000 },
          { year: 2025, majorMinScore: null, majorMinRank: null, groupMinScore: 510, groupMinRank: 38000 },
        ],
      },
    ]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].latestAdmission).toEqual({ year: 2025, minScore: 480, minRank: 55000 });
    expect(result.data[0].admissionRecords).toBeUndefined();
  });

  it('selects admission records for the max year in the DB, not a hardcoded calendar year', async () => {
    const { svc, prisma } = setup([{ id: 1, name: 'X', admissionRecords: [] }], 2099);
    await svc.findAll({ page: 1, pageSize: 20 } as any);
    const include = prisma.university.findMany.mock.calls[0][0].include;
    expect(include.admissionRecords.where.year).toBe(2099);
  });

  it('returns latestAdmission null when the university has no admission records', async () => {
    const { svc } = setup([{ id: 1, name: 'X', admissionRecords: [] }]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].latestAdmission).toBeNull();
  });
});
