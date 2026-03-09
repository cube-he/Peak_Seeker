import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class MajorService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
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
    return this.prisma.major.findUnique({
      where: { id },
      include: {
        enrollmentPlans: {
          include: { university: true },
          orderBy: { year: 'desc' },
        },
        admissionRecords: {
          include: { university: true },
          orderBy: { year: 'desc' },
        },
      },
    });
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

  async getHotMajors(limit = 10) {
    const cacheKey = 'hot-majors';
    const cached = await this.redis.getCache<any[]>(cacheKey);
    if (cached) return cached;

    const majors = await this.prisma.major.findMany({
      take: limit,
      orderBy: { employmentRate: 'desc' },
    });

    await this.redis.setCache(cacheKey, majors, 3600);
    return majors;
  }
}
