import { GeocodeWithoutBracketStrategy } from './geocode-without-bracket.strategy';

describe('GeocodeWithoutBracketStrategy', () => {
  it('strips brackets and re-geocodes via GeocoderService', async () => {
    const geocoder = {
      geocode: jest.fn().mockResolvedValue({
        address: '哈工大 深圳', province: '广东省', city: '深圳市', district: '南山区',
        latitude: 22.59, longitude: 113.97, source: 'amap_geocode',
        formattedAddress: '广东省深圳市南山区哈工大', rawLevel: '兴趣点',
      }),
    };
    const s = new GeocodeWithoutBracketStrategy(geocoder as any);
    const r = await s.execute({
      universityName: '哈尔滨工业大学',
      campusName: '深圳校区',
      city: '深圳',
      previousAddress: '哈尔滨工业大学(深圳)',
    });
    expect(geocoder.geocode).toHaveBeenCalledWith('哈尔滨工业大学 深圳', { city: '深圳' });
    expect(r.success).toBe(true);
    expect(r.fix?.city).toBe('深圳市');
  });

  it('returns success=false when geocoder returns null', async () => {
    const geocoder = { geocode: jest.fn().mockResolvedValue(null) };
    const s = new GeocodeWithoutBracketStrategy(geocoder as any);
    const r = await s.execute({
      universityName: 'X', campusName: 'Y', previousAddress: 'X(Y)',
    });
    expect(r.success).toBe(false);
  });
});
