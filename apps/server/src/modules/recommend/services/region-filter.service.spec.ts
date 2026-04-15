import { RegionFilterService } from './region-filter.service';

describe('RegionFilterService', () => {
  let service: RegionFilterService;

  const mockRegions = [
    {
      id: 1,
      program: 'PROVINCIAL_FREE_TEACHER',
      programLabel: '省级公费师范生',
      area: '成都市',
      county: '邛崃市',
      detail: null,
    },
    {
      id: 2,
      program: 'PROVINCIAL_FREE_TEACHER',
      programLabel: '省级公费师范生',
      area: '成都市',
      county: '金堂县',
      detail: null,
    },
    {
      id: 3,
      program: 'NATIONAL_SPECIAL_PLAN',
      programLabel: '国家专项计划',
      area: '凉山州',
      county: '昭觉县',
      detail: null,
    },
  ];

  const mockPrisma = {
    eligibleRegion: {
      findMany: jest.fn().mockResolvedValue(mockRegions),
    },
  };

  const mockRedis = {
    getCache: jest.fn().mockResolvedValue(null),
    setCache: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.getCache.mockResolvedValue(null);
    service = new RegionFilterService(mockPrisma as any, mockRedis as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ────────────────────────────────────────────────
  // loadRegions
  // ────────────────────────────────────────────────

  describe('loadRegions', () => {
    it('should query prisma and populate index on first call', async () => {
      await service.loadRegions();
      expect(mockPrisma.eligibleRegion.findMany).toHaveBeenCalledTimes(1);
    });

    it('should use Redis cache when available and skip prisma query', async () => {
      mockRedis.getCache.mockResolvedValue(mockRegions);
      await service.loadRegions();
      expect(mockPrisma.eligibleRegion.findMany).not.toHaveBeenCalled();
    });

    it('should not query prisma again on second call (loaded guard)', async () => {
      await service.loadRegions();
      await service.loadRegions();
      expect(mockPrisma.eligibleRegion.findMany).toHaveBeenCalledTimes(1);
    });

    it('should store data in Redis after loading from DB', async () => {
      await service.loadRegions();
      expect(mockRedis.setCache).toHaveBeenCalledWith(
        'eligible_regions:all',
        mockRegions,
        86400,
      );
    });
  });

  // ────────────────────────────────────────────────
  // detectSpecialProgram
  // ────────────────────────────────────────────────

  describe('detectSpecialProgram', () => {
    it('should detect 公费师范 → PROVINCIAL_FREE_TEACHER (default)', () => {
      const result = service.detectSpecialProgram('本科一批', '公费师范生计划');
      expect(result).toBe('PROVINCIAL_FREE_TEACHER');
    });

    it('should detect 免费师范 → PROVINCIAL_FREE_TEACHER (default)', () => {
      const result = service.detectSpecialProgram('免费师范生', null);
      expect(result).toBe('PROVINCIAL_FREE_TEACHER');
    });

    it('should detect 公费师范 + 省级 → PROVINCIAL_FREE_TEACHER', () => {
      const result = service.detectSpecialProgram('省级公费师范', null);
      expect(result).toBe('PROVINCIAL_FREE_TEACHER');
    });

    it('should detect 公费师范 + 部属 → NATIONAL_FREE_TEACHER', () => {
      const result = service.detectSpecialProgram('部属公费师范', null);
      expect(result).toBe('NATIONAL_FREE_TEACHER');
    });

    it('should detect 公费师范 + 国家级 → NATIONAL_FREE_TEACHER', () => {
      const result = service.detectSpecialProgram('国家级公费师范计划', null);
      expect(result).toBe('NATIONAL_FREE_TEACHER');
    });

    it('should detect 国家专项 → NATIONAL_SPECIAL_PLAN', () => {
      const result = service.detectSpecialProgram('国家专项计划', null);
      expect(result).toBe('NATIONAL_SPECIAL_PLAN');
    });

    it('should detect 地方专项 → RURAL_REVITALIZATION', () => {
      const result = service.detectSpecialProgram(null, '地方专项招生');
      expect(result).toBe('RURAL_REVITALIZATION');
    });

    it('should detect 深度贫困 → DEEP_POVERTY', () => {
      const result = service.detectSpecialProgram(null, '深度贫困地区专项');
      expect(result).toBe('DEEP_POVERTY');
    });

    it('should detect 民族地区 → ETHNIC_BORDER_REGION', () => {
      const result = service.detectSpecialProgram(null, '民族地区专项计划');
      expect(result).toBe('ETHNIC_BORDER_REGION');
    });

    it('should return null for regular batch text', () => {
      const result = service.detectSpecialProgram('本科一批', null);
      expect(result).toBeNull();
    });

    it('should return null when both args are null', () => {
      const result = service.detectSpecialProgram(null, null);
      expect(result).toBeNull();
    });
  });

  // ────────────────────────────────────────────────
  // isEligible
  // ────────────────────────────────────────────────

  describe('isEligible', () => {
    beforeEach(async () => {
      await service.loadRegions();
    });

    it('should return eligible when student county matches program region', () => {
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: '成都市',
        county: '邛崃市',
      });
      expect(result.eligible).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should return ineligible when county does not match', () => {
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: '成都市',
        county: '武侯区',
      });
      expect(result.eligible).toBe(false);
    });

    it('should fallback to city-level match when county is null, return eligible with warning containing 区县', () => {
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: '成都市',
        county: null,
      });
      expect(result.eligible).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('区县');
    });

    it('should return ineligible when city does not match at all', () => {
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: '绵阳市',
        county: null,
      });
      expect(result.eligible).toBe(false);
    });

    it('should return ineligible when student city is null', () => {
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: null,
        county: null,
      });
      expect(result.eligible).toBe(false);
    });

    it('should return ineligible when program is not in index', () => {
      const result = service.isEligible('UNKNOWN_PROGRAM', {
        city: '成都市',
        county: '邛崃市',
      });
      expect(result.eligible).toBe(false);
    });

    it('should match NATIONAL_SPECIAL_PLAN by county for 凉山州/昭觉县', () => {
      const result = service.isEligible('NATIONAL_SPECIAL_PLAN', {
        city: '凉山州',
        county: '昭觉县',
      });
      expect(result.eligible).toBe(true);
    });

    it('should return ineligible for NATIONAL_SPECIAL_PLAN when county is 昭觉县 but city is wrong', () => {
      const result = service.isEligible('NATIONAL_SPECIAL_PLAN', {
        city: '成都市',
        county: '昭觉县',
      });
      expect(result.eligible).toBe(false);
    });
  });
});
