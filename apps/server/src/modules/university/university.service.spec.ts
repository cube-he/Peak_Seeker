import { UniversityService } from './university.service';
import * as levels from '../enrollment-level/enrollment-levels';

describe('UniversityService.getPickerOptions levels', () => {
  it('按 university_id 附在川层次', async () => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, code: '4101', name: '四川大学', renameHistory: null },
          { id: 20, code: '5199', name: '成都职业技术学院', renameHistory: null },
        ]),
      },
    } as any;
    const redis = { getCache: jest.fn(), setCache: jest.fn() } as any;
    jest.spyOn(levels, 'getUniversityLevelMap').mockResolvedValue({
      10: { phy: '本科', his: '本科' },
      20: { phy: '专科', his: '专科' },
    });
    // constructor: (prisma, redis, admissionService) — 第三参本用例用不到, 传 {} as any
    const svc = new UniversityService(prisma, redis, {} as any);
    const out = await svc.getPickerOptions();
    expect(out.find((o) => o.id === 10)!.levels).toEqual({ phy: '本科', his: '本科' });
    expect(out.find((o) => o.id === 20)!.levels).toEqual({ phy: '专科', his: '专科' });
  });
});

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
  // getPickerOptions 现会调用 getUniversityLevelMap(查 enrollment_plans 聚合);
  // 这些用例只关心 picker 查询/去重/排序, 故把层次查询打桩成空 map。
  beforeEach(() => {
    jest.spyOn(levels, 'getUniversityLevelMap').mockResolvedValue({});
  });

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

  it('queries with select projection (id/code/name/renameHistory) and filters to in-Sichuan', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.university, 'findMany');
    await service.getPickerOptions();
    expect(findManySpy).toHaveBeenCalledWith({
      where: { enrollmentPlans: { some: { province: '四川' } } },
      select: { id: true, code: true, name: true, renameHistory: true },
      orderBy: { id: 'asc' },
    });
  });

  it('batches 参数 → enrollmentPlans.some.batch in 过滤', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.university, 'findMany');
    await service.getPickerOptions(['本科批A段', '本科批B段']);
    expect(findManySpy).toHaveBeenCalledWith({
      where: {
        enrollmentPlans: {
          some: { province: '四川', batch: { in: ['本科批A段', '本科批B段'] } },
        },
      },
      select: { id: true, code: true, name: true, renameHistory: true },
      orderBy: { id: 'asc' },
    });
  });

  it('batches 为空数组 → 不加 batch in 过滤 (等同未传)', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.university, 'findMany');
    await service.getPickerOptions([]);
    expect(findManySpy).toHaveBeenCalledWith({
      where: { enrollmentPlans: { some: { province: '四川' } } },
      select: { id: true, code: true, name: true, renameHistory: true },
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

  it('sortBy=minRank sorts by exam-type rank, nulls last', async () => {
    const { svc } = setup([
      uni({ id: 1, minRankPhysics: 12000 }),
      uni({ id: 2, minRankPhysics: null }),
      uni({ id: 3, minRankPhysics: 5000 }),
    ]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20, sortBy: 'minRank', sortOrder: 'asc' } as any);
    expect(result.data.map((u: any) => u.id)).toEqual([3, 1, 2]);
  });

  it('sortBy=softRank sorts by softRanking, nulls last', async () => {
    const { svc } = setup([
      uni({ id: 1, softRanking: 50 }),
      uni({ id: 2, softRanking: null }),
      uni({ id: 3, softRanking: 10 }),
    ]);
    const result: any = await svc.findAll({ page: 1, pageSize: 20, sortBy: 'softRank', sortOrder: 'asc' } as any);
    expect(result.data.map((u: any) => u.id)).toEqual([3, 1, 2]);
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

describe('UniversityService.findAdmissions extras transcription', () => {
  const buildService = (admissions: any[], plans: any[]) => {
    const prisma = {
      admissionRecord: {
        findMany: jest.fn().mockResolvedValue(admissions),
      },
      enrollmentPlan: {
        findMany: jest.fn().mockResolvedValue(plans),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { service, prisma };
  };

  it('attaches latest-year enrollmentPlan chip fields to each admission', async () => {
    const mockAdmissions = [
      { id: 1, universityId: 10, majorId: 100, year: 2024, majorMinScore: 600, major: { id: 100, name: '计算机' } },
      { id: 2, universityId: 10, majorId: 101, year: 2024, majorMinScore: 590, major: { id: 101, name: '软工' } },
    ];
    const mockPlans = [
      { universityId: 10, majorId: 100, year: 2024, majorRanking: '12', disciplineEval: '软科：A+', isNationalFeature: true },
      { universityId: 10, majorId: 100, year: 2023, majorRanking: '15', disciplineEval: '软科：A', isNationalFeature: false },
      { universityId: 10, majorId: 101, year: 2022, majorRanking: '25', disciplineEval: null,       isNationalFeature: false },
    ];

    const { service } = buildService(mockAdmissions, mockPlans);
    const result: any[] = await service.findAdmissions(10);

    expect(result[0].extras).toEqual({ majorRanking: '12', disciplineEval: '软科：A+', isNationalFeature: true });
    expect(result[1].extras).toEqual({ majorRanking: '25', disciplineEval: null, isNationalFeature: false });
  });

  it('attaches empty extras when no enrollmentPlan rows for that major', async () => {
    const mockAdmissions = [{ id: 1, universityId: 10, majorId: 999, year: 2024, major: { id: 999, name: '冷门' } }];

    const { service } = buildService(mockAdmissions, []);
    const result: any[] = await service.findAdmissions(10);

    expect(result[0].extras).toEqual({ majorRanking: null, disciplineEval: null, isNationalFeature: false });
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

describe('UniversityService.findAllForMap', () => {
  // 2026-06-02 改造:从 "一所学校一行 + 主校区坐标" 改成 "一个 verified 校区一行"。
  // 用户期望:全国地图上分校区按各自真实位置分开显示(北航 = 3 个 dot 而非 1 个)。
  // Prisma 数据形态也跟着变 — 查 universityCampus 表 + join university。
  const decimal = (n: number) => ({ toNumber: () => n });

  const mapCampus = (over: any = {}) => ({
    id: 100, name: '本部', isMain: true,
    latitude: decimal(30.6303), longitude: decimal(104.0834), district: '武侯区',
    university: {
      id: 1, name: '四川大学', province: '四川', city: '成都',
      level: '本科', type: '综合', runningNature: '公办',
      is985: true, is211: true, isDoubleFirstClass: true,
    },
    ...over,
  });

  const setup = (campuses: any[]) => {
    const prisma = {
      universityCampus: { findMany: jest.fn().mockResolvedValue(campuses) },
    };
    const redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
    };
    const admissionService = { getTargetYear: jest.fn() };
    const svc = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { svc, prisma, redis };
  };

  it('一校区一行:输出含 campusId/campusName/isMain + 学校属性', async () => {
    const { svc } = setup([mapCampus()]);
    const result: any[] = await (svc as any).findAllForMap({});
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 1, name: '四川大学', province: '四川', city: '成都', district: '武侯区',
      level: '本科', type: '综合', nature: '公办',
      is985: true, is211: true, isDoubleFirstClass: true,
      lat: 30.6303, lng: 104.0834,
      campusId: 100, campusName: '本部', isMain: true,
    });
  });

  it('Prisma Decimal lat/lng 转 number', async () => {
    const { svc } = setup([mapCampus()]);
    const result: any[] = await (svc as any).findAllForMap({});
    expect(typeof result[0].lat).toBe('number');
    expect(typeof result[0].lng).toBe('number');
  });

  it('多校区同校 → 输出多行(每个 verified 校区一行)', async () => {
    // 北航场景:学院路(主)+ 沙河(副)
    const { svc } = setup([
      mapCampus({
        id: 200, name: '学院路', isMain: true,
        latitude: decimal(39.98), longitude: decimal(116.34), district: '海淀区',
        university: { id: 2, name: '北京航空航天大学', province: '北京', city: '北京',
          level: '本科', type: '理工', runningNature: '公办',
          is985: true, is211: true, isDoubleFirstClass: true },
      }),
      mapCampus({
        id: 201, name: '沙河', isMain: false,
        latitude: decimal(40.15), longitude: decimal(116.28), district: '昌平区',
        university: { id: 2, name: '北京航空航天大学', province: '北京', city: '北京',
          level: '本科', type: '理工', runningNature: '公办',
          is985: true, is211: true, isDoubleFirstClass: true },
      }),
    ]);
    const result: any[] = await (svc as any).findAllForMap({});
    expect(result).toHaveLength(2);
    expect(result[0].campusName).toBe('学院路');
    expect(result[0].isMain).toBe(true);
    expect(result[0].district).toBe('海淀区');
    expect(result[1].campusName).toBe('沙河');
    expect(result[1].isMain).toBe(false);
    expect(result[1].district).toBe('昌平区');
    // 学校 id 相同(同一所学校)
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(2);
  });

  it('district 字段取自 campus 而非主表(分校在不同区/县时正确归属)', async () => {
    // 哈工大威海应该归"威海/环翠区"而非主校区的"哈尔滨/南岗区"
    const { svc } = setup([
      mapCampus({
        id: 300, name: '威海', isMain: false,
        latitude: decimal(37.51), longitude: decimal(122.06), district: '环翠区',
        university: { id: 3, name: '哈尔滨工业大学', province: '黑龙江', city: '哈尔滨',
          level: '本科', type: '理工', runningNature: '公办',
          is985: true, is211: true, isDoubleFirstClass: true },
      }),
    ]);
    const result: any[] = await (svc as any).findAllForMap({});
    expect(result[0].district).toBe('环翠区');
  });

  it('filter 参数翻译成 where + 通过 university 关系过滤', async () => {
    const { svc, prisma } = setup([mapCampus()]);
    await (svc as any).findAllForMap({ province: '四川', level: '本科', is985: true });
    const call = prisma.universityCampus.findMany.mock.calls[0][0];
    // verified + 有坐标
    expect(call.where.geoStatus).toBe('verified');
    expect(call.where.latitude).toEqual({ not: null });
    // 学校筛选通过 university 嵌套关系
    expect(call.where.university.province).toBe('四川');
    expect(call.where.university.level).toBe('本科');
    expect(call.where.university.is985).toBe(true);
  });

  it('缓存:key 含 query 参数', async () => {
    const { svc, redis } = setup([mapCampus()]);
    await (svc as any).findAllForMap({ province: '四川' });
    expect(redis.setCache).toHaveBeenCalled();
    const cacheKey = (redis.setCache as jest.Mock).mock.calls[0][0];
    expect(cacheKey).toMatch(/^university:map:/);
    expect(cacheKey).toContain('四川');
  });

  it('returns cached value without hitting the database', async () => {
    const cached = [{ id: 99, name: 'cached' }];
    const prisma = { university: { findMany: jest.fn() } };
    const redis = {
      getCache: jest.fn().mockResolvedValue(cached),
      setCache: jest.fn(),
    };
    const svc = new UniversityService(prisma as any, redis as any, {} as any);
    const result = await (svc as any).findAllForMap({});
    expect(result).toEqual(cached);
    expect(prisma.university.findMany).not.toHaveBeenCalled();
  });
});

describe('findAll: extended sortBy mapping', () => {
  const buildService = () => {
    const prisma = {
      university: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new UniversityService(prisma as any, redis as any, admissionService as any);
    return { service, prisma };
  };

  it.each([
    'rankingAlumni',
    'rankingQS',
    'rankingUSNews',
    'rankingTimes',
    'aClassDisciplineCount',
    'campusArea',
    'createdYear',
    'heatScore',
  ])('sortBy=%s goes through memory path (nullable field)', async (sortBy) => {
    const { service, prisma } = buildService();
    prisma.university.findMany.mockResolvedValue([
      { id: 1, name: '北大', is985: true, is211: true, [sortBy]: 1 },
      { id: 2, name: '清华', is985: true, is211: true, [sortBy]: null },
    ]);
    prisma.university.count.mockResolvedValue(2);
    await service.findAll({ sortBy, sortOrder: 'asc' } as any);
    const call = prisma.university.findMany.mock.calls[0]?.[0] ?? {};
    expect(call.skip).toBeUndefined();
    expect(call.take).toBeUndefined();
  });

  it('sortBy=name goes through DB path (not in NULLABLE set)', async () => {
    const { service, prisma } = buildService();
    prisma.university.findMany.mockResolvedValue([]);
    prisma.university.count.mockResolvedValue(0);
    await service.findAll({ sortBy: 'name', sortOrder: 'asc', page: 1, pageSize: 20 } as any);
    const call = prisma.university.findMany.mock.calls[0]?.[0] ?? {};
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
    expect(call.orderBy).toEqual({ name: 'asc' });
  });
});
