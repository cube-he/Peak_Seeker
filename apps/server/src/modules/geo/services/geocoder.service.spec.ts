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

  // Regression test for the AMap quirk discovered by smoke test 2026-05-05:
  // missing string fields come back as `[]` (empty array) instead of null/omitted.
  // Without defensive coercion, our parser would store `[]` into a string field.
  it('coerces empty-array AMap fields (pname/cityname/adname/address) to strings', async () => {
    const amap = fakeAmap({
      geocode: jest.fn().mockResolvedValue(null),
      searchPlaceText: jest.fn().mockResolvedValue([{
        id: 'X', name: '某 POI',
        type: 'X', typecode: '141201',
        location: '120.00,30.00',
        address: [],   // AMap returns [] when no address
        pname: [],
        cityname: [],
        adname: [],
      }]),
    });
    const svc = new GeocoderService(amap);
    const result = await svc.geocodeCampus('某大学', '某校区', { city: '杭州' });
    expect(result).not.toBeNull();
    expect(result?.address).toBe('某 POI');         // address coerced + falls back to name
    expect(result?.province).toBe('');
    expect(result?.city).toBe('');
    expect(result?.district).toBeNull();
    expect(typeof result?.province).toBe('string'); // explicit anti-array assertion
    expect(typeof result?.city).toBe('string');
  });
});

describe('GeocoderService.geocodeUniversity', () => {
  it('uses /geocode/geo when address is provided and AMap returns a result', async () => {
    const geocode = jest.fn().mockResolvedValue({
      formatted_address: '四川省成都市金牛区西南交通大学',
      province: '四川省', city: '成都市', district: '金牛区',
      location: '104.053,30.698', level: '兴趣点',
    });
    const searchPlaceText = jest.fn();
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('西南交通大学', {
      city: '成都', address: '四川省成都市金牛区二环路北一段111号',
    });

    expect(geocode).toHaveBeenCalledWith(
      '四川省成都市金牛区二环路北一段111号',
      { city: '成都' },
    );
    expect(searchPlaceText).not.toHaveBeenCalled();
    expect(result?.source).toBe('amap_geocode');
    expect(result?.longitude).toBe(104.053);
  });

  it('falls back to /place/text when address is provided but geocode returns null', async () => {
    const amap = fakeAmap({
      geocode: jest.fn().mockResolvedValue(null),
      searchPlaceText: jest.fn().mockResolvedValue([{
        id: 'X', name: '西南交通大学九里校区',
        type: '科教文化服务;学校;高等院校', typecode: '141201',
        location: '104.053,30.698',
        address: '二环路北一段111号',
        pname: '四川省', cityname: '成都市', adname: '金牛区',
      }]),
    });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('西南交通大学', {
      city: '成都', address: 'garbage-address',
    });

    expect(amap.searchPlaceText).toHaveBeenCalledWith(
      '西南交通大学',
      { city: '成都', types: '141201' },
    );
    expect(result?.source).toBe('amap_poi');
    expect(result?.city).toBe('成都市');
  });

  it('skips geocode and goes straight to /place/text when address is undefined', async () => {
    const geocode = jest.fn();
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '西南交通大学',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.053,30.698',
      address: [], pname: '四川省', cityname: '成都市', adname: '金牛区',
    }]);
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('西南交通大学', { city: '成都' });

    expect(geocode).not.toHaveBeenCalled();
    expect(searchPlaceText).toHaveBeenCalledWith(
      '西南交通大学',
      { city: '成都', types: '141201' },
    );
    expect(result?.source).toBe('amap_poi');
  });

  it('skips geocode when address is whitespace only', async () => {
    const geocode = jest.fn();
    const searchPlaceText = jest.fn().mockResolvedValue([]);
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    await svc.geocodeUniversity('某大学', { city: '北京', address: '   ' });

    expect(geocode).not.toHaveBeenCalled();
    expect(searchPlaceText).toHaveBeenCalledWith(
      '某大学',
      { city: '北京', types: '141201' },
    );
  });

  it('returns null when both paths yield no result', async () => {
    const amap = fakeAmap({
      geocode: jest.fn().mockResolvedValue(null),
      searchPlaceText: jest.fn().mockResolvedValue([]),
    });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeUniversity('某大学', { city: '北京' });

    expect(result).toBeNull();
  });
});
