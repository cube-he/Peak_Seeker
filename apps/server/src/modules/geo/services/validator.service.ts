import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AmapClient } from '../amap/amap.client';
import { GEO_CONFIG } from '../geo.config';
import { GeoIssueDetail, ValidationReport } from '../dto/validation-report.dto';
import { haversineKm, haversineMeters } from '../utils/haversine';

interface CampusLike {
  id?: number;
  name?: string;
  city?: string | null;
  province?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isMain?: boolean;
}

interface UniversityLike {
  id: number;
  name: string;
  province?: string | null;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  campuses?: CampusLike[];
}

@Injectable()
export class GeoValidator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly amap: AmapClient,
  ) {}

  async validate(uni: UniversityLike): Promise<ValidationReport> {
    const issues: GeoIssueDetail[] = [];
    issues.push(...this.checkMissing(uni));
    issues.push(...this.checkInChina(uni));
    issues.push(...(await this.checkProvinceMatch(uni)));
    issues.push(...(await this.checkDuplicateCoord(uni)));
    issues.push(...this.checkCampusDistance(uni));
    return { pass: issues.length === 0, issues };
  }

  private checkMissing(uni: UniversityLike): GeoIssueDetail[] {
    const issues: GeoIssueDetail[] = [];
    if (!uni.address || uni.latitude == null || uni.longitude == null) {
      issues.push({ issueType: 'missing' });
    }
    for (const c of uni.campuses ?? []) {
      if (!c.latitude || !c.longitude) {
        issues.push({ issueType: 'missing', campusId: c.id, detail: { campusName: c.name } });
      }
    }
    return issues;
  }

  private checkInChina(uni: UniversityLike): GeoIssueDetail[] {
    const issues: GeoIssueDetail[] = [];
    const inBox = (lng: number, lat: number) =>
      lng >= GEO_CONFIG.CHINA_LNG_MIN && lng <= GEO_CONFIG.CHINA_LNG_MAX &&
      lat >= GEO_CONFIG.CHINA_LAT_MIN && lat <= GEO_CONFIG.CHINA_LAT_MAX;
    if (uni.latitude != null && uni.longitude != null && !inBox(uni.longitude, uni.latitude)) {
      issues.push({ issueType: 'out_of_china', detail: { lng: uni.longitude, lat: uni.latitude } });
    }
    for (const c of uni.campuses ?? []) {
      if (c.latitude && c.longitude && !inBox(c.longitude, c.latitude)) {
        issues.push({
          issueType: 'out_of_china', campusId: c.id,
          detail: { lng: c.longitude, lat: c.latitude },
        });
      }
    }
    return issues;
  }

  // Placeholders — fully implemented in Tasks 9-10.
  private async checkProvinceMatch(uni: UniversityLike): Promise<GeoIssueDetail[]> {
    const issues: GeoIssueDetail[] = [];
    if (uni.latitude != null && uni.longitude != null && uni.province) {
      const r = await this.amap.regeocode(uni.longitude, uni.latitude);
      const prov = Array.isArray(r?.addressComponent.province)
        ? r?.addressComponent.province.join('')
        : r?.addressComponent.province ?? '';
      if (prov && !this.provinceMatches(prov, uni.province)) {
        issues.push({
          issueType: 'province_mismatch',
          detail: { expected: uni.province, got: prov },
        });
      }
    }
    return issues;
  }

  private provinceMatches(a: string, b: string): boolean {
    const norm = (s: string) =>
      s.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔|藏族|蒙古/g, '').trim();
    return norm(a) === norm(b);
  }
  private async checkDuplicateCoord(uni: UniversityLike): Promise<GeoIssueDetail[]> {
    if (uni.latitude == null || uni.longitude == null) return [];
    // Coarse range filter via SQL bbox (~150m at most), then exact haversine in JS.
    const tolDeg = 0.0015; // ~167m at the equator; safe upper bound
    const candidates = await this.prisma.university.findMany({
      where: {
        id: { not: uni.id },
        latitude: { gte: uni.latitude - tolDeg, lte: uni.latitude + tolDeg },
        longitude: { gte: uni.longitude - tolDeg, lte: uni.longitude + tolDeg },
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    const issues: GeoIssueDetail[] = [];
    for (const c of candidates) {
      // Double-check self-exclusion in JS — guards against mock/edge cases where DB filter is bypassed.
      if (c.id === uni.id) continue;
      if (c.latitude == null || c.longitude == null) continue;
      const m = haversineMeters(
        uni.latitude!, uni.longitude!,
        Number(c.latitude), Number(c.longitude),
      );
      if (m < GEO_CONFIG.DUPLICATE_COORD_METERS) {
        issues.push({
          issueType: 'duplicate_coord',
          detail: { otherUniversityId: c.id, otherName: c.name, distanceMeters: Math.round(m) },
        });
      }
    }
    return issues;
  }

  private checkCampusDistance(uni: UniversityLike): GeoIssueDetail[] {
    const campuses = uni.campuses ?? [];
    const main = campuses.find((c) => c.isMain) ?? campuses[0];
    if (!main || main.latitude == null || main.longitude == null) return [];
    const issues: GeoIssueDetail[] = [];
    for (const c of campuses) {
      if (c === main || c.latitude == null || c.longitude == null) continue;
      if (!c.city || !main.city) continue;
      if (c.city !== main.city) continue;             // 跨市距离远是正常的
      const km = haversineKm(
        Number(main.latitude), Number(main.longitude),
        Number(c.latitude), Number(c.longitude),
      );
      if (km > GEO_CONFIG.CAMPUS_DISTANCE_ANOMALY_KM) {
        issues.push({
          issueType: 'campus_distance_anomaly',
          campusId: c.id,
          detail: {
            mainCampusId: main.id, anomalyCampusId: c.id, distanceKm: Math.round(km),
          },
        });
      }
    }
    return issues;
  }
}
