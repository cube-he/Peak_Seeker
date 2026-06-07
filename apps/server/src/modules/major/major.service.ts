import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AdmissionService } from '../admission/admission.service';

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
    sortBy?: string;           // 'salary' = 按平均薪资降序；'popularity' = 按本科热度排名；默认按名称
  }) {
    const {
      page: pageRaw = 1, pageSize: sizeRaw = 20, keyword, category, level, discipline,
      emerging, electiveSubject, sortBy,
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

    // 按平均薪资降序时，无薪资数据的专业排在后面
    // 按热度时，上榜专业(popularityRank 1-50)排前、按名次升序，未上榜的 nulls last
    const orderBy =
      sortBy === 'salary'
        ? [{ avgSalary: { sort: 'desc' as const, nulls: 'last' as const } }, { name: 'asc' as const }]
        : sortBy === 'popularity'
          ? [{ popularityRank: { sort: 'asc' as const, nulls: 'last' as const } }, { name: 'asc' as const }]
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

  async findById(id: number) {
    const universitySelect = {
      select: {
        id: true,
        name: true,
        logoUrl: true,
        is985: true,
        is211: true,
        isDoubleFirstClass: true,
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

  async getPickerOptions(batches?: string[]): Promise<{ id: number; code: string | null; name: string }[]> {
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
    // alphabetical for picker display
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
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
