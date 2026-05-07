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
      orderBy: { name: 'asc' },
    });
  });
});
