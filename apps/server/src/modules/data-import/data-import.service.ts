import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);
  private readonly ocrServiceUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.ocrServiceUrl =
      this.config.get('OCR_SERVICE_URL') || 'http://127.0.0.1:8100';
  }

  /**
   * 调用 OCR 微服务抓取页面，提取图片 URL
   */
  async fetchPage(url: string, dataType: string) {
    const resp = await fetch(`${this.ocrServiceUrl}/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, data_type: dataType }),
      signal: AbortSignal.timeout(60_000), // 1 分钟
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `OCR 服务请求失败: ${resp.status}`);
    }

    return resp.json();
  }

  /**
   * 调用 OCR 微服务执行图片识别
   */
  async runOcr(
    imageUrls: string[],
    dataType: string,
    year: number,
    province: string,
    examType: string,
    batch?: string,
  ) {
    const resp = await fetch(`${this.ocrServiceUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_urls: imageUrls,
        data_type: dataType,
        year,
        province,
        exam_type: examType,
        batch: batch || '本科一批',
      }),
      signal: AbortSignal.timeout(5 * 60_000), // OCR 识别最多 5 分钟
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `OCR 识别失败: ${resp.status}`);
    }

    return resp.json();
  }

  /**
   * 将一分一段表数据保存到数据库
   */
  async saveScoreSegments(
    data: { score: number; count: number; cumulativeCount: number }[],
    year: number,
    province: string,
    examType: string,
  ) {
    let upsertCount = 0;

    // 分批处理，每批 100 条
    const batchSize = 100;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      await this.prisma.$transaction(
        batch.map((row) =>
          this.prisma.scoreSegment.upsert({
            where: {
              year_province_examType_score: {
                year,
                province,
                examType,
                score: row.score,
              },
            },
            update: {
              count: row.count,
              cumulativeCount: row.cumulativeCount,
            },
            create: {
              year,
              province,
              examType,
              score: row.score,
              count: row.count,
              cumulativeCount: row.cumulativeCount,
            },
          }),
        ),
      );

      upsertCount += batch.length;
    }

    this.logger.log(
      `保存一分一段表: ${year} ${province} ${examType}, ${upsertCount} 条`,
    );

    return { affectedRows: upsertCount };
  }

  /**
   * 获取已导入的数据统计
   */
  async getImportStats() {
    const stats = await this.prisma.scoreSegment.groupBy({
      by: ['year', 'province', 'examType'],
      _count: { id: true },
      _min: { score: true },
      _max: { score: true },
      orderBy: [{ year: 'desc' }, { province: 'asc' }],
    });

    return stats.map((s) => ({
      year: s.year,
      province: s.province,
      examType: s.examType,
      count: s._count.id,
      minScore: s._min.score,
      maxScore: s._max.score,
    }));
  }

  /**
   * 保存征集志愿数据到数据库
   */
  async saveSupplementaryPlans(
    data: {
      university_code: string;
      university_name: string;
      major_code: string;
      major_name: string;
      plan_count: number;
    }[],
    year: number,
    province: string,
    examType: string,
    batch: string,
  ) {
    let newUniversities = 0;
    let newMajors = 0;
    let newPlans = 0;

    for (const row of data) {
      // 1. 查找或创建院校
      let university = await this.prisma.university.findFirst({
        where: { code: row.university_code },
      });

      if (!university) {
        university = await this.prisma.university.create({
          data: {
            name: row.university_name,
            code: row.university_code,
            province,
          },
        });
        newUniversities++;
      }

      // 2. 查找或创建专业
      let major = await this.prisma.major.findFirst({
        where: {
          code: row.major_code,
          name: row.major_name,
        },
      });

      if (!major) {
        major = await this.prisma.major.create({
          data: {
            name: row.major_name,
            code: row.major_code,
          },
        });
        newMajors++;
      }

      // 3. 插入或更新招生计划
      await this.prisma.enrollmentPlan.upsert({
        where: {
          universityId_majorId_year_province: {
            universityId: university.id,
            majorId: major.id,
            year,
            province,
          },
        },
        update: {
          planCount: row.plan_count,
          planNotes: '征集志愿',
          batch,
        },
        create: {
          universityId: university.id,
          majorId: major.id,
          year,
          province,
          batch,
          planCount: row.plan_count,
          planNotes: '征集志愿',
        },
      });
      newPlans++;
    }

    this.logger.log(
      `保存征集志愿: ${year} ${province} ${batch}, 院校 ${newUniversities}, 专业 ${newMajors}, 计划 ${newPlans}`,
    );

    return {
      success: true,
      affectedRows: newPlans,
      message: `成功导入: ${newUniversities} 所院校, ${newMajors} 个专业, ${newPlans} 条招生计划`,
    };
  }

  /**
   * 检查 OCR 服务是否可用
   */
  async checkOcrHealth(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.ocrServiceUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
