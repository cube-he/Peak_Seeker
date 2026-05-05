import { GeocodeWithProvinceCityStrategy } from './geocode-with-province-city.strategy';

describe('GeocodeWithProvinceCityStrategy', () => {
  it('prefixes province/city to the query', async () => {
    const geocoder = {
      geocode: jest.fn().mockResolvedValue({
        address: '四川 成都 西南交通大学', province: '四川省', city: '成都市',
        district: '金牛区', latitude: 30.7, longitude: 104.1,
        source: 'amap_geocode', formattedAddress: '四川省成都市西南交通大学',
      }),
    };
    const s = new GeocodeWithProvinceCityStrategy(geocoder as any);
    const r = await s.execute({
      universityName: '西南交通大学', province: '四川', city: '成都',
    });
    expect(geocoder.geocode).toHaveBeenCalledWith('四川 成都 西南交通大学', { city: '成都' });
    expect(r.success).toBe(true);
  });

  it('returns failure when no province or city hint', async () => {
    const geocoder = { geocode: jest.fn() };
    const s = new GeocodeWithProvinceCityStrategy(geocoder as any);
    const r = await s.execute({ universityName: '某大学' });
    expect(r.success).toBe(false);
    expect(geocoder.geocode).not.toHaveBeenCalled();
  });
});
