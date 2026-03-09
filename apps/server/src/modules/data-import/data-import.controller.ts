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
      );
    } catch (e: any) {
      throw new HttpException(
        e?.message || 'OCR 识别失败',
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
        university_code: string;
        university_name: string;
        major_code: string;
        major_name: string;
        plan_count: number;
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
}
