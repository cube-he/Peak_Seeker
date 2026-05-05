import { ReGeocodeCampusStrategy } from './re-geocode-campus.strategy';

describe('ReGeocodeCampusStrategy', () => {
  it('re-queries with branch-campus emphasis', async () => {
    const geocoder = {
      geocodeCampus: jest.fn().mockResolvedValue({
        address: 'X', province: '广东省', city: '深圳市', district: '南山区',
        latitude: 22.59, longitude: 113.97, source: 'amap_geocode', formattedAddress: 'X',
      }),
    };
    const s = new ReGeocodeCampusStrategy(geocoder as any);
    const r = await s.execute({
      universityName: '哈尔滨工业大学',
      campusName: '深圳校区', city: '深圳',
    });
    expect(geocoder.geocodeCampus).toHaveBeenCalledWith(
      '哈尔滨工业大学', '深圳校区', { city: '深圳', province: undefined },
    );
    expect(r.success).toBe(true);
  });

  it('returns failure without campus name', async () => {
    const geocoder = { geocodeCampus: jest.fn() };
    const s = new ReGeocodeCampusStrategy(geocoder as any);
    const r = await s.execute({ universityName: 'X' });
    expect(r.success).toBe(false);
    expect(geocoder.geocodeCampus).not.toHaveBeenCalled();
  });
});
