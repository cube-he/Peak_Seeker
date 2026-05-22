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

describe('UniversityService.findAll', () => {
  const setup = (universities: any[]) => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue(universities),
        count: jest.fn().mockResolvedValue(universities.length),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc, prisma };
  };

  const uni = (over: any = {}) => ({
    id: 1, name: 'X', is985: false, is211: false, level: '本科',
    minScorePhysics: 600, minRankPhysics: 12000,
    minScoreHistory: 560, minRankHistory: 8000,
    predRankPhysics: 11000, predRankHistory: 7500,
    ...over,
  });

  it('builds latestAdmission and predictedMinRank from physics columns by default', async () => {
    const { svc } = setup([uni()]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].latestAdmission).toEqual({ minScore: 600, minRank: 12000 });
    expect(result.data[0].predictedMinRank).toBe(11000);
  });

  it('uses history columns when examType is 历史', async () => {
    const { svc } = setup([uni()]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20, examType: '历史' } as any);
    expect(result.data[0].latestAdmission).toEqual({ minScore: 560, minRank: 8000 });
    expect(result.data[0].predictedMinRank).toBe(7500);
  });

  it('latestAdmission is null when the exam-type score column is null', async () => {
    const { svc } = setup([uni({ minScorePhysics: null, minRankPhysics: null })]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].latestAdmission).toBeNull();
  });

  it('sortBy=minRank orders by the exam-type rank column', async () => {
    const { svc, prisma } = setup([uni()]);
    await svc.findAll({ page: 1, pageSize: 20, sortBy: 'minRank', sortOrder: 'asc' } as any);
    expect(prisma.university.findMany.mock.calls[0][0].orderBy).toEqual({ minRankPhysics: 'asc' });
  });

  it('does not leak raw redundancy columns into the response', async () => {
    const { svc } = setup([uni()]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20 } as any);
    expect(result.data[0].minRankPhysics).toBeUndefined();
    expect(result.data[0].predRankPhysics).toBeUndefined();
  });

  it('tierFilter classifies in memory and returns only the matched tier', async () => {
    // 985 校 stable 阈值 1500；userRank 12000：
    //   id1 predRank 11000 → diff -1000 → stable
    //   id2 predRank 3000  → diff -9000 → rush
    const { svc, prisma } = setup([
      uni({ id: 1, is985: true, predRankPhysics: 11000 }),
      uni({ id: 2, is985: true, predRankPhysics: 3000 }),
    ]);
    const result: any = await svc.findAll({
      page: 1, pageSize: 20, tierFilter: 'stable', userRank: 12000,
    } as any);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(1);
    expect(result.pagination.total).toBe(1);
    expect(prisma.university.findMany.mock.calls[0][0].skip).toBeUndefined();
  });
});

describe('UniversityService.getFilters', () => {
  const buildService = () => {
    const prisma = {
      university: {
        groupBy: jest.fn()
          .mockResolvedValueOnce([{ province: '四川', _count: 100 }])            // provinces
          .mockResolvedValueOnce([{ type: '综合', _count: 50 }])                 // types
          .mockResolvedValueOnce([{ level: '本科', _count: 200 }])               // levels
          .mockResolvedValueOnce([{ province: '四川', city: '成都', _count: 80 }]) // cities
          .mockResolvedValueOnce([{ grade: '一线城市', _count: 10 }])             // grades
          .mockResolvedValueOnce([{ runningNature: '公办', _count: 150 }]),       // natures
      },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn().mockResolvedValue(undefined) };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc };
  };

  it('tags each city with its province', async () => {
    const { svc } = buildService();
    const filters: any = await svc.getFilters();
    expect(filters.cities[0]).toEqual({ value: '成都', count: 80, province: '四川' });
  });

  it('exposes natures from runningNature groupBy', async () => {
    const { svc } = buildService();
    const filters: any = await svc.getFilters();
    expect(filters.natures[0]).toEqual({ value: '公办', count: 150 });
  });
});
