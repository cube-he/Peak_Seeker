import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AdmissionService } from '../admission/admission.service';
import { getMajorLevelMap, OptionLevels } from '../enrollment-level/enrollment-levels';

@Injectable()
export class MajorService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private admissionService: AdmissionService,
  ) {}

  async findAll(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    level?: string;
    discipline?: string;
    emerging?: boolean;        // 仅看新兴专业（2024 年起增设）
    electiveSubject?: string;  // 按选考建议筛选（如「物理」）
    sortBy?: string;           // 'salary' 薪资降序 / 'popularity' 热度 / 'plan' 在川计划人数降序；默认按名称
    subjectLane?: string;      // '物理'|'历史': 只看该科类在川有计划的专业（学生模式）
    batch?: string;            // 在某批次有招生计划（匹配 scBatches）
    recruitType?: string;      // 特殊招生形式（匹配 scRecruitTypes, 如「公费师范」「订单定向」）
    hasSupplementary?: boolean; // 仅看最新年有征集志愿的专业（没录满, 捡漏信号）
  }) {
    const {
      page: pageRaw = 1, pageSize: sizeRaw = 20, keyword, category, level, discipline,
      emerging, electiveSubject, sortBy, subjectLane, batch, recruitType, hasSupplementary,
    } = query;
    // NestJS @Query 返回 string. Prisma 7 严格要求 skip/take 是 number, 显式强转
    const page = Number(pageRaw) || 1;
    const pageSize = Number(sizeRaw) || 20;

    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }
    if (category) where.category = category;
    if (level) where.level = level;
    if (discipline) where.discipline = discipline;
    if (emerging) where.setupYear = { gte: 2024 };
    if (electiveSubject) where.electiveAdvice = { contains: electiveSubject };
    if (subjectLane === '物理') where.scPhyPlanCount = { gt: 0 };
    if (subjectLane === '历史') where.scHisPlanCount = { gt: 0 };
    if (batch) where.scBatches = { contains: batch };
    if (recruitType) where.scRecruitTypes = { contains: recruitType };
    if (hasSupplementary) where.scSupplCount = { gt: 0 };

    // 按平均薪资降序时，无薪资数据的专业排在后面
    // 按热度时，上榜专业(popularityRank 1-50)排前、按名次升序，未上榜的 nulls last
    const orderBy =
      sortBy === 'salary'
        ? [{ avgSalary: { sort: 'desc' as const, nulls: 'last' as const } }, { name: 'asc' as const }]
        : sortBy === 'popularity'
          ? [{ popularityRank: { sort: 'asc' as const, nulls: 'last' as const } }, { name: 'asc' as const }]
          : sortBy === 'plan'
            ? [{ scPlanCount: { sort: 'desc' as const, nulls: 'last' as const } }, { name: 'asc' as const }]
            : [{ name: 'asc' as const }];

    const [data, total] = await Promise.all([
      this.prisma.major.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      this.prisma.major.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 专业排行榜: 全部读物化列(cs_ / sc_ / popularity_ / 就业薪酬满意度), 纯 orderBy + 门槛过滤。
   * 默认 scope=SC 只看在川有招生的专业(家长视角), scope=ALL 看全国。
   * 各榜门槛是口径的一部分: 分数榜要求在川院校数>=3(防单校失真),
   * 竞争比榜要求岗位数>=500(防小众专业小样本), 满意度榜要求评价人数>=100。
   */
  async getRankings(query: {
    board?: string;   // CIVIL_SERVICE | POPULARITY | SCORE | PLAN | SUPPLEMENTARY | SALARY | EMPLOYMENT | SATISFACTION
    sub?: string;     // 考公榜副口径: JOBS_2026(默认) | JOBS_TOTAL | COMPETITION
    examType?: string; // PHYSICS | HISTORY (分数/计划榜)
    scope?: string;   // SC(默认, 在川有招生) | ALL
    limit?: number;
  }) {
    const board = String(query.board ?? 'CIVIL_SERVICE').toUpperCase();
    const sub = String(query.sub ?? 'JOBS_2026').toUpperCase();
    const examType = String(query.examType ?? '').toUpperCase();
    const scope = String(query.scope ?? 'SC').toUpperCase();
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);

    const cacheKey = `major:rankings:${board}:${sub}:${examType}:${scope}:${limit}`;
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;

    const where: any = {};
    if (scope === 'SC') where.scPlanCount = { gt: 0 };
    const phys = examType === 'PHYSICS';
    let orderBy: any[];
    switch (board) {
      case 'CIVIL_SERVICE': {
        if (sub === 'COMPETITION') {
          where.csJobs2026 = { gte: 500 };
          orderBy = [{ csCompetition: { sort: 'asc', nulls: 'last' } }];
        } else if (sub === 'JOBS_TOTAL') {
          where.csJobs2026 = { not: null };
          orderBy = [{ csJobsTotal: { sort: 'desc', nulls: 'last' } }];
        } else {
          where.csJobs2026 = { not: null };
          orderBy = [{ csJobs2026: { sort: 'desc', nulls: 'last' } }];
        }
        break;
      }
      case 'POPULARITY':
        where.popularityRank = { not: null };
        orderBy = [{ popularityRank: 'asc' }];
        break;
      case 'SCORE': {
        const col = phys ? 'scPhyScoreHi' : 'scHisScoreHi';
        where[col] = { not: null };
        where.scPlanUnis = { gte: 3 };
        orderBy = [{ [col]: { sort: 'desc', nulls: 'last' } }];
        break;
      }
      case 'PLAN': {
        const col = phys ? 'scPhyPlanCount' : examType === 'HISTORY' ? 'scHisPlanCount' : 'scPlanCount';
        where[col] = { gt: 0 };
        orderBy = [{ [col]: { sort: 'desc', nulls: 'last' } }];
        break;
      }
      case 'SUPPLEMENTARY':
        where.scSupplCount = { gt: 0 };
        orderBy = [{ scSupplCount: { sort: 'desc', nulls: 'last' } }];
        break;
      case 'SALARY':
        where.avgSalary = { not: null };
        orderBy = [{ avgSalary: { sort: 'desc', nulls: 'last' } }];
        break;
      case 'EMPLOYMENT':
        where.employmentRate = { not: null };
        orderBy = [{ employmentRate: { sort: 'desc', nulls: 'last' } }];
        break;
      case 'SATISFACTION':
        where.satisfactionScore = { not: null };
        where.satisfactionOverallCount = { gte: 100 };
        orderBy = [{ satisfactionScore: { sort: 'desc', nulls: 'last' } }];
        break;
      default:
        throw new Error(`未知榜单: ${board}`);
    }
    orderBy.push({ name: 'asc' });

    const list = await this.prisma.major.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true, name: true, code: true, category: true, discipline: true, level: true,
        // 考公
        csJobs2023: true, csJobs2024: true, csJobs2025: true,
        csJobs2026: true, csJobsTotal: true, csRecruitTotal: true, csCompetition: true,
        csTrendDelta: true, csTrendLabel: true, csRegionTop3: true, csSystemTop3: true,
        csScJobs2026: true, csConfidence: true, csYear: true,
        // 热度
        popularityRank: true, popularityHeat: true, popularityYear: true,
        // 在川招录
        scPlanCount: true, scPhyPlanCount: true, scHisPlanCount: true, scPlanUnis: true,
        scPlanYear: true, scScoreYear: true,
        scPhyScoreLo: true, scPhyScoreHi: true, scHisScoreLo: true, scHisScoreHi: true,
        scSupplCount: true,
        // 就业/薪酬/满意度
        avgSalary: true, employmentRate: true, satisfactionScore: true, satisfactionOverallCount: true,
      },
    });

    const result = { board, sub: board === 'CIVIL_SERVICE' ? sub : undefined, examType: examType || undefined, scope, limit, list };
    await this.redis.setCache(cacheKey, result, 3600);
    return result;
  }

  async findById(id: number) {
    const universitySelect = {
      select: {
        id: true,
        name: true,
        logoUrl: true,
        is985: true,
        is211: true,
        isDoubleFirstClass: true,
        runningNature: true,
      },
    };

    const major = await this.prisma.major.findUnique({
      where: { id },
      include: {
        enrollmentPlans: {
          include: { university: universitySelect },
          orderBy: { year: 'desc' },
        },
        admissionRecords: {
          include: { university: universitySelect },
          orderBy: { year: 'desc' },
        },
      },
    });

    // Inject predictedMinRank into each enrollmentPlan row for the rank badge UI
    if (major && major.enrollmentPlans && major.enrollmentPlans.length > 0) {
      const keys = major.enrollmentPlans
        .filter((ep: any) => ep.universityId && ep.subjects)
        .map((ep: any) => ({
          universityId: ep.universityId,
          groupCode: ep.groupCode,
          batch: ep.batch,
          recruitType: ep.recruitType,
          subjects: ep.subjects,
        }));
      const predMap = await this.admissionService.lookupPredictionsByKeys(keys);
      for (const ep of major.enrollmentPlans as any[]) {
        const k = [ep.universityId, ep.groupCode, ep.batch, ep.recruitType, ep.subjects].join('|');
        ep.predictedMinRank = predMap.get(k) ?? null;
      }
    }

    if (major) {
      // 本/专科同名兄弟专业 (双目录同名, 如中医学): 前端用于层次切换按钮
      const siblingLevel = major.level === '本科' ? '专科' : major.level === '专科' ? '本科' : null;
      (major as any).sibling = siblingLevel
        ? await this.prisma.major.findFirst({
            where: { name: major.name, level: siblingLevel },
            select: { id: true, level: true },
          })
        : null;

      // 专业级征集人数: 按 (year, universityId) 聚合注入历年录取行
      const suppl = await this.prisma.supplementaryRecord.findMany({
        where: { majorId: id },
        select: { year: true, universityId: true, planCount: true },
      });
      if (suppl.length > 0 && (major as any).admissionRecords?.length > 0) {
        const supplMap = new Map<string, number>();
        for (const s of suppl) {
          const k = `${s.year}|${s.universityId}`;
          supplMap.set(k, (supplMap.get(k) ?? 0) + (s.planCount ?? 0));
        }
        for (const ar of (major as any).admissionRecords) {
          ar.supplementaryCount = supplMap.get(`${ar.year}|${ar.universityId}`) ?? null;
        }
      }
    }

    return major;
  }

  async findUniversities(id: number, year?: number) {
    const where: any = { majorId: id };
    if (year) where.year = year;

    return this.prisma.enrollmentPlan.findMany({
      where,
      include: {
        university: true,
      },
      orderBy: { year: 'desc' },
    });
  }

  async getCategories() {
    const cacheKey = 'major-categories';
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;

    const categories = await this.prisma.major.groupBy({
      by: ['category'],
      _count: true,
      where: { category: { not: null } },
    });

    const result = categories.map((c) => ({
      value: c.category,
      count: c._count,
    }));

    await this.redis.setCache(cacheKey, result, 86400);
    return result;
  }

  async getPickerOptions(batches?: string[]): Promise<{ id: number; code: string | null; name: string; levels: OptionLevels | null }[]> {
    // 仅返回在川招生计划中出现过的专业（避免学生在 picker 里选到四川没人招的专业）
    // batches: 当学生已选定批次,只返回在这些批次有招生计划的专业 (商业化流程硬过滤)
    const epWhere: Prisma.EnrollmentPlanWhereInput = { province: '四川' };
    if (batches && batches.length > 0) {
      epWhere.batch = { in: batches };
    }
    const rows = await this.prisma.major.findMany({
      where: {
        enrollmentPlans: { some: epWhere },
      },
      select: { id: true, code: true, name: true },
      orderBy: { id: 'asc' },  // deterministic order before dedup
    });
    // dedup by name (Major 表存在多 code 同 name 的记录，picker UX 上视作一项)
    const seen = new Map<string, { id: number; code: string | null; name: string }>();
    for (const r of rows) {
      if (!seen.has(r.name)) seen.set(r.name, r);
    }
    // alphabetical for picker display + 附在川层次
    const levelMap = await getMajorLevelMap(this.prisma, this.redis);
    return Array.from(seen.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((r) => ({ ...r, levels: levelMap[r.name] ?? null }));
  }

  async getHotMajors(limit?: number) {
    // Prisma 7 rejects `take: undefined`. Coerce defensively (see UniversityService.getHotUniversities note).
    const safeLimit = Number.isFinite(limit) && limit! > 0 ? limit! : 10;
    const cacheKey = 'hot-majors';
    const cached = await this.redis.getCache<any[]>(cacheKey);
    if (cached) return cached;

    const majors = await this.prisma.major.findMany({
      take: safeLimit,
      orderBy: { employmentRate: 'desc' },
    });

    await this.redis.setCache(cacheKey, majors, 3600);
    return majors;
  }
}
