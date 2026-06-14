import { MajorService } from './major.service';
import * as levels from '../enrollment-level/enrollment-levels';

describe('MajorService.getPickerOptions levels', () => {
  it('给每个专业名附上在川层次', async () => {
    const prisma = {
      major: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: '0809', name: '计算机科学与技术' },
          { id: 2, code: '6301', name: '护理' },
        ]),
      },
    } as any;
    const redis = { getCache: jest.fn(), setCache: jest.fn() } as any;
    jest.spyOn(levels, 'getMajorLevelMap').mockResolvedValue({
      计算机科学与技术: { phy: '本科', his: '本科' },
      护理: { phy: '兼有', his: '专科' },
    });
    // constructor: (prisma, redis, admissionService) — 第三参本用例用不到, 传 {} as any
    const svc = new MajorService(prisma, redis, {} as any);
    const out = await svc.getPickerOptions();
    expect(out.find((o) => o.name === '计算机科学与技术')!.levels).toEqual({ phy: '本科', his: '本科' });
    expect(out.find((o) => o.name === '护理')!.levels).toEqual({ phy: '兼有', his: '专科' });
  });

  // 本块用 jest.spyOn 打桩了模块级 getMajorLevelMap; 自复原, 不泄漏到后续 describe
  afterEach(() => jest.restoreAllMocks());
});

describe('getPickerOptions', () => {
  // getPickerOptions 现会调用 getMajorLevelMap(查 enrollment_plans 聚合);
  // 这些用例只关心 picker 查询/去重/排序, 故把层次查询打桩成空 map。
  beforeEach(() => {
    jest.spyOn(levels, 'getMajorLevelMap').mockResolvedValue({});
  });

  const buildService = () => {
    const prisma = {
      major: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: '080901', name: '计算机科学与技术' },
          { id: 2, code: '020101', name: '艺术学理论' },
        ]),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new MajorService(prisma as any, redis as any, admissionService as any);
    return { service, prisma };
  };

  it('queries with select projection + Sichuan filter, sorted by id for deterministic dedup', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.major, 'findMany').mockResolvedValueOnce([]);
    await service.getPickerOptions();
    expect(findManySpy).toHaveBeenCalledWith({
      where: { enrollmentPlans: { some: { province: '四川' } } },
      select: { id: true, code: true, name: true },
      orderBy: { id: 'asc' },
    });
  });

  it('dedupes by name when same name appears multiple times', async () => {
    const { service, prisma } = buildService();
    jest.spyOn(prisma.major, 'findMany').mockResolvedValueOnce([
      { id: 1, code: '100201', name: '临床医学' },
      { id: 2, code: '100202', name: '临床医学' },  // 重名
      { id: 3, code: '050101', name: '汉语言文学' },
    ]);
    const result = await service.getPickerOptions();
    expect(result).toHaveLength(2);
    // first-seen kept (id=1 for 临床医学)
    expect(result.find(r => r.name === '临床医学')?.id).toBe(1);
    expect(result.find(r => r.name === '汉语言文学')?.id).toBe(3);
  });

  it('sorts result alphabetically by name', async () => {
    const { service, prisma } = buildService();
    jest.spyOn(prisma.major, 'findMany').mockResolvedValueOnce([
      { id: 1, code: 'X', name: '法学' },
      { id: 2, code: 'Y', name: '哲学' },
      { id: 3, code: 'Z', name: '动物学' },
    ]);
    const result = await service.getPickerOptions();
    // localeCompare zh-CN: 动物学 < 法学 < 哲学（按拼音）
    expect(result.map(r => r.name)).toEqual(['动物学', '法学', '哲学']);
  });

  it('batches 参数 → enrollmentPlans.some.batch in 过滤', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.major, 'findMany').mockResolvedValueOnce([]);
    await service.getPickerOptions(['本科批A段']);
    expect(findManySpy).toHaveBeenCalledWith({
      where: {
        enrollmentPlans: { some: { province: '四川', batch: { in: ['本科批A段'] } } },
      },
      select: { id: true, code: true, name: true },
      orderBy: { id: 'asc' },
    });
  });

  it('batches 为空数组 → 不加 batch in 过滤', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.major, 'findMany').mockResolvedValueOnce([]);
    await service.getPickerOptions([]);
    expect(findManySpy).toHaveBeenCalledWith({
      where: { enrollmentPlans: { some: { province: '四川' } } },
      select: { id: true, code: true, name: true },
      orderBy: { id: 'asc' },
    });
  });
});

describe('getRankings', () => {
  const buildService = () => {
    const prisma = { major: { findMany: jest.fn().mockResolvedValue([]) } };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new MajorService(prisma as any, redis as any, admissionService as any);
    return { service, prisma, redis };
  };

  it('考公榜默认: 在川范围 + csJobs2026 非空 + 按 2026 岗位数降序', async () => {
    const { service, prisma } = buildService();
    await service.getRankings({ board: 'CIVIL_SERVICE' });
    const args = (prisma.major.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.scPlanCount).toEqual({ gt: 0 });
    expect(args.where.csJobs2026).toEqual({ not: null });
    expect(args.orderBy[0]).toEqual({ csJobs2026: { sort: 'desc', nulls: 'last' } });
    expect(args.take).toBe(50);
  });

  it('考公榜 sub=COMPETITION: 竞争比升序 + 岗位数门槛防小样本', async () => {
    const { service, prisma } = buildService();
    await service.getRankings({ board: 'CIVIL_SERVICE', sub: 'COMPETITION' });
    const args = (prisma.major.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.csJobs2026).toEqual({ gte: 500 });
    expect(args.orderBy[0]).toEqual({ csCompetition: { sort: 'asc', nulls: 'last' } });
  });

  it('分数榜物理科类: scPhyScoreHi 降序 + 在川院校数>=3 门槛(防单校失真)', async () => {
    const { service, prisma } = buildService();
    await service.getRankings({ board: 'SCORE', examType: 'PHYSICS' });
    const args = (prisma.major.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.scPhyScoreHi).toEqual({ not: null });
    expect(args.where.scPlanUnis).toEqual({ gte: 3 });
    expect(args.orderBy[0]).toEqual({ scPhyScoreHi: { sort: 'desc', nulls: 'last' } });
  });

  it('scope=ALL 不加在川过滤; 热度榜按全国名次升序', async () => {
    const { service, prisma } = buildService();
    await service.getRankings({ board: 'POPULARITY', scope: 'ALL' });
    const args = (prisma.major.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.scPlanCount).toBeUndefined();
    expect(args.where.popularityRank).toEqual({ not: null });
    expect(args.orderBy[0]).toEqual({ popularityRank: 'asc' });
  });

  it('命中缓存时不查库', async () => {
    const { service, prisma, redis } = buildService();
    (redis.getCache as jest.Mock).mockResolvedValueOnce({ board: 'PLAN', list: [] });
    await service.getRankings({ board: 'PLAN' });
    expect(prisma.major.findMany).not.toHaveBeenCalled();
  });
});
