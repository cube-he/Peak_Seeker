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

    it('分数 < 0 → 抛 BadRequestException', async () => {
      await expect(service.scoreToRank(2025, '物理', -1)).rejects.toThrow('分数需在 0..750');
    });

    it('分数 > 750 → 抛 BadRequestException', async () => {
      await expect(service.scoreToRank(2025, '物理', 800)).rejects.toThrow('分数需在 0..750');
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

    it('位次 < 1 → 抛 BadRequestException', async () => {
      await expect(service.rankToScore(2025, '物理', 0)).rejects.toThrow('位次需 ≥ 1');
    });
  });

  describe('equivalent', () => {
    it('线性比例法换算：p=R/N 然后用各年 N 反推 R_y', async () => {
      // 基准年 2025 物理，rank=20000，假设 2025 物理总人数 N=200000 → p=0.10
      // 2024 理科 N=180000 → R_y = 0.10 * 180000 = 18000
      const stub = (year: number, examType: string, totalCount: number, rankToScoreMap: Record<number, number>) => {
        return ({ where, orderBy }: any) => {
          if (where.year !== year || where.examType !== examType) return Promise.resolve(null);
          // getTotalCount 调用：orderBy cumulativeCount desc
          if (orderBy?.cumulativeCount === 'desc') {
            return Promise.resolve({ score: 0, cumulativeCount: totalCount });
          }
          // rankToScore 调用：where.cumulativeCount.gte = R_y, orderBy score desc
          if (where.cumulativeCount?.gte != null) {
            const R = where.cumulativeCount.gte;
            const matchedScore = rankToScoreMap[R];
            return matchedScore != null
              ? Promise.resolve({ score: matchedScore, cumulativeCount: R })
              : Promise.resolve(null);
          }
          return Promise.resolve(null);
        };
      };

      // 让 findFirst 按 (year, examType) 路由
      prisma.scoreSegment.findFirst.mockImplementation((args: any) => {
        const { where } = args;
        if (where.year === 2025 && where.examType === '物理') {
          return stub(2025, '物理', 200000, { 20000: 600 })(args);
        }
        if (where.year === 2024 && where.examType === '理科') {
          return stub(2024, '理科', 180000, { 18000: 595 })(args);
        }
        if (where.year === 2023 && where.examType === '理科') {
          return stub(2023, '理科', 190000, { 19000: 590 })(args);
        }
        if (where.year === 2022 && where.examType === '理科') {
          return stub(2022, '理科', 195000, { 19500: 585 })(args);
        }
        return Promise.resolve(null);
      });

      const result = await service.equivalent(2025, '物理', 20000);
      expect(result.base.year).toBe(2025);
      expect(result.base.rank).toBe(20000);
      expect(result.equivalents).toHaveLength(3); // 2024/2023/2022
      const e2024 = result.equivalents.find((e) => e.year === 2024)!;
      expect(e2024.examType).toBe('理科');
      expect(e2024.rank).toBe(18000);
      expect(e2024.score).toBe(595);
    });
  });
});
