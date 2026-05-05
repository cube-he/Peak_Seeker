import { Injectable } from '@nestjs/common';
import { AmapClient } from '../amap/amap.client';
import {
  RetryContext, RetryStrategy, RetryStrategyResult,
} from './retry-strategy.interface';
import { GeoResult } from '../dto/geo-result.dto';

const HIGHER_EDU_TYPECODE = '141201';

// AMap returns `[]` (empty array) for any missing string field instead of
// null/omitted. Coerce defensively before assigning to GeoResult string fields.
function s(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').join('');
  return '';
}

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
    const addr = s(p.address) || p.name;
    const district = s(p.adname);
    const fix: GeoResult = {
      address: addr,
      province: s(p.pname),
      city: s(p.cityname),
      district: district || null,
      latitude: lat, longitude: lng,
      source: 'amap_poi',
      formattedAddress: addr,
    };
    return { success: true, fix };
  }
}
