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
  const mainCoords = { latitude: 30.819352, longitude: 104.182965 };

  it('returns POI result when campus is far from main', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '西南石油大学南充校区',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '106.110000,31.750000',
      address: '南充市顺庆区',
      pname: '四川省', cityname: '南充市', adname: '顺庆区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '南充', mainCoords);

    expect(searchPlaceText).toHaveBeenCalledWith(
      '西南石油大学南充',
      { types: '141201' },
    );
    expect(result?.source).toBe('amap_poi');
    expect(result?.city).toBe('南充市');
    expect(result?.latitude).toBeCloseTo(31.75, 2);
  });

  it('returns null when result coords coincide with main coords (pollution)', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '西南石油大学',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.182965,30.819352',
      address: '成都市', pname: '四川省', cityname: '成都市', adname: '新都区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '南充', mainCoords);

    expect(result).toBeNull();
  });

  it('returns null when result is within 300m of main (just inside threshold)', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '某分校',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.185565,30.819352',
      address: 'X', pname: '四川省', cityname: '成都市', adname: '新都区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '某', mainCoords);

    expect(result).toBeNull();
  });

  it('returns POI result when result is just outside 300m threshold', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'X', name: '某分校',
      type: '科教文化服务;学校;高等院校', typecode: '141201',
      location: '104.186765,30.819352',
      address: 'X', pname: '四川省', cityname: '成都市', adname: '新都区',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '某', mainCoords);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('amap_poi');
  });

  it('returns null when searchPlaceText returns empty array', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([]);
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('西南石油大学', '南充', mainCoords);

    expect(result).toBeNull();
  });

  it('does not call amap.geocode (only PlaceSearch path remains)', async () => {
    const geocode = jest.fn();
    const searchPlaceText = jest.fn().mockResolvedValue([]);
    const amap = fakeAmap({ geocode, searchPlaceText });
    const svc = new GeocoderService(amap);

    await svc.geocodeCampus('某大学', '某', mainCoords);

    expect(geocode).not.toHaveBeenCalled();
    expect(searchPlaceText).toHaveBeenCalledTimes(1);
  });

  it('returns null without calling AMap when mainCoords contains NaN', async () => {
    const searchPlaceText = jest.fn();
    const amap = fakeAmap({ searchPlaceText });
    const svc = new GeocoderService(amap);

    const result = await svc.geocodeCampus('某大学', '某', { latitude: NaN, longitude: 100 });

    expect(result).toBeNull();
    expect(searchPlaceText).not.toHaveBeenCalled();
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
