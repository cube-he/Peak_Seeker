import { Injectable } from '@nestjs/common';
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
  }) {
    const { page = 1, pageSize = 20, keyword, category, level, discipline } = query;

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

    const [data, total] = await Promise.all([
      this.prisma.major.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
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

  async getPickerOptions(): Promise<{ id: number; code: string | null; name: string }[]> {
    // 仅返回在川招生计划中出现过的专业（避免学生在 picker 里选到四川没人招的专业）
    const rows = await this.prisma.major.findMany({
      where: {
        enrollmentPlans: {
          some: { province: '四川' },
        },
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
