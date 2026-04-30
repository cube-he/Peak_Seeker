import { ScoreSegmentService } from './score-segment.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ScoreSegmentService', () => {
  let service: ScoreSegmentService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      scoreSegment: {
        findFirst: jest.fn(),
      },
    };
    service = new ScoreSegmentService(prisma as unknown as PrismaService);
  });

  describe('scoreToRank', () => {
    it('返回查到的累计位次', async () => {
      // 模拟 580 分的最低位次是 28500
      prisma.scoreSegment.findFirst.mockImplementation(({ where, orderBy }: any) => {
        // 该实现下 service 会请求 score <= 580 的最高一行
        if (where.score?.lte === 580) {
          return Promise.resolve({ score: 580, cumulativeCount: 28500 });
        }
        return Promise.resolve(null);
      });
      // 全省总人数（用最低分行的 cumulativeCount 作上限）
      prisma.scoreSegment.findFirst.mockImplementationOnce(() =>
        Promise.resolve({ score: 580, cumulativeCount: 28500 }),
      );

      const result = await service.scoreToRank(2025, '物理', 580);
      expect(result.rank).toBe(28500);
      expect(result.score).toBe(580);
    });

    it('分数高于最高分 → rank=1（顶端）', async () => {
      prisma.scoreSegment.findFirst.mockImplementation(({ where }: any) => {
        if (where.score?.lte) return Promise.resolve(null); // 无人 ≤ 750（数据库无该分段记录）
        return Promise.resolve({ score: 700, cumulativeCount: 1 }); // 最高分行（getTotalCount 用）
      });
      // 750 分以内但数据库无记录 → 模拟顶尖情形
      const result = await service.scoreToRank(2025, '物理', 750);
      expect(result.rank).toBe(1);
    });
  });

  describe('rankToScore', () => {
    it('返回该位次对应的最高分（cumulativeCount >= rank 的最高 score）', async () => {
      prisma.scoreSegment.findFirst.mockResolvedValue({ score: 580, cumulativeCount: 28500 });
      const result = await service.rankToScore(2025, '物理', 28500);
      expect(result.score).toBe(580);
      expect(result.rank).toBe(28500);
    });

    it('位次超出范围 → 返回最低分', async () => {
      // 第一次查询返回 null（无 cumulativeCount >= 999999 的行）
      prisma.scoreSegment.findFirst.mockResolvedValueOnce(null);
      // 第二次查询返回最低分行
      prisma.scoreSegment.findFirst.mockResolvedValueOnce({ score: 100, cumulativeCount: 300000 });
      const result = await service.rankToScore(2025, '物理', 999999);
      expect(result.score).toBe(100);
    });
  });
});
