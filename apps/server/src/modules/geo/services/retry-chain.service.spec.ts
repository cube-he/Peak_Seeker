import { RetryChain } from './retry-chain.service';
import { RetryContext } from '../strategies/retry-strategy.interface';
import { GeoResult } from '../dto/geo-result.dto';

const okGeo: GeoResult = {
  address: 'X', province: '北京市', city: '北京市', district: '海淀区',
  latitude: 40, longitude: 116, source: 'amap_geocode', formattedAddress: 'X',
};

const stub = (name: string, success: boolean): any => ({
  name,
  execute: jest.fn().mockResolvedValue(success ? { success, fix: okGeo } : { success: false }),
});

describe('RetryChain', () => {
  it('returns success after first strategy succeeds', async () => {
    const a = stub('a', false);
    const b = stub('b', true);
    const c = stub('c', true);
    const chain = new RetryChain({
      missing: [a, b, c],
    } as any);
    const r = await chain.retry({
      issueType: 'missing',
      retryCount: 0,
      ctx: {} as RetryContext,
    });
    expect(r.success).toBe(true);
    expect(r.by).toBe('b');
    expect(c.execute).not.toHaveBeenCalled();
  });

  it('stops after max retries when all strategies fail', async () => {
    const a = stub('a', false);
    const b = stub('b', false);
    const chain = new RetryChain({ missing: [a, b] } as any);
    const r = await chain.retry({
      issueType: 'missing', retryCount: 0, ctx: {} as RetryContext,
    });
    expect(r.success).toBe(false);
    expect(r.reason).toBe('all_strategies_failed');
  });

  it('rejects further retries when retryCount >= MAX_ATTEMPTS', async () => {
    const a = stub('a', true);
    const chain = new RetryChain({ missing: [a] } as any);
    const r = await chain.retry({
      issueType: 'missing', retryCount: 3, ctx: {} as RetryContext,
    });
    expect(r.success).toBe(false);
    expect(r.reason).toBe('max_retries');
    expect(a.execute).not.toHaveBeenCalled();
  });

  it('routes by issueType — duplicate_coord has empty strategy list', async () => {
    const chain = new RetryChain({ duplicate_coord: [] } as any);
    const r = await chain.retry({
      issueType: 'duplicate_coord', retryCount: 0, ctx: {} as RetryContext,
    });
    expect(r.success).toBe(false);
    expect(r.reason).toBe('manual_required');
  });
});
