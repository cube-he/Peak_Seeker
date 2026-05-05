import { GeocoderService } from './geocoder.service';
import { AmapClient } from '../amap/amap.client';

function fakeAmap(overrides: Partial<AmapClient> = {}): AmapClient {
  return {
    geocode: jest.fn(),
    searchPlaceText: jest.fn(),
    ...overrides,
  } as unknown as AmapClient;
}

describe('GeocoderService.geocode', () => {
  it('parses lng/lat and normalises empty city/district arrays', async () => {
    const amap = fakeAmap({
      geocode: jest.fn().mockResolvedValue({
        formatted_address: '北京市海淀区清华大学',
        province: '北京市',
        city: [],          // AMap may return empty array
        district: '海淀区',
        location: '116.331398,40.000953',
        level: '兴趣点',
      }),
    });
    const svc = new GeocoderService(amap);
    const result = await svc.geocode('清华大学');
    expect(result).toEqual({
      address: '清华大学',
      province: '北京市',
      city: '',
      district: '海淀区',
      latitude: 40.000953,
      longitude: 116.331398,
      source: 'amap_geocode',
      formattedAddress: '北京市海淀区清华大学',
      rawLevel: '兴趣点',
    });
  });

  it('returns null when amap returns null', async () => {
    const amap = fakeAmap({ geocode: jest.fn().mockResolvedValue(null) });
    const svc = new GeocoderService(amap);
    expect(await svc.geocode('does not exist')).toBeNull();
  });
});

describe('GeocoderService.geocodeCampus', () => {
  it('queries with hint city and returns parsed result', async () => {
    const geocode = jest.fn().mockResolvedValue({
      formatted_address: '广东省深圳市南山区哈尔滨工业大学(深圳)',
      province: '广东省', city: '深圳市', district: '南山区',
      location: '113.97,22.59', level: '兴趣点',
    });
    const amap = fakeAmap({ geocode });
    const svc = new GeocoderService(amap);
    const result = await svc.geocodeCampus('哈尔滨工业大学', '深圳校区', { city: '深圳' });
    expect(geocode).toHaveBeenCalledWith('哈尔滨工业大学(深圳校区)', { city: '深圳' });
    expect(result?.city).toBe('深圳市');
    expect(result?.longitude).toBe(113.97);
  });

  it('falls back to PlaceSearch when geocode returns null', async () => {
    const amap = fakeAmap({
      geocode: jest.fn().mockResolvedValue(null),
      searchPlaceText: jest.fn().mockResolvedValue([{
        id: 'X', name: '哈工大威海',
        type: '科教文化服务;学校;高等院校', typecode: '141201',
        location: '122.12,37.53', address: '威海市环翠区文化西路 2 号',
        pname: '山东省', cityname: '威海市', adname: '环翠区',
      }]),
    });
    const svc = new GeocoderService(amap);
    const result = await svc.geocodeCampus('哈尔滨工业大学', '威海校区', { city: '威海' });
    expect(result?.source).toBe('amap_poi');
    expect(result?.city).toBe('威海市');
  });
});
