import { Injectable } from '@nestjs/common';
import { AmapClient } from '../amap/amap.client';
import { GeoResult } from '../dto/geo-result.dto';
import { AmapGeocode, AmapPoi } from '../amap/amap.types';
import { haversineMeters } from '../utils/haversine';

/**
 * Branch campuses < this distance from main are treated as polluted (AMap fell back to main).
 * Tune via spot-check on multi-campus universities; lower if false negatives, raise if false positives.
 */
const CAMPUS_POLLUTION_THRESHOLD_METERS = 300;

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

  /**
   * 查"分校区"坐标。
   * 返回 null 仅表示"高德没找到 / 坐标无效 / mainCoords 损坏"。
   *
   * isMainAlias 字段含义(2026-06-01 fix):
   *   true  → 高德返回的坐标距 main < 300m,说明这个 candidate 其实就是主校区。
   *           调用方应跳过该候选,而不是把它写成 invalid 副校区。
   *   false → 真分校区,坐标可信。
   *
   * 历史:之前的版本在 < 300m 时直接返回 null。但 backfill 把 null 当成"采集失败"
   * 然后标 invalid + 清坐标。对西南交大这种"本部=犀浦校区"的学校是误伤——主校区
   * 数据反而被脏化。改成显式返回 isMainAlias 让上层据此决定行为。
   */
  async geocodeCampus(
    universityName: string,
    campusName: string,
    mainCoords: { latitude: number; longitude: number },
  ): Promise<{ result: GeoResult; isMainAlias: boolean } | null> {
    if (!Number.isFinite(mainCoords.latitude) || !Number.isFinite(mainCoords.longitude)) {
      return null;
    }
    const query = `${universityName}${campusName}`;
    const pois = await this.amap.searchPlaceText(query, { types: '141201' });
    if (pois.length === 0) return null;
    const result = this.fromPoi(pois[0]);
    if (!result) return null;
    const distMeters = haversineMeters(
      mainCoords.latitude, mainCoords.longitude,
      result.latitude, result.longitude,
    );
    return { result, isMainAlias: distMeters < CAMPUS_POLLUTION_THRESHOLD_METERS };
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
