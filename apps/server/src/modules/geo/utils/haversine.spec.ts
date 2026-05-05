import { haversineKm, haversineMeters } from './haversine';

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(40, 116, 40, 116)).toBeCloseTo(0, 6);
  });

  it('matches known distance Beijing → Shanghai (~1067 km)', () => {
    const km = haversineKm(39.9042, 116.4074, 31.2304, 121.4737);
    expect(km).toBeGreaterThan(1050);
    expect(km).toBeLessThan(1090);
  });

  it('haversineMeters matches haversineKm * 1000', () => {
    const a = haversineKm(40, 116, 41, 117);
    const b = haversineMeters(40, 116, 41, 117);
    expect(b).toBeCloseTo(a * 1000, 0);
  });
});
