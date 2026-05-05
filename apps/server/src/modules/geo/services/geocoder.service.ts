import { Injectable } from '@nestjs/common';
import { AmapClient } from '../amap/amap.client';
import { GeoResult } from '../dto/geo-result.dto';
import { AmapGeocode, AmapPoi } from '../amap/amap.types';

function arrToStr(v: string | string[]): string {
  return Array.isArray(v) ? v.join('') : (v ?? '');
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
    return {
      address: arrToStr(p.address) || p.name,
      province: p.pname ?? '',
      city: p.cityname ?? '',
      district: p.adname ?? null,
      latitude: loc.lat,
      longitude: loc.lng,
      source: 'amap_poi',
      formattedAddress: arrToStr(p.address) || p.name,
    };
  }
}
