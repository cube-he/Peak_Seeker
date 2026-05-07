import { MajorService } from './major.service';

describe('getPickerOptions', () => {
  const buildService = () => {
    const prisma = {
      major: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: '080901', name: '计算机科学与技术' },
          { id: 2, code: null,     name: '艺术学理论' },
        ]),
      },
    };
    const redis = { getCache: jest.fn(), setCache: jest.fn() };
    const admissionService = { getTargetYear: jest.fn() };
    const service = new MajorService(prisma as any, redis as any, admissionService as any);
    return { service, prisma };
  };

  it('returns array of {id, code, name} for all majors', async () => {
    const { service } = buildService();
    const result = await service.getPickerOptions();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String),
        }),
      );
    }
  });

  it('queries with select projection only (no relations)', async () => {
    const { service, prisma } = buildService();
    const findManySpy = jest.spyOn(prisma.major, 'findMany').mockResolvedValueOnce([]);
    await service.getPickerOptions();
    expect(findManySpy).toHaveBeenCalledWith({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  });
});
