import { GeoSource } from '../geo.config';

export interface GeoResult {
  address: string;
  province: string;
  city: string;
  district: string | null;
  latitude: number;
  longitude: number;
  source: GeoSource;
  formattedAddress: string;
  rawLevel?: string;        // AMap "level" field (e.g. "兴趣点","门牌号")
}

export interface PoiResult {
  amapId: string;
  name: string;
  category: 'subway' | 'mall' | 'airport';
  typecode: string;
  latitude: number;
  longitude: number;
  address: string | null;
  distance: number;          // meters
  metadata: Record<string, unknown> | null;
}
