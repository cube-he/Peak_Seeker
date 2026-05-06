import { FacilityScorer } from './facility-scorer.service';

interface CampusInput {
  id: number;
  latitude: number;
  longitude: number;
}

interface PoiInput {
  id: string;        // amapId
  name: string;
  typecode: string;
  location: string;  // "lng,lat"
  address?: string;
}

describe('FacilityScorer.score', () => {
  const scorer = new FacilityScorer();

  // 清华大学主坐标 (校区 id=1)
  const campus = { id: 1, latitude: 40.003213, longitude: 116.326936 };

  it('classifies POI starting with uniName + close as HIGH', () => {
    const poi: PoiInput = {
      id: 'P1', name: '清华大学万人食堂', typecode: '050100',
      location: '116.322425,40.006875',  // ~450m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      amapId: 'P1', accept: true, campusId: 1,
      confidence: 'high', matchMethod: 'name_prefix',
    });
    expect(out[0].distanceMeters).toBeLessThan(800);
  });

  it('classifies POI containing uniName but not starting with it as MEDIUM', () => {
    const poi: PoiInput = {
      id: 'P2', name: '北京清华大学家属餐厅', typecode: '050100',
      location: '116.327000,40.005000',
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ confidence: 'medium', matchMethod: 'name_contains', accept: true });
  });

  it('classifies cafeteria-keyword POI within 500m + 050 typecode as LOW', () => {
    const poi: PoiInput = {
      id: 'P3', name: '紫荆园餐厅', typecode: '050100',
      location: '116.327500,40.004000',  // ~150m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ confidence: 'low', matchMethod: 'typecode_radius', accept: true });
  });

  it('rejects POI at 800m exactly (boundary, ≥800 = reject)', () => {
    // 800m east of campus: lng delta = 800 / (111320 * cos(40)) ≈ 0.00939
    const poi: PoiInput = {
      id: 'P4', name: '清华大学远程食堂', typecode: '050100',
      location: '116.336326,40.003213',
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('rejects POI further than 800m', () => {
    const poi: PoiInput = {
      id: 'P5', name: '清华大学附属医院食堂', typecode: '050100',
      location: '116.350000,40.010000',  // > 800m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('rejects POI without uni name and not within 500m + 050', () => {
    const poi: PoiInput = {
      id: 'P6', name: '某餐厅', typecode: '050100',
      location: '116.330500,40.005000',  // ~600m
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('rejects POI with non-050 typecode and no uni name match', () => {
    const poi: PoiInput = {
      id: 'P7', name: '清华路便利店', typecode: '060100', // 060 = mall, not 050
      location: '116.327000,40.004000',
    };
    const out = scorer.score([poi], [campus], '清华大学');
    expect(out[0]).toMatchObject({ accept: false });
  });

  it('assigns POI to nearest campus when uni has multiple campuses', () => {
    const campuses: CampusInput[] = [
      { id: 1, latitude: 40.003213, longitude: 116.326936 }, // 清华本部
      { id: 2, latitude: 39.999000, longitude: 116.327000 }, // 假想南区分校 ~470m
    ];
    const poi: PoiInput = {
      id: 'P8', name: '清华大学南区食堂', typecode: '050100',
      location: '116.327200,39.999100',  // 离 campus 2 更近
    };
    const out = scorer.score([poi], campuses, '清华大学');
    expect(out[0]).toMatchObject({ campusId: 2, accept: true, confidence: 'high' });
  });

  it('returns distanceMeters as integer (Haversine)', () => {
    const poi: PoiInput = {
      id: 'P9', name: '清华大学测试', typecode: '050100',
      location: '116.336326,40.003213',  // ~800m east
    };
    const out = scorer.score([poi], [campus], '清华大学');
    // We expect approx 799-801m here; exact value depends on Haversine implementation
    expect(out[0].distanceMeters).toBeGreaterThanOrEqual(795);
    expect(out[0].distanceMeters).toBeLessThanOrEqual(805);
    expect(Number.isInteger(out[0].distanceMeters)).toBe(true);
  });

  it('returns empty array for empty POI input', () => {
    expect(scorer.score([], [campus], '清华大学')).toEqual([]);
  });
});
