import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AmapClient } from '../amap/amap.client';
import { CampusCandidate } from '../dto/campus-candidate.dto';
import { lookupKnownCampuses } from './known-campuses';

// Captures patterns like:
//   [威海]      （深圳）      (深圳)        沙河校区
//   威海校区    深圳分校      Tianjin 校区(rare)
const BRACKET_RE = /[\[【（(]\s*([一-龥A-Za-z]{1,8}?)\s*[\]】）)]/g;
const SUFFIX_RE = /([一-龥A-Za-z]{1,8}?)(?:校区|分校)/g;

// 2026-06-02 fix:招生备注里"第一学年在江安校区"这种句式,SUFFIX_RE 贪婪抓
// "第一学年在江安" 整串当校区名。下面的 cleanCampusName 剥离两类前缀:
//   1) "X学年/年级 起/在/开始" 修饰词("第一学年在"、"二年级开始在"、"新生第一年在"等)
//   2) 学校名自身("中国药科大学江宁" 抓到完整学校名+地名,要剥成"江宁")
// "学年/年级/年" 必须出现(否则整个修饰词就不算修饰词);数字部分可选(应付"低年级在"这种)。
const LEADING_MODIFIER_RE =
  /^(?:新生|低|高)?(?:第?[一二三四五六七八九十0-9]+[、,，至到]?)*(?:学年|年级|年)(?:起|开始|在)?/;
const LONE_PREP_RE = /^(?:在|起|开始)/;

function cleanCampusName(raw: string): string {
  let s = raw;
  // 1) 剥学校自身名:"中国药科大学江宁" → "江宁";"山东大学威海" → "威海"
  const lastSchool = Math.max(
    s.lastIndexOf('大学'),
    s.lastIndexOf('学院'),
    s.lastIndexOf('学校'),
  );
  if (lastSchool >= 0) s = s.slice(lastSchool + 2);
  // 2) 反复剥前置修饰词(应付"一、二年级在"这种多段)
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(LEADING_MODIFIER_RE, '');
  }
  s = s.replace(LONE_PREP_RE, '');
  return s;
}

// patterns matching "位于X、Y和Z" / "分布在X、Y" within a phrase
const LOCATIONS_RE = /(?:位于|分布在)[\s\S]{0,40}?([一-龥、\s和与及]{2,40})/g;
const SPLIT_RE = /[、和与及，,]/;
const CITY_NAMES = new Set<string>([
  // a tiny dictionary of well-known prefecture-level cities used as campus markers.
  // The list is non-exhaustive; misses fall back to bracket/suffix detection.
  '威海','深圳','沙河','哈尔滨','北京','上海','广州','南京','天津','青岛',
  '苏州','无锡','成都','重庆','西安','武汉','合肥','济南','长沙','厦门',
  '杭州','宁波','大连','沈阳','长春','郑州','昆明','贵阳','兰州','银川',
]);

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
      // 2026-06-02 fix:经 cleanCampusName 剥离修饰词/学校名前缀后再判定
      const cleaned = cleanCampusName(m[1].trim());
      if (this.looksLikeCampusName(cleaned)) out.add(cleaned);
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
    if (!/[一-龥]/.test(v)) return false;
    // 2026-06-02 fix:含修饰词字眼 → 仍是脏的(防止 clean 漏剥的边角)
    if (/[年学级起开始至]/.test(v)) return false;
    return true;
  }

  extractFromCharterText(text: string): CampusCandidate[] {
    if (!text) return [];
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    // Pattern 1: "位于X、Y和Z" / "分布在X、Y" — split on Chinese list separators
    LOCATIONS_RE.lastIndex = 0;
    while ((m = LOCATIONS_RE.exec(text)) !== null) {
      for (const tok of m[1].split(SPLIT_RE).map((s) => s.trim())) {
        if (CITY_NAMES.has(tok)) out.add(tok);
        // also accept "X校区" tokens
        const stripped = tok.replace(/校区$/, '');
        if (stripped !== tok && stripped.length >= 2) out.add(stripped);
      }
    }
    // Pattern 2: "X校区" / "X分校" anywhere in charter text.
    // SUFFIX_RE captures a greedy prefix (e.g. "我校现有威海" from "我校现有威海校区"),
    // so we scan the tail of the captured token for a CITY_NAMES match.
    SUFFIX_RE.lastIndex = 0;
    while ((m = SUFFIX_RE.exec(text)) !== null) {
      const raw = m[1].trim();
      for (let len = 2; len <= 4; len++) {
        const tail = raw.slice(-len);
        if (CITY_NAMES.has(tail)) { out.add(tail); break; }
      }
    }
    return Array.from(out).map((name) => ({ name, source: 'charter_extract' }));
  }

  /**
   * 手工映射表("已知校区")— 补招生数据完全没线索的真分校。
   * 2026-06-02 加入,优先级最高(用户审定过,比自动扒的可信)。
   */
  extractFromManualList(universityId: number): CampusCandidate[] {
    return lookupKnownCampuses(universityId).map((name) => ({ name, source: 'manual' }));
  }

  async extract(universityId: number): Promise<CampusCandidate[]> {
    const fromTags = await this.extractFromEnrollmentPlanTags(universityId);
    const uni = await this.prisma.university.findUnique({ where: { id: universityId } });
    const charterText = (uni?.charterInfo as { fullText?: string } | null)?.fullText ?? '';
    const fromCharter = this.extractFromCharterText(charterText);
    const fromManual = this.extractFromManualList(universityId);

    // Merge with priority: manual > enrollment_plan_tag > charter_extract.
    // 'manual' 是最权威的(用户维护过),同名时覆盖自动来源。
    const merged = new Map<string, CampusCandidate>();
    for (const c of fromCharter) merged.set(c.name, c);
    for (const c of fromTags) merged.set(c.name, c);
    for (const c of fromManual) merged.set(c.name, c);
    return Array.from(merged.values());
  }
}
