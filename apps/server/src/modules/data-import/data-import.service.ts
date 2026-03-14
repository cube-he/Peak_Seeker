import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AiConfigService } from '../ai-config/ai-config.service';

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);
  private readonly ocrServiceUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private aiConfigService: AiConfigService,
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
    sourceUrl?: string,
    engine?: string,  // 指定 OCR 引擎
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
        source_url: sourceUrl || '',
        engine: engine || '',  // 传递引擎参数
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
   * 调用 OCR + AI 双重识别（仅支持征集志愿）
   */
  async runOcrWithAI(
    imageUrls: string[],
    year: number,
    province: string,
    examType: string,
    batch?: string,
    sourceUrl?: string,
    aiConfigId?: string,  // 本地 AI 配置 ID
    aiApiKey?: string,    // 手动输入的 API Key
    aiBaseUrl?: string,
    aiModel?: string,
  ) {
    let finalApiKey = aiApiKey || '';
    let finalBaseUrl = aiBaseUrl || '';
    let finalModel = aiModel || '';

    // 如果提供了本地配置 ID，从本地获取配置
    if (aiConfigId && !aiApiKey) {
      const fullConfig = await this.aiConfigService.getFullConfig(aiConfigId);
      if (fullConfig) {
        finalApiKey = fullConfig.apiKey;
        finalBaseUrl = fullConfig.baseUrl;
        finalModel = fullConfig.model;
        this.logger.log(`使用本地 AI 配置: ${fullConfig.name}`);
      }
    }

    const resp = await fetch(`${this.ocrServiceUrl}/ocr-with-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_urls: imageUrls,
        data_type: 'supplementary',
        year,
        province,
        exam_type: examType,
        batch: batch || '本科一批',
        source_url: sourceUrl || '',
        enable_ai: !!finalApiKey,
        ai_api_key: finalApiKey,
        ai_base_url: finalBaseUrl,
        ai_model: finalModel,
      }),
      signal: AbortSignal.timeout(10 * 60_000), // AI 校验需要更长时间
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `OCR+AI 识别失败: ${resp.status}`);
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
      exam_type?: string;  // 每条数据可能有自己的考试类型
    }[],
    year: number,
    province: string,
    examType: string,  // 默认考试类型（如果数据中没有指定）
    batch: string,
  ) {
    let newUniversities = 0;
    let newMajors = 0;
    let newPlans = 0;
    const involvedUniversities = new Set<string>();
    const involvedMajors = new Set<string>();

    for (const row of data) {
      // 使用数据中的考试类型，如果没有则使用默认值
      const rowExamType = row.exam_type || examType;

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
      involvedUniversities.add(row.university_code);

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
      involvedMajors.add(`${row.major_code}_${row.major_name}`);

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

    const totalUniversities = involvedUniversities.size;
    const totalMajors = involvedMajors.size;

    this.logger.log(
      `保存征集志愿: ${year} ${province} ${batch}, 涉及院校 ${totalUniversities} (新增 ${newUniversities}), 专业 ${totalMajors} (新增 ${newMajors}), 计划 ${newPlans}`,
    );

    return {
      success: true,
      affectedRows: newPlans,
      message: `成功导入: ${totalUniversities} 所院校, ${totalMajors} 个专业, ${newPlans} 条招生计划`,
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

  /**
   * 单张图片 AI 验证（用于逐张校验）
   *
   * 对比 AI 识别结果与 OCR 数据，返回带状态标记的结果：
   * - matched: AI 与 OCR 一致
   * - conflict: AI 与 OCR 冲突（需人工审核）
   * - ai_only: 仅 AI 识别到（OCR 可能漏识别）
   * - ocr_only: 仅 OCR 识别到（AI 可能漏识别）
   * - timeout: AI 请求超时
   * - error: AI 请求错误
   */
  async aiVerifySingle(
    imageUrl: string,
    ocrData: any[],
    year: number,
    province: string,
    examType: string,
    batch: string,
    aiConfigId?: string,
    aiApiKey?: string,
    aiBaseUrl?: string,
    aiModel?: string,
  ) {
    let finalApiKey = aiApiKey || '';
    let finalBaseUrl = aiBaseUrl || '';
    let finalModel = aiModel || '';

    // 如果提供了本地配置 ID，从本地获取配置
    if (aiConfigId && !aiApiKey) {
      const fullConfig = await this.aiConfigService.getFullConfig(aiConfigId);
      if (fullConfig) {
        finalApiKey = fullConfig.apiKey;
        finalBaseUrl = fullConfig.baseUrl;
        finalModel = fullConfig.model;
        this.logger.log(`AI 验证使用本地配置: ${fullConfig.name}`);
      }
    }

    if (!finalApiKey) {
      throw new Error('AI API 密钥未配置');
    }

    const resp = await fetch(`${this.ocrServiceUrl}/ai-verify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        ocr_data: ocrData,
        year,
        province,
        exam_type: examType,
        batch: batch || '本科一批',
        ai_api_key: finalApiKey,
        ai_base_url: finalBaseUrl,
        ai_model: finalModel,
      }),
      signal: AbortSignal.timeout(3 * 60_000), // 单张图片 AI 验证最多 3 分钟
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `AI 验证失败: ${resp.status}`);
    }

    return resp.json();
  }

  /**
   * 多引擎交叉校验 OCR
   *
   * 使用多个 OCR 引擎（百度云、PaddleOCR、RapidOCR、AI视觉模型）同时识别，
   * 通过交叉比对确保数据准确性。
   */
  async runMultiEngineOcr(
    imageUrls: string[],
    dataType: string,
    year: number,
    province: string,
    examType: string,
    batch: string,
    options: {
      enableBaidu?: boolean;
      enablePaddleocrVl?: boolean;
      enableAistudio?: boolean;
      enablePaddleocr?: boolean;
      enableRapid?: boolean;
      enableAi?: boolean;
      aiApiKey?: string;
      aiBaseUrl?: string;
      aiModel?: string;
    },
  ) {
    this.logger.log(
      `多引擎校验: ${imageUrls.length} 张图片, 引擎: ` +
        `baidu=${options.enableBaidu}, paddleocr_vl=${options.enablePaddleocrVl}, ` +
        `aistudio=${options.enableAistudio}, paddleocr=${options.enablePaddleocr}, ` +
        `rapid=${options.enableRapid}, ai=${options.enableAi}`,
    );

    const resp = await fetch(`${this.ocrServiceUrl}/ocr-multi-engine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_urls: imageUrls,
        data_type: dataType,
        year,
        province,
        exam_type: examType,
        batch: batch || '本科一批',
        enable_baidu: options.enableBaidu ?? true,
        enable_paddleocr_vl: options.enablePaddleocrVl ?? false,
        enable_aistudio: options.enableAistudio ?? false,
        enable_paddleocr: options.enablePaddleocr ?? true,
        enable_rapid: options.enableRapid ?? true,
        enable_ai: options.enableAi ?? false,
        ai_api_key: options.aiApiKey || '',
        ai_base_url: options.aiBaseUrl || '',
        ai_model: options.aiModel || '',
      }),
      signal: AbortSignal.timeout(10 * 60_000), // 多引擎校验需要更长时间
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `多引擎 OCR 校验失败: ${resp.status}`);
    }

    const result = await resp.json();

    this.logger.log(
      `多引擎校验完成: 总计 ${result.total_records} 条, ` +
        `高置信 ${result.high_confidence}, 中置信 ${result.medium_confidence}, ` +
        `冲突 ${result.conflicts}, 待审核 ${result.pending_review_count}`,
    );

    return result;
  }
}
