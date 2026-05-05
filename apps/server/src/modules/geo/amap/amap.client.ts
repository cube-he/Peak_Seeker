import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AmapApiError,
  AmapGeocode,
  AmapGeocodeResponse,
  AmapPoi,
  AmapPlaceSearchResponse,
  AmapRegeocodeResponse,
} from './amap.types';
import { GEO_CONFIG } from '../geo.config';

const AMAP_BASE = 'https://restapi.amap.com/v3';

@Injectable()
export class AmapClient {
  private readonly logger = new Logger(AmapClient.name);
  private readonly key: string;

  constructor(private readonly config: ConfigService) {
    const k = this.config.get<string>('AMAP_SERVICE_KEY');
    if (!k) throw new Error('AMAP_SERVICE_KEY is not set');
    this.key = k;
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

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const url = `${AMAP_BASE}${path}?${qs}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(GEO_CONFIG.AMAP_DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`AMap HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
