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
    const boards = await svc.getRankingBoard();
    expect(boards.map((b) => b.key)).toEqual([
      'sichuan-undergrad', 'sichuan-college', 'neighbor-undergrad',
      'neighbor-college', 'developed-undergrad', 'developed-college', 'national-elite',
    ]);
  });

  it('numbers items by descending soft ranking strength (rank starts at 1)', async () => {
    const { svc } = makeService([uni({ id: 1, softRanking: 5 }), uni({ id: 2, softRanking: 9 })]);
    const board = (await svc.getRankingBoard())[0];
    expect(board.items.map((i) => ({ id: i.id, rank: i.rank }))).toEqual([
      { id: 1, rank: 1 }, { id: 2, rank: 2 },
    ]);
  });

  it('excludes universities without a soft ranking and sorts ascending', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard();
    const firstCall = prisma.university.findMany.mock.calls[0][0];
    expect(firstCall.where.softRanking).toEqual({ gt: 0 });
    expect(firstCall.where.level).toBe('本科');
    expect(firstCall.where.province).toEqual({ in: ['四川'] });
    expect(firstCall.orderBy).toEqual({ softRanking: 'asc' });
  });

  it('uses an OR of 985/211/双一流 for the national elite board', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard();
    const eliteCall = prisma.university.findMany.mock.calls[6][0];
    expect(eliteCall.where.OR).toEqual([
      { is985: true }, { is211: true }, { isDoubleFirstClass: true },
    ]);
  });
});
