export type PoiCategory = 'subway' | 'mall' | 'airport';

export interface Campus {
  id: number;
  name: string;
  isMain: boolean;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceToCityCenter: number | null;
  nearestSubwayMeters: number | null;
  nearestAirportKm: number | null;
}

export interface Poi {
  id: number;
  amapId: string;
  name: string;
  category: PoiCategory;
  distance: number;            // meters
  metadata: Record<string, unknown> | null;
}
