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
