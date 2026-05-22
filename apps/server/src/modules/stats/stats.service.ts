import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface HomepageStats {
  universityCount: number;
  admissionRecordCount: number;
  majorCount: number;
  dataYearSpan: number;
}

@Injectable()
export class StatsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getHomepageStats(): Promise<HomepageStats> {
    const cacheKey = 'stats:homepage';
    const cached = await this.redis.getCache<HomepageStats>(cacheKey);
    if (cached) return cached;

    const [universityCount, admissionRecordCount, majorCount, yearRows] =
      await Promise.all([
        // 在川招生院校：与 getPickerOptions 同口径，过滤有四川招生计划的院校
        // 注意：getPickerOptions 还对 name 去重，count 口径不做去重（按 university 行数），
        // 两者数量接近但不完全相同；此处以 Prisma count 为准，更贴近"实体院校数"
        this.prisma.university.count({
          where: { enrollmentPlans: { some: { province: '四川' } } },
        }),

        // 录取记录总数
        this.prisma.admissionRecord.count(),

        // 招生专业数：major 表 count（专业目录中的专业种类数，不重复）
        this.prisma.major.count(),

        // 年份跨度：distinct year 列表
        this.prisma.admissionRecord.findMany({
          distinct: ['year'],
          select: { year: true },
          orderBy: { year: 'asc' },
        }),
      ]);

    const result: HomepageStats = {
      universityCount,
      admissionRecordCount,
      majorCount,
      dataYearSpan: yearRows.length,
    };

    // 统计数据变化缓慢，缓存 1 天
    await this.redis.setCache(cacheKey, result, 86400);
    return result;
  }
}
