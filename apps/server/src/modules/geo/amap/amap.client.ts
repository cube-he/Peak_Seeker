import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/redis/redis.service';
import {
  AmapApiError,
  AmapDistrictResponse,
  AmapGeocode,
  AmapGeocodeResponse,
  AmapPlaceSearchResponse,
  AmapPoi,
  AmapRegeocodeResponse,
  AmapUnavailableError,
} from './amap.types';
import { GEO_CONFIG } from '../geo.config';
import { TokenBucketLimiter } from './rate-limiter';

const AMAP_BASE = 'https://restapi.amap.com/v3';

@Injectable()
export class AmapClient {
  private readonly logger = new Logger(AmapClient.name);
  private readonly key: string;
  private readonly limiter: TokenBucketLimiter;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(RedisService) private readonly redis?: RedisService,
  ) {
    const k = this.config.get<string>('AMAP_SERVICE_KEY');
    if (!k) throw new Error('AMAP_SERVICE_KEY is not set');
    this.key = k;
    const qps = Number(this.config.get('AMAP_RATE_LIMIT_QPS') ?? GEO_CONFIG.AMAP_QPS);
    this.limiter = new TokenBucketLimiter(qps, 1000);
  }

  async geocode(
    address: string,
    opts: { city?: string } = {},
  ): Promise<AmapGeocode | null> {
    const params: Record<string, string> = {
      key: this.key,
      address,
      output: 'JSON',
    };
    if (opts.city) params.city = opts.city;
    const json = await this.request<AmapGeocodeResponse>('/geocode/geo', params);
    if (json.status === '0') {
      throw new AmapApiError(`AMap geocode failed: ${json.info}`, json.info);
    }
    if (!json.geocodes || json.geocodes.length === 0) return null;
    return json.geocodes[0];
  }

  async regeocode(
    lng: number,
    lat: number,
  ): Promise<AmapRegeocodeResponse['regeocode'] | null> {
    const json = await this.request<AmapRegeocodeResponse>('/geocode/regeo', {
      key: this.key,
      location: `${lng},${lat}`,
      extensions: 'base',
      output: 'JSON',
    });
    if (json.status === '0') {
      throw new AmapApiError(`AMap regeocode failed: ${json.info}`, json.info);
    }
    return json.regeocode ?? null;
  }

  async searchPlaceText(
    keywords: string,
    opts: { city?: string; types?: string } = {},
  ): Promise<AmapPoi[]> {
    const params: Record<string, string> = {
      key: this.key,
      keywords,
      output: 'JSON',
      offset: '20',
      page: '1',
    };
    if (opts.city) params.city = opts.city;
    if (opts.types) params.types = opts.types;
    const json = await this.request<AmapPlaceSearchResponse>('/place/text', params);
    if (json.status === '0') {
      throw new AmapApiError(`AMap place/text failed: ${json.info}`, json.info);
    }
    return json.pois ?? [];
  }

  async searchPlaceAround(
    lng: number,
    lat: number,
    opts: { types: string; radius: number; offset?: number },
  ): Promise<AmapPoi[]> {
    const json = await this.request<AmapPlaceSearchResponse>('/place/around', {
      key: this.key,
      location: `${lng},${lat}`,
      types: opts.types,
      radius: String(opts.radius),
      offset: String(opts.offset ?? 20),
      page: '1',
      extensions: 'base',
      output: 'JSON',
    });
    if (json.status === '0') {
      throw new AmapApiError(`AMap place/around failed: ${json.info}`, json.info);
    }
    return json.pois ?? [];
  }

  async district(
    keywords: string,
  ): Promise<NonNullable<AmapDistrictResponse['districts']>[0] | null> {
    const json = await this.request<AmapDistrictResponse>('/config/district', {
      key: this.key,
      keywords,
      subdistrict: '0',
      output: 'JSON',
    });
    if (json.status === '0') {
      throw new AmapApiError(`AMap district failed: ${json.info}`, json.info);
    }
    return json.districts && json.districts.length > 0 ? json.districts[0] : null;
  }

  private cacheKey(path: string, params: Record<string, string>): string {
    const safe = { ...params };
    delete safe.key; // never use the API key as cache differentiator
    const qs = new URLSearchParams(safe).toString();
    return `amap:${path}?${qs}`;
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    await this.limiter.acquire();

    const cKey = this.cacheKey(path, params);
    if (this.redis) {
      try {
        const hit = await this.redis.getCache<T>(cKey);
        if (hit) return hit;
      } catch (e) {
        this.logger.warn(`Cache read failed: ${(e as Error).message}`);
      }
    }

    const qs = new URLSearchParams(params).toString();
    const url = `${AMAP_BASE}${path}?${qs}`;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= GEO_CONFIG.AMAP_MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(GEO_CONFIG.AMAP_DEFAULT_TIMEOUT_MS),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`HTTP ${res.status}`);
        } else if (!res.ok) {
          throw new Error(`AMap HTTP ${res.status}`);
        } else {
          const json = (await res.json()) as T;
          // Inspect AMap-level transient errors. Some errors (CUQPS rate limit,
          // internal engine errors) are reported as HTTP 200 with status='0'
          // and a specific info code. Treat them as retryable; let everything
          // else (incl. permanent failures like INVALID_USER_KEY) pass through.
          const j = json as unknown as { status?: string; info?: string };
          if (j && j.status === '0' && j.info && TRANSIENT_AMAP_INFOS.has(j.info)) {
            lastErr = new Error(`AMap transient: ${j.info}`);
          } else {
            if (this.redis) {
              try {
                await this.redis.setCache(cKey, json, GEO_CONFIG.AMAP_CACHE_TTL_SECONDS);
              } catch (e) {
                this.logger.warn(`Cache write failed: ${(e as Error).message}`);
              }
            }
            return json;
          }
        }
      } catch (err) {
        lastErr = err;
      }
      if (attempt < GEO_CONFIG.AMAP_MAX_RETRIES) {
        const delay = GEO_CONFIG.AMAP_RETRY_BASE_DELAY_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new AmapUnavailableError(
      `AMap unreachable after ${GEO_CONFIG.AMAP_MAX_RETRIES + 1} attempts`,
      lastErr,
    );
  }
}

// AMap returns these as `status='0'` with `info=<code>` over HTTP 200.
// They mean "try again later" — retry instead of giving up.
const TRANSIENT_AMAP_INFOS = new Set<string>([
  'CUQPS_HAS_EXCEEDED_THE_LIMIT',     // concurrent QPS limit (per-endpoint)
  'ENGINE_RESPONSE_DATA_ERROR',       // internal engine hiccup
]);
