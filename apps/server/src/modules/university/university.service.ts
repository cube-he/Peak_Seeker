import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryUniversityDto } from './dto/query-university.dto';
import { AdmissionService } from '../admission/admission.service';
import { getTier, classifyRank } from './rank-tier';

/**
 * 内存排序：NULL 恒沉底（不论升降序）。数值按大小比较，字符串按 zh-CN locale。
 * 用于 findAll 的可空排序列（minRank/tier/softRank），规避 MariaDB 升序 NULL 排首。
 */
function sortRows<T>(rows: T[], field: string, order: 'asc' | 'desc'): T[] {
  const dir = order === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = (a as any)[field];
    const bv = (b as any)[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'zh-CN') * dir;
  });
}

@Injectable()
export class UniversityService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private admissionService: AdmissionService,
  ) {}

  async findAll(query: QueryUniversityDto) {
    const {
      page = 1,
      pageSize = 20,
      keyword,
      province,
      city,
      type,
      level,
      grade,
      nature,
      isDoubleFirstClass,
      is985,
      is211,
      sortBy = 'name',
      sortOrder = 'asc',
      examType = '物理',
      tierFilter,
      userRank,
    } = query;

    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }
    if (province) where.province = province;
    if (city) where.city = city;
    if (type) where.type = type;
    if (level) where.level = level;
    if (nature) where.runningNature = nature;
    if (grade) where.grade = grade;
    if (isDoubleFirstClass !== undefined) where.isDoubleFirstClass = isDoubleFirstClass;
    if (is985 !== undefined) where.is985 = is985;
    if (is211 !== undefined) where.is211 = is211;

    const isHistory = examType === '历史';
    const minScoreField = isHistory ? 'minScoreHistory' : 'minScorePhysics';
    const minRankField = isHistory ? 'minRankHistory' : 'minRankPhysics';
    const predRankField = isHistory ? 'predRankHistory' : 'predRankPhysics';

    // 把外部 sortBy 值映射到 prisma university 模型的实际字段名。
    // minRank/tier 跟随 examType 选物/史字段；softRank 是固定 softRanking 别名；
    // 其他都是 1:1 直接映射（已经是 prisma 字段名）。
    const orderByField = (() => {
      if (sortBy === 'minRank') return minRankField;
      if (sortBy === 'tier') return predRankField;
      if (sortBy === 'softRank') return 'softRanking';
      return sortBy;
    })();

    // 单条 university 行 -> 列表响应项：注入科类相关 latestAdmission / predictedMinRank，
    // 并剥掉 6 个原始冗余列，避免泄漏到响应。
    const shape = (u: any) => {
      const {
        minScorePhysics,
        minRankPhysics,
        minScoreHistory,
        minRankHistory,
        predRankPhysics,
        predRankHistory,
        ...rest
      } = u;
      const minScore = u[minScoreField];
      const minRank = u[minRankField];
      return {
        ...rest,
        latestAdmission: minScore != null ? { minScore, minRank } : null,
        predictedMinRank: u[predRankField] ?? null,
      };
    };

    // 所有可空字段排序都走内存路径，用 sortRows 让 NULL 沉底
    // （MariaDB ASC 默认 NULL 在前，DB 路径无法 NULL-last）
    const NULLABLE_SORT_BYS = new Set([
      'minRank', 'tier', 'softRank',
      'rankingAlumni', 'rankingQS', 'rankingUSNews', 'rankingTimes',
      'aClassDisciplineCount', 'firstClassDisciplineCount',
      'employmentRate', 'avgSalary', 'furtherStudyRate',
      'satisfactionOverall', 'satisfactionLife', 'satisfactionEnviron',
      'campusArea', 'createdYear', 'heatScore',
    ]);
    const needsMemoryPath =
      (tierFilter != null && userRank != null) ||
      NULLABLE_SORT_BYS.has(sortBy);

    if (needsMemoryPath) {
      let rows = await this.prisma.university.findMany({ where });
      if (tierFilter != null && userRank != null) {
        rows = rows.filter((u: any) => {
          const tier = getTier({ is985: u.is985, is211: u.is211, batch: u.level ?? '' });
          return classifyRank(userRank, u[predRankField], tier, isHistory) === tierFilter;
        });
      }
      rows = sortRows(rows, orderByField, sortOrder);
      const total = rows.length;
      const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
      return {
        data: pageRows.map(shape),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    }

    // 常规路径：DB 排序 + 分页（仅用于 name/province/type 等非可空字段）
    const [data, total] = await Promise.all([
      this.prisma.university.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [orderByField]: sortOrder },
      }),
      this.prisma.university.count({ where }),
    ]);

    return {
      data: data.map(shape),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findById(id: number, subject?: string) {
    const cacheKey = `university:${id}:subject:${subject ?? 'none'}`;
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;

    const university = await this.prisma.university.findUnique({
      where: { id },
      include: {
        enrollmentPlans: {
          orderBy: { year: 'desc' },
          take: 100,
        },
        admissionRecords: {
          orderBy: { year: 'desc' },
          take: 100,
        },
        campuses: {
          where: { geoStatus: 'verified' },
          orderBy: [{ isMain: 'desc' }, { id: 'asc' }],
        },
      },
    });

    if (!university) {
      throw new NotFoundException('院校不存在');
    }

    // Coerce Prisma Decimal -> number for frontend consumption.
    // Decimal instances have toNumber(); plain numbers / null pass through.
    const decimalToNumber = (v: unknown): number | null => {
      if (v == null) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'object' && v !== null && 'toNumber' in v) {
        return (v as { toNumber: () => number }).toNumber();
      }
      return Number(v);
    };

    const campuses = (university as any).campuses?.map((c: any) => ({
      ...c,
      latitude: decimalToNumber(c.latitude),
      longitude: decimalToNumber(c.longitude),
      nearestAirportKm: decimalToNumber(c.nearestAirportKm),
    })) ?? [];

    // 查询强基计划录取数据，按专业名+年份降序排列
    const qiangjiAdmissions = await this.prisma.qiangjiAdmission.findMany({
      where: { school: university.name },
      orderBy: [{ major: 'asc' }, { year: 'desc' }],
    });

    // bestPrediction: among 普通类本科 / 普通类高职(专科) recruitTypes that match
    // user's subject, pick the one with the smallest pointRank
    // (hardest to get into = "best benchmark").
    let bestPrediction:
      | {
          point: number;
          conservative: number;
          optimistic: number;
          basisYears: number[];
          confidence: string;
          targetYear: number;
          subjects: string;
          batch: string;
        }
      | null = null;
    if (subject) {
      const targetYear = await this.admissionService.getTargetYear();
      const candidates = await this.prisma.rankPrediction.findMany({
        where: {
          universityId: id,
          targetYear,
          subjects: subject,
          recruitType: { in: ['普通类本科', '普通类高职(专科)'] },
        },
        orderBy: { pointRank: 'asc' },
        take: 1,
      });
      if (candidates.length > 0) {
        const p = candidates[0];
        bestPrediction = {
          point: p.pointRank!,
          conservative: p.conservativeRank!,
          optimistic: p.optimisticRank!,
          basisYears: p.basisYears as number[],
          confidence: p.confidence,
          targetYear: p.targetYear,
          subjects: p.subjects,
          batch: p.batch,
        };
      }
    }

    const result = { ...university, campuses, qiangjiAdmissions, bestPrediction };
    await this.redis.setCache(cacheKey, result, 3600);
    return result;
  }

  async findMajors(id: number, year?: number) {
    const where: any = { universityId: id };
    if (year) where.year = year;

    return this.prisma.enrollmentPlan.findMany({
      where,
      include: {
        major: true,
      },
      orderBy: { year: 'desc' },
    });
  }

  async findAdmissions(id: number, years?: number[]) {
    const where: any = { universityId: id };
    if (years?.length) {
      where.year = { in: years };
    }

    const admissions: Array<Prisma.AdmissionRecordGetPayload<{ include: { major: true } }>> =
      await this.prisma.admissionRecord.findMany({
        where,
        include: { major: true },
        orderBy: [{ year: 'desc' }, { majorMinRank: 'asc' }],
      });

    // Fetch enrollment plan chip fields (majorRanking, disciplineEval, isNationalFeature)
    // for each distinct majorId. We order by year desc so the first entry per major
    // is the latest-year plan — used as the canonical chip source regardless of
    // which admission year the caller is viewing.
    const majorIds = Array.from(new Set(admissions.map((a) => a.majorId).filter(Boolean)));
    const plans = majorIds.length > 0
      ? await this.prisma.enrollmentPlan.findMany({
          where: { universityId: id, majorId: { in: majorIds } },
          orderBy: { year: 'desc' },
          select: {
            majorId: true,
            year: true,
            majorRanking: true,
            disciplineEval: true,
            isNationalFeature: true,
          },
        })
      : [];

    const latestPlanByMajor = new Map<number, typeof plans[0]>();
    for (const p of plans) {
      if (!latestPlanByMajor.has(p.majorId)) {
        latestPlanByMajor.set(p.majorId, p);
      }
    }

    return admissions.map((a) => ({
      ...a,
      extras: {
        majorRanking: latestPlanByMajor.get(a.majorId)?.majorRanking ?? null,
        disciplineEval: latestPlanByMajor.get(a.majorId)?.disciplineEval ?? null,
        isNationalFeature: latestPlanByMajor.get(a.majorId)?.isNationalFeature ?? false,
      },
    }));
  }

  async getHotUniversities(limit?: number) {
    // Prisma 7 rejects `take: undefined` (Prisma 6 accepted it). When the
    // controller's `@Query('limit')` is missing, TS default `limit = 10`
    // does not fire because ValidationPipe's enableImplicitConversion
    // can pass `NaN` instead of `undefined`. Coerce defensively.
    const safeLimit = Number.isFinite(limit) && limit! > 0 ? limit! : 10;
    const cacheKey = `hot-universities:${safeLimit}`;
    const cached = await this.redis.getCache<any[]>(cacheKey);
    if (cached) return cached;

    const universities = await this.prisma.university.findMany({
      where: {
        OR: [
          { is985: true },
          { is211: true },
          { isDoubleFirstClass: true },
        ],
      },
      take: safeLimit,
      orderBy: { isFeatured: 'desc' },
    });

    await this.redis.setCache(cacheKey, universities, 3600);
    return universities;
  }

  async getCampusPois(
    universityId: number,
    campusId: number,
    query: { category: 'subway' | 'mall' | 'airport'; limit?: number },
  ): Promise<Array<{
    id: number;
    amapId: string;
    name: string;
    category: 'subway' | 'mall' | 'airport';
    distance: number;
    metadata: unknown | null;
  }>> {
    const campus = await this.prisma.universityCampus.findUnique({
      where: { id: campusId },
      select: { id: true, universityId: true },
    });
    if (!campus || campus.universityId !== universityId) {
      throw new NotFoundException('campus not found');
    }
    const limit = query.limit ?? 5;
    const rows = await this.prisma.universityCampusPoi.findMany({
      where: { campusId, category: query.category, obsolete: false },
      orderBy: { distance: 'asc' },
      take: limit,
      select: {
        id: true, amapId: true, name: true,
        category: true, distance: true, metadata: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      category: r.category as 'subway' | 'mall' | 'airport',
    }));
  }

  async getPickerOptions(): Promise<{ id: number; code: string | null; name: string }[]> {
    // 仅返回在川招生的院校（四川单省数据约 2,237 所），过滤掉全国其他未招四川学生的院校
    const rows = await this.prisma.university.findMany({
      where: {
        enrollmentPlans: { some: { province: '四川' } },
      },
      select: { id: true, code: true, name: true },
      orderBy: { id: 'asc' },  // deterministic order before dedup
    });
    // dedup by name (生产数据有少量同名重复，picker UX 视作一项)
    const seen = new Map<string, { id: number; code: string | null; name: string }>();
    for (const r of rows) {
      if (!seen.has(r.name)) seen.set(r.name, r);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  async getFilters() {
    const cacheKey = 'university-filters';
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;

    const [provinces, types, levels, cities, grades, natures] = await Promise.all([
      this.prisma.university.groupBy({
        by: ['province'], _count: true, where: { province: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['type'], _count: true, where: { type: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['level'], _count: true, where: { level: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['province', 'city'], _count: true, where: { city: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['grade'], _count: true, where: { grade: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['runningNature'], _count: true, where: { runningNature: { not: null } },
      }),
    ]);

    const filters = {
      provinces: provinces.map((p) => ({ value: p.province, count: p._count })),
      types: types.map((t) => ({ value: t.type, count: t._count })),
      levels: levels.map((l) => ({ value: l.level, count: l._count })),
      cities: cities
        .map((c) => ({ value: c.city!, count: c._count, province: c.province }))
        .sort((a, b) => a.value.localeCompare(b.value, 'zh-CN')),
      grades: grades.map((g) => ({ value: g.grade, count: g._count })),
      natures: natures.map((n) => ({ value: n.runningNature, count: n._count })),
    };

    await this.redis.setCache(cacheKey, filters, 86400);
    return filters;
  }
}
