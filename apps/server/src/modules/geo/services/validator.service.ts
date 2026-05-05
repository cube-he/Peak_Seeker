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
  private async checkDuplicateCoord(_uni: UniversityLike): Promise<GeoIssueDetail[]> {
    return [];
  }
  private checkCampusDistance(_uni: UniversityLike): GeoIssueDetail[] {
    return [];
  }
}
