import { Injectable } from '@nestjs/common';
import { AmapClient } from '../amap/amap.client';
import {
  RetryContext, RetryStrategy, RetryStrategyResult,
} from './retry-strategy.interface';
import { GeoResult } from '../dto/geo-result.dto';

const HIGHER_EDU_TYPECODE = '141201';

@Injectable()
export class GeocodeAsPoiStrategy implements RetryStrategy {
  readonly name = 'geocode-as-poi';
  constructor(private readonly amap: AmapClient) {}

  async execute(ctx: RetryContext): Promise<RetryStrategyResult> {
    const query = `${ctx.universityName}${ctx.campusName ?? ''}`;
    const pois = await this.amap.searchPlaceText(query, {
      city: ctx.city,
      types: HIGHER_EDU_TYPECODE,
    });
    if (pois.length === 0) return { success: false, reason: 'no poi' };
    const p = pois[0];
    const [lng, lat] = p.location.split(',').map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return { success: false, reason: 'invalid coords' };
    }
    const fix: GeoResult = {
      address: typeof p.address === 'string' ? p.address : (p.address ?? []).join('') || p.name,
      province: p.pname ?? '',
      city: p.cityname ?? '',
      district: p.adname ?? null,
      latitude: lat, longitude: lng,
      source: 'amap_poi',
      formattedAddress: typeof p.address === 'string' ? p.address : p.name,
    };
    return { success: true, fix };
  }
}
