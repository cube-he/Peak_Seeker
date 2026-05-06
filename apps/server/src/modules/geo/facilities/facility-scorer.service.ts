import { Injectable } from '@nestjs/common';

export interface ScorerCampus {
  id: number;
  latitude: number;
  longitude: number;
}

export interface ScorerPoi {
  id: string;
  name: string;
  typecode: string;
  location: string;
  address?: string;
}

export interface ScoredFacility {
  amapId: string;
  name: string;
  typecode: string;
  latitude: number;
  longitude: number;
  address?: string;
  campusId: number;
  distanceMeters: number;
  accept: boolean;
  confidence: 'high' | 'medium' | 'low' | null;
  matchMethod: 'name_prefix' | 'name_contains' | 'typecode_radius' | null;
}

const REJECT_DISTANCE_M = 800;
const TYPECODE_RADIUS_DISTANCE_M = 500;
const CAFETERIA_KEYWORDS = ['食堂', '餐厅', '园', '苑'];

function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371000; // earth radius (m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class FacilityScorer {
  score(
    pois: ScorerPoi[],
    campuses: ScorerCampus[],
    uniName: string,
  ): ScoredFacility[] {
    return pois.map((poi) => this.scoreOne(poi, campuses, uniName));
  }

  private scoreOne(
    poi: ScorerPoi,
    campuses: ScorerCampus[],
    uniName: string,
  ): ScoredFacility {
    const [lng, lat] = poi.location.split(',').map(Number);

    // Find nearest campus
    let nearest = campuses[0];
    let nearestDist = haversineMeters(lat, lng, nearest.latitude, nearest.longitude);
    for (const c of campuses.slice(1)) {
      const d = haversineMeters(lat, lng, c.latitude, c.longitude);
      if (d < nearestDist) { nearest = c; nearestDist = d; }
    }
    const distanceMeters = Math.round(nearestDist);

    const base = {
      amapId: poi.id, name: poi.name, typecode: poi.typecode,
      latitude: lat, longitude: lng, address: poi.address,
      campusId: nearest.id, distanceMeters,
    };

    if (distanceMeters >= REJECT_DISTANCE_M) {
      return { ...base, accept: false, confidence: null, matchMethod: null };
    }

    if (poi.name.startsWith(uniName)) {
      return { ...base, accept: true, confidence: 'high', matchMethod: 'name_prefix' };
    }

    if (poi.name.includes(uniName)) {
      return { ...base, accept: true, confidence: 'medium', matchMethod: 'name_contains' };
    }

    const hasKeyword = CAFETERIA_KEYWORDS.some((k) => poi.name.includes(k));
    const isCateringTypecode = poi.typecode.startsWith('050');
    if (hasKeyword && isCateringTypecode && distanceMeters <= TYPECODE_RADIUS_DISTANCE_M) {
      return { ...base, accept: true, confidence: 'low', matchMethod: 'typecode_radius' };
    }

    return { ...base, accept: false, confidence: null, matchMethod: null };
  }
}
