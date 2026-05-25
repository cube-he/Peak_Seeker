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
  it('returns 24 boards: 7 existing + 7 本科类别 + 民办本科 + 9 高职类别', async () => {
    const { svc } = makeService([uni()]);
    const boards = await svc.getRankingBoard('物理');
    expect(boards.map((b) => b.key)).toEqual([
      'sichuan-undergrad', 'sichuan-college', 'neighbor-undergrad',
      'neighbor-college', 'developed-undergrad', 'developed-college', 'national-elite',
      'category-财经类', 'category-医药类', 'category-中医药类',
      'category-语言类', 'category-政法类', 'category-民族类', 'category-体育类',
      'private-undergrad',
      'vocational-综合类', 'vocational-理工类', 'vocational-师范类',
      'vocational-农林类', 'vocational-医药类', 'vocational-财经类',
      'vocational-政法类', 'vocational-体育类', 'vocational-文艺类',
    ]);
  });

  it('本科 category board filters by softCategory + softRankList=本科 (disambiguate from 高职 categories)', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard('物理');
    // 索引 7 = category-财经类(本科)
    const call = prisma.university.findMany.mock.calls[7][0];
    expect(call.where.softCategory).toBe('财经类');
    expect(call.where.softCategoryRank).toEqual({ gt: 0 });
    expect(call.where.softRankList).toBe('本科');
    expect(call.where.level).toBe('本科');
    expect(call.orderBy).toEqual({ softCategoryRank: 'asc' });
  });

  it('高职 category board filters by softCategory + softRankList=高职', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard('物理');
    // 索引 15 = vocational-综合类
    const call = prisma.university.findMany.mock.calls[15][0];
    expect(call.where.softCategory).toBe('综合类');
    expect(call.where.softCategoryRank).toEqual({ gt: 0 });
    expect(call.where.softRankList).toBe('高职');
    expect(call.where.level).toBe('专科');
    expect(call.orderBy).toEqual({ softCategoryRank: 'asc' });
  });

  it('民办 board filters by softRankList=民办 and orders by softRanking', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard('物理');
    // 索引 14 = private-undergrad
    const call = prisma.university.findMany.mock.calls[14][0];
    expect(call.where.softRankList).toBe('民办');
    expect(call.where.level).toBe('本科');
    expect(call.where.softRanking).toEqual({ gt: 0 });
    expect(call.orderBy).toEqual({ softRanking: 'asc' });
  });

  it('exposes softRankList on each item so the frontend can label the rank source', async () => {
    const { svc } = makeService([uni({ id: 9, softRanking: 7, softRankList: '民办' })]);
    const boards = await svc.getRankingBoard('物理');
    expect(boards[0].items[0].softRankList).toBe('民办');
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

  it('province 本科 boards filter softRankList=本科 to exclude 民办 universities', async () => {
    // 民办本科 uni 的 softRanking 是民办榜内名次(从 1 开始),会污染"川内本科榜"等综合榜的排序
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard('物理');
    // 索引 0 = sichuan-undergrad
    expect(prisma.university.findMany.mock.calls[0][0].where.softRankList).toBe('本科');
    // 索引 2 = neighbor-undergrad
    expect(prisma.university.findMany.mock.calls[2][0].where.softRankList).toBe('本科');
    // 索引 4 = developed-undergrad
    expect(prisma.university.findMany.mock.calls[4][0].where.softRankList).toBe('本科');
    // 索引 6 = national-elite
    expect(prisma.university.findMany.mock.calls[6][0].where.softRankList).toBe('本科');
  });

  it('province 专科 boards filter softRankList=高职 (匹配高职榜口径)', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard('物理');
    // 索引 1 = sichuan-college,3 = neighbor-college,5 = developed-college
    expect(prisma.university.findMany.mock.calls[1][0].where.softRankList).toBe('高职');
    expect(prisma.university.findMany.mock.calls[3][0].where.softRankList).toBe('高职');
    expect(prisma.university.findMany.mock.calls[5][0].where.softRankList).toBe('高职');
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
          { universityId: 7, groupMinRank: 8200, majorMinRank: null, filingMinRank: null, groupMinScore: 631, majorMinScore: null, filingMinScore: null },
        ]),
      },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const board = (await svc.getRankingBoard('物理'))[0];

    expect(board.items[0].admissionMinRank).toBe(8200);
    expect(board.items[0].admissionMinScore).toBe(631);
  });

  it('takes the most lenient (largest) rank when one university has multiple records', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7 })]) },
      admissionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { universityId: 7, groupMinRank: 5000, majorMinRank: null, filingMinRank: null, groupMinScore: 600, majorMinScore: null, filingMinScore: null },
          { universityId: 7, groupMinRank: 9000, majorMinRank: null, filingMinRank: null, groupMinScore: 560, majorMinScore: null, filingMinScore: null },
          { universityId: 7, groupMinRank: 7000, majorMinRank: null, filingMinRank: null, groupMinScore: 580, majorMinScore: null, filingMinScore: null },
        ]),
      },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const board = (await svc.getRankingBoard('物理'))[0];

    expect(board.items[0].admissionMinRank).toBe(9000);
    expect(board.items[0].admissionMinScore).toBe(560);
  });

  it('falls back to major then filing rank when group rank is null', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7 })]) },
      admissionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { universityId: 7, groupMinRank: null, majorMinRank: 4321, filingMinRank: 9999, groupMinScore: null, majorMinScore: 612, filingMinScore: 590 },
        ]),
      },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const board = (await svc.getRankingBoard('物理'))[0];

    expect(board.items[0].admissionMinRank).toBe(4321);
    expect(board.items[0].admissionMinScore).toBe(612);
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
    expect(redis.getCache).toHaveBeenCalledWith('university:ranking-board:物理');
  });

  it('caches freshly built boards keyed by exam type', async () => {
    const { svc, redis } = makeService([uni()]);
    await svc.getRankingBoard('历史');
    expect(redis.setCache).toHaveBeenCalledWith('university:ranking-board:历史', expect.any(Array), 3600);
  });
});
