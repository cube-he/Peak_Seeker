import { RankingBoardService } from './ranking-board.service';

const makeService = (universities: any[]) => {
  const prisma = {
    university: { findMany: jest.fn().mockResolvedValue(universities) },
    admissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const redis = {
    getCache: jest.fn().mockResolvedValue(null),
    setCache: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new RankingBoardService(prisma as any, redis as any);
  return { svc, prisma, redis };
};

const uni = (over: Partial<any> = {}) => ({
  id: 1, name: '某大学', logoUrl: null, province: '四川', city: '成都',
  type: '综合', runningNature: '公办', is985: false, is211: false,
  isDoubleFirstClass: false, softRanking: 50, ...over,
});

describe('RankingBoardService.getRankingBoard', () => {
  it('returns 7 boards with the configured keys', async () => {
    const { svc } = makeService([uni()]);
    const boards = await svc.getRankingBoard('物理');
    expect(boards.map((b) => b.key)).toEqual([
      'sichuan-undergrad', 'sichuan-college', 'neighbor-undergrad',
      'neighbor-college', 'developed-undergrad', 'developed-college', 'national-elite',
    ]);
  });

  it('numbers items by descending soft ranking strength (rank starts at 1)', async () => {
    const { svc } = makeService([uni({ id: 1, softRanking: 5 }), uni({ id: 2, softRanking: 9 })]);
    const board = (await svc.getRankingBoard('物理'))[0];
    expect(board.items.map((i) => ({ id: i.id, rank: i.rank }))).toEqual([
      { id: 1, rank: 1 }, { id: 2, rank: 2 },
    ]);
  });

  it('excludes universities without a soft ranking and sorts ascending', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard('物理');
    const firstCall = prisma.university.findMany.mock.calls[0][0];
    expect(firstCall.where.softRanking).toEqual({ gt: 0 });
    expect(firstCall.where.level).toBe('本科');
    expect(firstCall.where.province).toEqual({ in: ['四川'] });
    expect(firstCall.orderBy).toEqual({ softRanking: 'asc' });
  });

  it('uses an OR of 985/211/双一流 for the national elite board', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard('物理');
    const eliteCall = prisma.university.findMany.mock.calls[6][0];
    expect(eliteCall.where.OR).toEqual([
      { is985: true }, { is211: true }, { isDoubleFirstClass: true },
    ]);
  });
});

describe('RankingBoardService admission rank enrichment', () => {
  it('merges Sichuan admission rank/score into each item', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7, softRanking: 3 })]) },
      admissionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { universityId: 7, universityMinRank: 8200, universityMinScore: 631 },
        ]),
      },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const board = (await svc.getRankingBoard('物理'))[0];

    expect(board.items[0].admissionMinRank).toBe(8200);
    expect(board.items[0].admissionMinScore).toBe(631);
  });

  it('queries admission records by Sichuan, recruit type and exam type', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7 })]) },
      admissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    await svc.getRankingBoard('历史');

    const call = prisma.admissionRecord.findMany.mock.calls[0][0];
    expect(call.where.province).toBe('四川');
    expect(call.where.recruitType).toBe('普通类本科');
    expect(call.where.subjects).toEqual({ contains: '历史' });
    expect(call.where.year).toBe(new Date().getFullYear() - 1);
  });

  it('leaves admission fields null when no record matches', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7 })]) },
      admissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const board = (await svc.getRankingBoard('物理'))[0];
    expect(board.items[0].admissionMinRank).toBeNull();
  });

  it('returns an empty map and skips DB query when universityIds is empty', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([]) },
      admissionRecord: { findMany: jest.fn() },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);
    await svc.getRankingBoard('物理');
    expect(prisma.admissionRecord.findMany).not.toHaveBeenCalled();
  });
});

describe('RankingBoardService caching', () => {
  it('returns cached boards without querying the database', async () => {
    const prisma = {
      university: { findMany: jest.fn() },
      admissionRecord: { findMany: jest.fn() },
    };
    const redis = {
      getCache: jest.fn().mockResolvedValue([{ key: 'cached' }]),
      setCache: jest.fn(),
    };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const boards = await svc.getRankingBoard('物理');

    expect(boards).toEqual([{ key: 'cached' }]);
    expect(prisma.university.findMany).not.toHaveBeenCalled();
    expect(redis.getCache).toHaveBeenCalledWith('ranking-board:物理');
  });

  it('caches freshly built boards keyed by exam type', async () => {
    const { svc, redis } = makeService([uni()]);
    await svc.getRankingBoard('历史');
    expect(redis.setCache).toHaveBeenCalledWith('ranking-board:历史', expect.any(Array), 3600);
  });
});
