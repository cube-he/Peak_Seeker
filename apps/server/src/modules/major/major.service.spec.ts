import { MajorService } from './major.service';

describe('getPickerOptions', () => {
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
});
