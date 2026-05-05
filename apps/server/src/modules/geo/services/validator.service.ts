import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AmapClient } from '../amap/amap.client';
import { GEO_CONFIG } from '../geo.config';
import { GeoIssueDetail, ValidationReport } from '../dto/validation-report.dto';

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
  private async checkProvinceMatch(_uni: UniversityLike): Promise<GeoIssueDetail[]> {
    return [];
  }
  private async checkDuplicateCoord(_uni: UniversityLike): Promise<GeoIssueDetail[]> {
    return [];
  }
  private checkCampusDistance(_uni: UniversityLike): GeoIssueDetail[] {
    return [];
  }
}
