import { StatsService } from './stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('StatsService', () => {
  let service: StatsService;
  let prisma: any;
  let redis: any;

  beforeEach(() => {
    prisma = {
      university: {
        count: jest.fn(),
      },
      admissionRecord: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      major: {
        count: jest.fn(),
      },
    };

    redis = {
      getCache: jest.fn(),
      setCache: jest.fn(),
    };

    service = new StatsService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  describe('getHomepageStats', () => {
    it('should return cached data when cache hit', async () => {
      const cached = {
        universityCount: 2237,
        admissionRecordCount: 140000,
        majorCount: 1400,
        dataYearSpan: 4,
      };
      redis.getCache.mockResolvedValue(cached);

      const result = await service.getHomepageStats();

      expect(result).toEqual(cached);
      expect(prisma.university.count).not.toHaveBeenCalled();
    });

    it('should query db and cache result on cache miss', async () => {
      redis.getCache.mockResolvedValue(null);
      prisma.university.count.mockResolvedValue(2237);
      prisma.admissionRecord.count.mockResolvedValue(140000);
      prisma.major.count.mockResolvedValue(1400);
      // distinct years via groupBy simulation: return array of { year } objects
      prisma.admissionRecord.findMany.mockResolvedValue([
        { year: 2022 },
        { year: 2023 },
        { year: 2024 },
        { year: 2025 },
      ]);

      const result = await service.getHomepageStats();

      expect(result).toEqual({
        universityCount: 2237,
        admissionRecordCount: 140000,
        majorCount: 1400,
        dataYearSpan: 4,
      });

      // Verify university count uses enrollment-plan filter (在川招生口径)
      expect(prisma.university.count).toHaveBeenCalledWith({
        where: { enrollmentPlans: { some: { province: '四川' } } },
      });

      // Verify result is cached for 1 day
      expect(redis.setCache).toHaveBeenCalledWith(
        'stats:homepage',
        result,
        86400,
      );
    });

    it('should return dataYearSpan=0 when no admission records exist', async () => {
      redis.getCache.mockResolvedValue(null);
      prisma.university.count.mockResolvedValue(0);
      prisma.admissionRecord.count.mockResolvedValue(0);
      prisma.major.count.mockResolvedValue(0);
      prisma.admissionRecord.findMany.mockResolvedValue([]);

      const result = await service.getHomepageStats();

      expect(result.dataYearSpan).toBe(0);
    });
  });
});
