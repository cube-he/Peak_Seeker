import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  SetMetadata,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DataImportService } from './data-import.service';
import { FetchPageDto, RunOcrDto, SaveDataDto } from './dto';

@Controller('data-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@SetMetadata('roles', ['ADMIN', 'SUPER_ADMIN'])
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Get('health')
  async checkHealth() {
    const ocrOk = await this.dataImportService.checkOcrHealth();
    return { server: true, ocrService: ocrOk };
  }

  @Post('fetch')
  async fetchPage(@Body() dto: FetchPageDto) {
    try {
      return await this.dataImportService.fetchPage(
        dto.url,
        dto.dataType ?? 'score_segment',
      );
    } catch (e: any) {
      throw new HttpException(
        e?.message || '抓取页面失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('ocr')
  async runOcr(@Body() dto: RunOcrDto) {
    try {
      return await this.dataImportService.runOcr(
        dto.imageUrls,
        dto.dataType ?? 'score_segment',
        dto.year,
        dto.province ?? '四川',
        dto.examType ?? '物理类',
        dto.batch,
        dto.sourceUrl ?? '',
        dto.engine,  // 传递指定的引擎
      );
    } catch (e: any) {
      throw new HttpException(
        e?.message || 'OCR 识别失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('ocr-with-ai')
  async runOcrWithAI(
    @Body()
    dto: RunOcrDto & {
      enableAi?: boolean;
      aiConfigId?: string;  // 本地 AI 配置 ID
      aiApiKey?: string;
      aiBaseUrl?: string;
      aiModel?: string;
    },
  ) {
    try {
      return await this.dataImportService.runOcrWithAI(
        dto.imageUrls,
        dto.year,
        dto.province ?? '四川',
        dto.examType ?? '物理类',
        dto.batch,
        dto.sourceUrl ?? '',
        dto.aiConfigId,
        dto.aiApiKey ?? '',
        dto.aiBaseUrl,
        dto.aiModel,
      );
    } catch (e: any) {
      throw new HttpException(
        e?.message || 'OCR+AI 识别失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('save')
  async saveData(@Body() dto: SaveDataDto) {
    try {
      if (dto.dataType === 'score_segment' || !dto.dataType) {
        const result = await this.dataImportService.saveScoreSegments(
          dto.data.map((d) => ({
            score: d.score,
            count: d.count,
            cumulativeCount: d.cumulativeCount,
          })),
          dto.year,
          dto.province ?? '四川',
          dto.examType ?? '物理类',
        );
        return { success: true, ...result };
      }

      throw new Error(`暂不支持的数据类型: ${dto.dataType}`);
    } catch (e: any) {
      throw new HttpException(
        e?.message || '保存失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('save-supplementary')
  async saveSupplementary(
    @Body()
    dto: {
      year: number;
      province?: string;
      examType?: string;
      batch?: string;
      data: {
        exam_type: string;
        enrollment_type: string;
        university_code: string;
        university_name: string;
        university_location: string;
        university_note: string;
        major_group_code: string;
        major_group_subject: string;
        major_group_plan: number;
        major_code: string;
        major_name: string;
        major_note: string;
        plan_count: number;
        tuition: string;
      }[];
    },
  ) {
    try {
      const result = await this.dataImportService.saveSupplementaryPlans(
        dto.data,
        dto.year,
        dto.province ?? '四川',
        dto.examType ?? '物理类',
        dto.batch ?? '本科一批',
      );
      return result;
    } catch (e: any) {
      throw new HttpException(
        e?.message || '保存征集志愿失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  async getStats() {
    return this.dataImportService.getImportStats();
  }

  @Post('ai-verify-single')
  async aiVerifySingle(
    @Body()
    dto: {
      imageUrl: string;
      ocrData?: any[];  // 该图片的 OCR 识别数据
      year: number;
      province?: string;
      examType?: string;
      batch?: string;
      aiConfigId?: string;
      aiApiKey?: string;
      aiBaseUrl?: string;
      aiModel?: string;
    },
  ) {
    try {
      return await this.dataImportService.aiVerifySingle(
        dto.imageUrl,
        dto.ocrData ?? [],
        dto.year,
        dto.province ?? '四川',
        dto.examType ?? '物理类',
        dto.batch ?? '本科一批',
        dto.aiConfigId,
        dto.aiApiKey,
        dto.aiBaseUrl,
        dto.aiModel,
      );
    } catch (e: any) {
      throw new HttpException(
        e?.message || 'AI 验证失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('ocr-multi-engine')
  async runMultiEngineOcr(
    @Body()
    dto: {
      imageUrls: string[];
      dataType?: string;
      year: number;
      province?: string;
      examType?: string;
      batch?: string;
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
    try {
      return await this.dataImportService.runMultiEngineOcr(
        dto.imageUrls,
        dto.dataType ?? 'supplementary',
        dto.year,
        dto.province ?? '四川',
        dto.examType ?? '物理类',
        dto.batch ?? '本科一批',
        {
          enableBaidu: dto.enableBaidu ?? true,
          enablePaddleocrVl: dto.enablePaddleocrVl ?? false,
          enableAistudio: dto.enableAistudio ?? false,
          enablePaddleocr: dto.enablePaddleocr ?? true,
          enableRapid: dto.enableRapid ?? true,
          enableAi: dto.enableAi ?? false,
          aiApiKey: dto.aiApiKey,
          aiBaseUrl: dto.aiBaseUrl,
          aiModel: dto.aiModel,
        },
      );
    } catch (e: any) {
      throw new HttpException(
        e?.message || '多引擎 OCR 校验失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
