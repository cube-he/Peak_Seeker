import { ConfigService } from '@nestjs/config';
import { AmapClient } from './amap.client';
import { AmapApiError } from './amap.types';

function makeClient(envOverrides: Record<string, string> = {}): AmapClient {
  const env: Record<string, string> = {
    AMAP_SERVICE_KEY: 'test-key',
    AMAP_RATE_LIMIT_QPS: '100',          // unblock tests
    ...envOverrides,
  };
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new AmapClient(config);
}

function mockFetch(json: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as Response);
  (global as unknown as { fetch: jest.Mock }).fetch = fn;
  return fn;
}

describe('AmapClient.geocode', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns parsed coordinates for a successful response', async () => {
    const fetchMock = mockFetch({
      status: '1',
      info: 'OK',
      count: '1',
      geocodes: [
        {
          formatted_address: '北京市海淀区清华大学',
          province: '北京市',
          city: '北京市',
          district: '海淀区',
          location: '116.331398,40.000953',
          level: '兴趣点',
        },
      ],
    });

    const client = makeClient();
    const result = await client.geocode('清华大学', { city: '北京' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('https://restapi.amap.com/v3/geocode/geo');
    expect(url).toContain('address=' + encodeURIComponent('清华大学'));
    expect(url).toContain('city=' + encodeURIComponent('北京'));
    expect(url).toContain('key=test-key');

    expect(result).toEqual({
      formatted_address: '北京市海淀区清华大学',
      province: '北京市',
      city: '北京市',
      district: '海淀区',
      location: '116.331398,40.000953',
      level: '兴趣点',
    });
  });

  it('returns null when AMap reports zero results', async () => {
    mockFetch({ status: '1', info: 'OK', count: '0', geocodes: [] });
    const client = makeClient();
    expect(await client.geocode('不存在的地址')).toBeNull();
  });

  it('throws AmapApiError when status is "0"', async () => {
    mockFetch({ status: '0', info: 'INVALID_USER_KEY' });
    const client = makeClient();
    await expect(client.geocode('清华大学')).rejects.toThrow(AmapApiError);
  });
});

describe('AmapClient.regeocode', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns parsed regeocode result', async () => {
    const fetchMock = mockFetch({
      status: '1',
      info: 'OK',
      regeocode: {
        formatted_address: '北京市海淀区清华大学',
        addressComponent: { province: '北京市', city: '北京市', district: '海淀区' },
      },
    });

    const client = makeClient();
    const result = await client.regeocode(116.331, 40.0);

    expect((fetchMock.mock.calls[0][0] as string)).toContain('/geocode/regeo');
    expect((fetchMock.mock.calls[0][0] as string)).toContain('location=116.331%2C40');
    expect(result?.addressComponent.province).toBe('北京市');
  });

  it('returns null when regeocode is missing', async () => {
    mockFetch({ status: '1', info: 'OK' });
    const client = makeClient();
    expect(await client.regeocode(0, 0)).toBeNull();
  });
});

describe('AmapClient.searchPlaceText', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns POI list for matching keyword', async () => {
    mockFetch({
      status: '1', info: 'OK', count: '1',
      pois: [{
        id: 'B0FFLAJV01', name: '哈尔滨工业大学(深圳)',
        type: '科教文化服务;学校;高等院校',
        typecode: '141201', location: '113.97,22.59',
        address: '深圳市南山区桃源街道', pname: '广东省', cityname: '深圳市', adname: '南山区',
      }],
    });
    const client = makeClient();
    const result = await client.searchPlaceText('哈工大深圳', { city: '深圳' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('B0FFLAJV01');
  });

  it('returns empty array when no pois', async () => {
    mockFetch({ status: '1', info: 'OK', count: '0' });
    const client = makeClient();
    expect(await client.searchPlaceText('不存在')).toEqual([]);
  });
});
