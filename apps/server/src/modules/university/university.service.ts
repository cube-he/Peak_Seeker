import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryUniversityDto } from './dto/query-university.dto';

@Injectable()
export class UniversityService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
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

    const [data, total] = await Promise.all([
      this.prisma.university.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          admissionRecords: {
            where: { year: new Date().getFullYear() - 1 },
            take: 1,
            orderBy: { year: 'desc' },
          },
        },
      }),
      this.prisma.university.count({ where }),
    ]);

    return {
      data: data.map((u) => ({
        ...u,
        latestAdmission: u.admissionRecords[0] || null,
        admissionRecords: undefined,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: number) {
    const cacheKey = `university:${id}`;
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
      },
    });

    if (!university) {
      throw new NotFoundException('院校不存在');
    }

    await this.redis.setCache(cacheKey, university, 3600);

    return university;
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

    return this.prisma.admissionRecord.findMany({
      where,
      include: {
        major: true,
      },
      orderBy: [{ year: 'desc' }, { majorMinRank: 'asc' }],
    });
  }

  async getHotUniversities(limit = 10) {
    const cacheKey = `hot-universities:${limit}`;
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
      take: limit,
      orderBy: { isFeatured: 'desc' },
    });

    await this.redis.setCache(cacheKey, universities, 3600);
    return universities;
  }

  async getFilters() {
    const cacheKey = 'university-filters';
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;

    const [provinces, types, levels, cities, grades] = await Promise.all([
      this.prisma.university.groupBy({
        by: ['province'],
        _count: true,
        where: { province: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['type'],
        _count: true,
        where: { type: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['level'],
        _count: true,
        where: { level: { not: null } },
      }),
      this.prisma.university.groupBy({
        by: ['city'],
        _count: true,
        where: { city: { not: null } },
        orderBy: { _count: { city: 'desc' } },
      }),
      this.prisma.university.groupBy({
        by: ['grade'],
        _count: true,
        where: { grade: { not: null } },
      }),
    ]);

    const filters = {
      provinces: provinces.map((p) => ({ value: p.province, count: p._count })),
      types: types.map((t) => ({ value: t.type, count: t._count })),
      levels: levels.map((l) => ({ value: l.level, count: l._count })),
      cities: cities.map((c) => ({ value: c.city, count: c._count })),
      grades: grades.map((g) => ({ value: g.grade, count: g._count })),
    };

    await this.redis.setCache(cacheKey, filters, 86400);
    return filters;
  }
}
