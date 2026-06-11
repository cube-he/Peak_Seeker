import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryUniversityDto } from './dto/query-university.dto';
import { MapQueryDto } from './dto/map-query.dto';
import { AdmissionService } from '../admission/admission.service';
import { getTier, classifyRank } from './rank-tier';

/**
 * 地图视图返回的"校区"载荷 — 一个 verified 校区一行,2026-06-02 改造前是
 * 一所学校一行(只取主校区)。改造原因:用户期望全国大地图按真实校区位置
 * 分开展示(北航 = 3 个 dot 而非 1 个)。
 *
 * id 仍是 university.id(便于点 dot 跳详情页);新增 campusId/campusName/isMain
 * 携带校区维度信息。district 改取自 campus(分校在不同区/县时归属正确)。
 */
export interface MapUniversity {
  id: number;          // 学校 id(跳详情页用)
  name: string;        // 学校名
  province: string | null;
  city: string | null;
  district: string | null;   // 校区所在区/县(来自 university_campuses.district)
  level: string | null;
  type: string | null;
  // 办学性质:公办 / 民办 / 中外合作办学 等。DB 字段叫 runningNature,
  // 给前端时 alias 成 nature 跟 list 接口 / filter store 命名保持一致。
  nature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  lat: number;
  lng: number;
  // 校区维度字段
  campusId: number;
  campusName: string;
  isMain: boolean;
}

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
      hasTag,
    } = query;

    const where: any = {};
    if (keyword) {
      // city 也参与搜索: "绵阳" 能搜出西南科技大学 (搜索框提示了城市搜索)
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { city: { contains: keyword } },
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
    // 院校背景 tag 筛选(University.tags 是 JSON 数组,prisma array_contains 编译成
    // MySQL JSON_CONTAINS,匹配 tag 字符串。如果数据库 tags 字段还没有这个 tag,
    // 会返回空 — 这是 OK 的,后续数据 import 补齐)
    if (hasTag) (where.tags as unknown) = { array_contains: hasTag };

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
      // 默认排序（sortBy=softRank）的分层逻辑:
      // - 软科主榜(softRankList='本科')、民办榜(='民办')、高职榜(='高职')
      //   各自从 1 重新计数,softRanking 跨榜不可比 → 必须按榜分层。
      // - 综合本科 → 民办本科 → 其他本科 → 职业本科 → 专科 → 其他
      // 同分层内 softRanking ASC NULLS LAST。
      if (sortBy === 'softRank') {
        const priority = (u: any): number => {
          if (u.level === '本科' && u.softRankList === '本科') return 0;
          if (u.level === '本科' && u.softRankList === '民办') return 1;
          if (u.level === '本科') return 2;
          if (u.level === '职业本科') return 3;
          if (u.level === '专科') return 4;
          return 5;
        };
        rows = [...rows].sort((a: any, b: any) => {
          const lp = priority(a) - priority(b);
          if (lp !== 0) return lp;
          const av = a.softRanking;
          const bv = b.softRanking;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return av - bv;
        });
      } else {
        rows = sortRows(rows, orderByField, sortOrder);
      }
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

  async findAllForMap(query: MapQueryDto): Promise<MapUniversity[]> {
    // 2026-06-02 改造:从 universityCampus 查每个 verified 校区,而不是从
    // university 表查"是否存在主校区"。结果是扁平的"一校区一行"。
    // cache key 加 :v2 跟旧版本区分,避免老缓存污染新返回(部署后旧 v1 cache 失效)。
    const cacheKey = `university:map:v2:${JSON.stringify(query)}`;
    const cached = await this.redis.getCache<MapUniversity[]>(cacheKey);
    if (cached) return cached;

    // 学校层面的 filter(走 universityCampus → university 嵌套关系)
    const universityWhere: any = {};
    if (query.keyword) {
      universityWhere.OR = [
        { name: { contains: query.keyword } },
        { code: { contains: query.keyword } },
      ];
    }
    if (query.province) universityWhere.province = query.province;
    if (query.city) universityWhere.city = query.city;
    if (query.type) universityWhere.type = query.type;
    if (query.level) universityWhere.level = query.level;
    if (query.nature) universityWhere.runningNature = query.nature;
    if (query.grade) universityWhere.grade = query.grade;
    if (query.isDoubleFirstClass !== undefined) universityWhere.isDoubleFirstClass = query.isDoubleFirstClass;
    if (query.is985 !== undefined) universityWhere.is985 = query.is985;
    if (query.is211 !== undefined) universityWhere.is211 = query.is211;

    const rows = await this.prisma.universityCampus.findMany({
      where: {
        geoStatus: 'verified',
        latitude: { not: null },
        university: universityWhere,
      },
      select: {
        id: true, name: true, isMain: true,
        latitude: true, longitude: true, district: true,
        university: {
          select: {
            id: true, name: true, province: true, city: true,
            level: true, type: true, runningNature: true,
            is985: true, is211: true, isDoubleFirstClass: true,
          },
        },
      },
      orderBy: [{ universityId: 'asc' }, { isMain: 'desc' }, { id: 'asc' }],
    });

    // Prisma Decimal -> number(同 findById 的处理逻辑)
    const toNum = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object' && 'toNumber' in v) {
        return (v as { toNumber: () => number }).toNumber();
      }
      return Number(v);
    };

    const items: MapUniversity[] = rows.map((r: any) => ({
      id: r.university.id,
      name: r.university.name,
      province: r.university.province,
      city: r.university.city,
      district: r.district,
      level: r.university.level,
      type: r.university.type,
      nature: r.university.runningNature,
      is985: r.university.is985,
      is211: r.university.is211,
      isDoubleFirstClass: r.university.isDoubleFirstClass,
      lat: toNum(r.latitude),
      lng: toNum(r.longitude),
      campusId: r.id,
      campusName: r.name,
      isMain: r.isMain,
    }));

    await this.redis.setCache(cacheKey, items, 3600);
    return items;
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
        // P2: 历年排名（按年降序，前端可分榜单展示时间线）
        rankings: {
          orderBy: [{ year: 'desc' }, { listName: 'asc' }],
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

    // P2: ranking.score 是 Decimal，前端图表需要 number
    const rankings = (university as any).rankings?.map((r: any) => ({
      ...r,
      score: decimalToNumber(r.score),
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

    const result = { ...university, campuses, rankings, qiangjiAdmissions, bestPrediction };
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

  async getPickerOptions(batches?: string[]): Promise<{ id: number; code: string | null; name: string; renameHistory: string | null }[]> {
    // 仅返回在川招生的院校（四川单省数据约 2,237 所），过滤掉全国其他未招四川学生的院校
    // renameHistory 用于前端联想时也能搜旧名 / 合并前名称
    // batches: 当学生已选定批次,只返回在这些批次有招生计划的院校 (商业化流程硬过滤)
    const epWhere: Prisma.EnrollmentPlanWhereInput = { province: '四川' };
    if (batches && batches.length > 0) {
      epWhere.batch = { in: batches };
    }
    const rows = await this.prisma.university.findMany({
      where: {
        enrollmentPlans: { some: epWhere },
      },
      select: { id: true, code: true, name: true, renameHistory: true },
      orderBy: { id: 'asc' },  // deterministic order before dedup
    });
    // dedup by name (生产数据有少量同名重复，picker UX 视作一项)
    const seen = new Map<string, { id: number; code: string | null; name: string; renameHistory: string | null }>();
    for (const r of rows) {
      if (!seen.has(r.name)) seen.set(r.name, r);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  async getStats() {
    // 院校库 hero 的 985/211/双一流计数 (此前前端硬编码, 2026-06-11 改真实统计)
    const cacheKey = 'university-stats';
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;
    const [total, n985, n211, nDoubleFirstClass] = await Promise.all([
      this.prisma.university.count(),
      this.prisma.university.count({ where: { is985: true } }),
      this.prisma.university.count({ where: { is211: true } }),
      this.prisma.university.count({ where: { isDoubleFirstClass: true } }),
    ]);
    const result = { total, n985, n211, nDoubleFirstClass };
    await this.redis.setCache(cacheKey, result, 86400);
    return result;
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
