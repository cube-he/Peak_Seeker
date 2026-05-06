import { Injectable } from '@nestjs/common';
import { AmapClient } from '../amap/amap.client';
import { GeoResult } from '../dto/geo-result.dto';
import { AmapGeocode, AmapPoi } from '../amap/amap.types';

/**
 * AMap returns `[]` (empty array) for any missing string field instead of
 * `null` / omitted. So we accept anything and coerce defensively:
 *   - string  →  string
 *   - []      →  ''
 *   - ['x']   →  'x'
 *   - other   →  ''
 */
function arrToStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string').join('');
  }
  return '';
}

function parseLocation(loc: string): { lng: number; lat: number } | null {
  const [lng, lat] = loc.split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

@Injectable()
export class GeocoderService {
  constructor(private readonly amap: AmapClient) {}

  async geocode(address: string, opts: { city?: string } = {}): Promise<GeoResult | null> {
    const raw = await this.amap.geocode(address, opts);
    return raw ? this.fromGeocode(address, raw) : null;
  }

  async geocodeCampus(
    universityName: string,
    campusName: string,
    hint: { city?: string; province?: string } = {},
  ): Promise<GeoResult | null> {
    const query = `${universityName}(${campusName})`;
    const direct = await this.amap.geocode(query, { city: hint.city });
    if (direct) return this.fromGeocode(query, direct);
    const pois = await this.amap.searchPlaceText(`${universityName}${campusName}`, {
      city: hint.city, types: '141201', // 高等院校
    });
    return pois.length > 0 ? this.fromPoi(pois[0]) : null;
  }

  async geocodeUniversity(
    name: string,
    opts: { city?: string; address?: string } = {},
  ): Promise<GeoResult | null> {
    // 1. If we have a non-empty address, try /geocode/geo first
    if (opts.address && opts.address.trim()) {
      const direct = await this.amap.geocode(opts.address, { city: opts.city });
      if (direct) return this.fromGeocode(opts.address, direct);
    }
    // 2. Fall back to POI text search filtered by 高等院校 typecode
    const pois = await this.amap.searchPlaceText(name, {
      city: opts.city,
      types: '141201',
    });
    return pois.length > 0 ? this.fromPoi(pois[0]) : null;
  }

  private fromGeocode(address: string, g: AmapGeocode): GeoResult | null {
    const loc = parseLocation(g.location);
    if (!loc) return null;
    return {
      address,
      province: arrToStr(g.province),
      city: arrToStr(g.city),
      district: arrToStr(g.district) || null,
      latitude: loc.lat,
      longitude: loc.lng,
      source: 'amap_geocode',
      formattedAddress: g.formatted_address,
      rawLevel: g.level,
    };
  }

  private fromPoi(p: AmapPoi): GeoResult | null {
    const loc = parseLocation(p.location);
    if (!loc) return null;
    const addr = arrToStr(p.address) || p.name;
    return {
      address: addr,
      province: arrToStr(p.pname),
      city: arrToStr(p.cityname),
      district: arrToStr(p.adname) || null,
      latitude: loc.lat,
      longitude: loc.lng,
      source: 'amap_poi',
      formattedAddress: addr,
    };
  }
}
