import { AlgorithmConfigService, RUSH_SAFE_STABLE_KEY, DEFAULT_THRESHOLDS } from './algorithm-config.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AlgorithmConfigService', () => {
  let service: AlgorithmConfigService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      systemConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new AlgorithmConfigService(prisma as unknown as PrismaService);
  });

  describe('getRushSafeStableThresholds', () => {
    it('库里有 → 返回库里的值', async () => {
      const value = {
        rush: { min: 0.80, max: 0.92 },
        safe: { min: 0.92, max: 1.08 },
        stable: { min: 1.08, max: 1.25 },
      };
      prisma.systemConfig.findUnique.mockResolvedValue({ key: RUSH_SAFE_STABLE_KEY, value });
      const result = await service.getRushSafeStableThresholds();
      expect(result).toEqual(value);
    });

    it('库里没有 → 返回默认值', async () => {
      prisma.systemConfig.findUnique.mockResolvedValue(null);
      const result = await service.getRushSafeStableThresholds();
      expect(result).toEqual(DEFAULT_THRESHOLDS);
    });
  });

  describe('setRushSafeStableThresholds', () => {
    it('合法值 → upsert', async () => {
      prisma.systemConfig.upsert.mockResolvedValue({});
      const value = {
        rush: { min: 0.85, max: 0.95 },
        safe: { min: 0.95, max: 1.05 },
        stable: { min: 1.05, max: 1.20 },
      };
      await service.setRushSafeStableThresholds(value);
      expect(prisma.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: RUSH_SAFE_STABLE_KEY },
        create: expect.objectContaining({ key: RUSH_SAFE_STABLE_KEY, value }),
        update: { value },
      });
    });

    it('rush.min >= rush.max → 抛错', async () => {
      const bad = {
        rush: { min: 0.95, max: 0.85 },
        safe: { min: 0.95, max: 1.05 },
        stable: { min: 1.05, max: 1.20 },
      };
      await expect(service.setRushSafeStableThresholds(bad)).rejects.toThrow(/rush\.min.*rush\.max/);
    });

    it('区间不连续（safe.min != rush.max） → 抛错', async () => {
      const bad = {
        rush: { min: 0.85, max: 0.95 },
        safe: { min: 0.96, max: 1.05 },
        stable: { min: 1.05, max: 1.20 },
      };
      await expect(service.setRushSafeStableThresholds(bad)).rejects.toThrow(/连续/);
    });
  });
});
