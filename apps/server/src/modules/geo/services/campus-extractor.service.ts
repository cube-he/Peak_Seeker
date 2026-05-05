import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AmapClient } from '../amap/amap.client';
import { CampusCandidate } from '../dto/campus-candidate.dto';

// Captures patterns like:
//   [威海]      （深圳）      (深圳)        沙河校区
//   威海校区    深圳分校      Tianjin 校区(rare)
const BRACKET_RE = /[\[【（(]\s*([\u4e00-\u9fa5A-Za-z]{1,8}?)\s*[\]】）)]/g;
const SUFFIX_RE = /([\u4e00-\u9fa5A-Za-z]{1,8}?)(?:校区|分校)/g;

@Injectable()
export class CampusExtractor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly amap: AmapClient,
  ) {}

  async extractFromEnrollmentPlanTags(universityId: number): Promise<CampusCandidate[]> {
    const rows = await this.prisma.enrollmentPlan.findMany({
      where: { universityId },
      select: { majorName: true, planNotes: true },
    });
    const names = new Set<string>();
    for (const r of rows) {
      this.scan(r.majorName ?? '', names);
      this.scan(r.planNotes ?? '', names);
    }
    return Array.from(names).map((name) => ({
      name,
      source: 'enrollment_plan_tag',
    }));
  }

  private scan(text: string, out: Set<string>): void {
    if (!text) return;
    let m: RegExpExecArray | null;
    BRACKET_RE.lastIndex = 0;
    while ((m = BRACKET_RE.exec(text)) !== null) {
      const v = m[1].trim();
      if (this.looksLikeCampusName(v)) out.add(v);
    }
    SUFFIX_RE.lastIndex = 0;
    while ((m = SUFFIX_RE.exec(text)) !== null) {
      const v = m[1].trim();
      if (this.looksLikeCampusName(v)) out.add(v);
    }
  }

  private looksLikeCampusName(v: string): boolean {
    if (!v || v.length < 2 || v.length > 8) return false;
    // exclude common non-campus tokens that show up in brackets
    const blacklist = new Set([
      '本科', '专科', '中外合作', '艺术', '体育', '少民', '提前批',
      '单列', '高收费', '春季', '免费师范', '国家专项', '地方专项',
    ]);
    if (blacklist.has(v)) return false;
    // require at least one CJK char
    if (!/[\u4e00-\u9fa5]/.test(v)) return false;
    return true;
  }
}
