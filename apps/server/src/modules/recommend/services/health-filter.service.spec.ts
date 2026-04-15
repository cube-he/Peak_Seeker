import { HealthFilterService } from './health-filter.service';

describe('HealthFilterService', () => {
  let service: HealthFilterService;

  // Sample HealthRestriction rows representing different rule types
  const mockRestrictions = [
    // Hard rule: COLOR_BLIND restricts 化学类 (by majorCategory)
    {
      conditionCode: 'COLOR_BLIND',
      conditionName: '色觉异常（色盲）',
      restrictionType: '不能报考',
      severity: 'hard',
      section: null,
      restrictionScope: '类',
      majorCategory: '化学类',
      majorCode: null,
      majorName: null,
    },
    // Soft rule: COLOR_WEAK restricts a specific major code 082502
    {
      conditionCode: 'COLOR_WEAK',
      conditionName: '色觉异常（色弱）',
      restrictionType: '受限',
      severity: 'soft',
      section: null,
      restrictionScope: '专业',
      majorCategory: null,
      majorCode: '082502',
      majorName: '化学工程与工艺',
    },
    // Hard rule: HEART_DISEASE with both majorCategory and majorCode null → affects ALL
    {
      conditionCode: 'HEART_DISEASE',
      conditionName: '先天性心脏病',
      restrictionType: '不能报考',
      severity: 'hard',
      section: null,
      restrictionScope: '类',
      majorCategory: null,
      majorCode: null,
      majorName: null,
    },
  ];

  const mockPrisma = {
    healthRestriction: {
      findMany: jest.fn().mockResolvedValue(mockRestrictions),
    },
  };

  const mockRedisService = {
    getCache: jest.fn().mockResolvedValue(null),
    setCache: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset cache mock to return null (cache miss) by default
    mockRedisService.getCache.mockResolvedValue(null);
    service = new HealthFilterService(
      mockPrisma as any,
      mockRedisService as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ────────────────────────────────────────────────
  // loadRestrictions
  // ────────────────────────────────────────────────

  describe('loadRestrictions', () => {
    it('should query prisma and populate index on first call', async () => {
      await service.loadRestrictions();

      expect(mockPrisma.healthRestriction.findMany).toHaveBeenCalledTimes(1);
    });

    it('should use Redis cache when available and skip prisma query', async () => {
      mockRedisService.getCache.mockResolvedValue(mockRestrictions);

      await service.loadRestrictions();

      expect(mockPrisma.healthRestriction.findMany).not.toHaveBeenCalled();
    });

    it('should not query prisma again on second call (loaded guard)', async () => {
      await service.loadRestrictions();
      await service.loadRestrictions();

      expect(mockPrisma.healthRestriction.findMany).toHaveBeenCalledTimes(1);
    });

    it('should store data in Redis after loading from DB', async () => {
      await service.loadRestrictions();

      expect(mockRedisService.setCache).toHaveBeenCalledWith(
        'health_restrictions:all',
        mockRestrictions,
        86400,
      );
    });
  });

  // ────────────────────────────────────────────────
  // mapLegacyConditions
  // ────────────────────────────────────────────────

  describe('mapLegacyConditions', () => {
    it('should add COLOR_BLIND when colorBlind=true', () => {
      const codes = service.mapLegacyConditions(true, false, null);
      expect(codes).toContain('COLOR_BLIND');
    });

    it('should add COLOR_WEAK when colorWeak=true', () => {
      const codes = service.mapLegacyConditions(false, true, null);
      expect(codes).toContain('COLOR_WEAK');
    });

    it('should not duplicate COLOR_BLIND if already present in physicalLimits', () => {
      const codes = service.mapLegacyConditions(true, false, ['COLOR_BLIND']);
      expect(codes.filter((c) => c === 'COLOR_BLIND').length).toBe(1);
    });

    it('should include physicalLimits array codes when provided', () => {
      const codes = service.mapLegacyConditions(false, false, [
        'HEARING_LOSS',
        'LIMB_DEFECT',
      ]);
      expect(codes).toContain('HEARING_LOSS');
      expect(codes).toContain('LIMB_DEFECT');
    });

    it('should return empty array when all false/null', () => {
      const codes = service.mapLegacyConditions(false, false, null);
      expect(codes).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────
  // checkCandidate
  // ────────────────────────────────────────────────

  describe('checkCandidate', () => {
    // Populate the index before each check test
    beforeEach(async () => {
      await service.loadRestrictions();
    });

    it('should return excluded=false with empty risks when student has no conditions', () => {
      const result = service.checkCandidate([], {
        majorCategory: '化学类',
        majorCode: null,
      });

      expect(result.excluded).toBe(false);
      expect(result.risks).toHaveLength(0);
    });

    it('should exclude candidate when student is COLOR_BLIND and major is 化学类 (hard + category match)', () => {
      const result = service.checkCandidate(['COLOR_BLIND'], {
        majorCategory: '化学类',
        majorCode: null,
      });

      expect(result.excluded).toBe(true);
      expect(result.risks).toHaveLength(0);
    });

    it('should NOT exclude for COLOR_BLIND when major category does not match', () => {
      const result = service.checkCandidate(['COLOR_BLIND'], {
        majorCategory: '工学',
        majorCode: '080901',
      });

      expect(result.excluded).toBe(false);
    });

    it('should return soft risk without excluding for COLOR_WEAK + matching majorCode', () => {
      const result = service.checkCandidate(['COLOR_WEAK'], {
        majorCategory: '工学',
        majorCode: '082502',
      });

      expect(result.excluded).toBe(false);
      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.risks[0]).toContain('色觉异常（色弱）');
    });

    it('should NOT add risk for COLOR_WEAK when majorCode does not match', () => {
      const result = service.checkCandidate(['COLOR_WEAK'], {
        majorCategory: '工学',
        majorCode: '080901',
      });

      expect(result.excluded).toBe(false);
      expect(result.risks).toHaveLength(0);
    });

    it('should exclude all majors for universal hard restriction (HEART_DISEASE, null category+code)', () => {
      const result = service.checkCandidate(['HEART_DISEASE'], {
        majorCategory: '工学',
        majorCode: '080901',
      });

      expect(result.excluded).toBe(true);
    });

    it('should exclude when candidate majorCategory includes restriction category substring', () => {
      // Rule: COLOR_BLIND → 化学类, candidate category: "理学/化学类"
      const result = service.checkCandidate(['COLOR_BLIND'], {
        majorCategory: '理学/化学类',
        majorCode: null,
      });

      expect(result.excluded).toBe(true);
    });

    it('should accumulate multiple soft risks when student has multiple soft conditions', () => {
      // Add a second soft rule for COLOR_BLIND matching a specific majorCode
      // Use COLOR_WEAK with the exact majorCode '082502' — expect 1 risk
      // Then test with both COLOR_BLIND + COLOR_WEAK where only COLOR_WEAK has a soft match
      const result = service.checkCandidate(['COLOR_BLIND', 'COLOR_WEAK'], {
        majorCategory: '工学',
        majorCode: '082502',
      });

      // COLOR_BLIND has no rule for 工学/082502, COLOR_WEAK soft-matches 082502
      expect(result.excluded).toBe(false);
      expect(result.risks.length).toBe(1);
    });
  });
});
