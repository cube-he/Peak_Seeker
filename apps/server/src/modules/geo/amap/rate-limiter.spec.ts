import { TokenBucketLimiter } from './rate-limiter';

describe('TokenBucketLimiter', () => {
  jest.useFakeTimers();

  it('lets requests pass immediately while tokens are available', async () => {
    const lim = new TokenBucketLimiter(2, 1000); // 2 tokens / 1000ms

    const t1 = lim.acquire();
    const t2 = lim.acquire();
    await expect(Promise.race([t1, t2])).resolves.toBeUndefined();
    lim.destroy();
  });

  it('queues the third request until the next refill', async () => {
    const lim = new TokenBucketLimiter(2, 1000);
    await lim.acquire();
    await lim.acquire();

    const blocked = lim.acquire();
    let resolved = false;
    blocked.then(() => { resolved = true; });

    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
    lim.destroy();
  });
});
