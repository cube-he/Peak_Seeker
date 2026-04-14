import {
  Controller,
  Post,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { ExcelParserService } from './services/excel-parser.service';
import { DataValidatorService } from './services/data-validator.service';
import { BatchImportService, ImportTarget } from './services/batch-import.service';
import { MajorStandardizerService } from './services/major-standardizer.service';
import { SupplementaryImportService } from './services/supplementary-import.service';
import { CacheRefreshService } from './services/cache-refresh.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('admin/data')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminImportController {
  constructor(
    private readonly excelParser: ExcelParserService,
    private readonly validator: DataValidatorService,
    private readonly batchImport: BatchImportService,
    private readonly majorStandardizer: MajorStandardizerService,
    private readonly supplementaryImport: SupplementaryImportService,
    private readonly cacheRefresh: CacheRefreshService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /admin/data/import
   * Full import: upload Excel/CSV → validate → batch import
   */
  @Post('import')
  @CheckPolicies((ability) => ability.can('manage', 'DataImport'))
  @UseInterceptors(FileInterceptor('file'))
  async fullImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { target: ImportTarget; sheetName?: string },
    @Req() req: any,
  ) {
    if (!file) {
      throw new HttpException('请上传文件', HttpStatus.BAD_REQUEST);
    }

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new HttpException(
        '仅支持 xlsx/xls/csv 格式文件',
        HttpStatus.BAD_REQUEST,
      );
    }

    const target = body.target;
    if (!target) {
      throw new HttpException(
        '缺少 target 参数（University/Major/EnrollmentPlan/AdmissionRecord/ScoreSegment/BatchLine/BatchConfig）',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // 1. Parse
      const parsed = await this.excelParser.parse(file.buffer, {
        sheetName: body.sheetName,
      });

      // 2. Standardize major names if importing majors
      if (target === 'Major' || target === 'EnrollmentPlan') {
        const majorNames = parsed.rows
          .map((r) => r.name || r.major_name || r.majorName)
          .filter(Boolean);
        if (majorNames.length > 0) {
          await this.majorStandardizer.standardizeAndPersist(
            majorNames,
            `import:${target}`,
          );
        }
      }

      // 3. Validate
      const validation = await this.validator.validate({
        rows: parsed.rows,
        target,
      });

      if (!validation.canProceed) {
        return {
          success: false,
          phase: 'validation',
          validation,
          message: '数据验证未通过，请检查后重试',
        };
      }

      // 4. Batch import
      const result = await this.batchImport.import({
        target,
        data: parsed.rows,
        userId: req.user.id,
        ipAddress: req.ip,
      });

      return {
        success: result.success,
        phase: 'complete',
        validation,
        import: result,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || '导入失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/data/validate
   * Validate only (preview) — parse + validate without importing
   */
  @Post('validate')
  @CheckPolicies((ability) => ability.can('manage', 'DataImport'))
  @UseInterceptors(FileInterceptor('file'))
  async validateOnly(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { target?: ImportTarget; sheetName?: string },
  ) {
    if (!file) {
      throw new HttpException('请上传文件', HttpStatus.BAD_REQUEST);
    }

    try {
      const parsed = await this.excelParser.parse(file.buffer, {
        sheetName: body.sheetName,
      });

      const validation = await this.validator.validate({
        rows: parsed.rows,
        target: body.target,
      });

      // List available sheets for user reference
      const sheets = await this.excelParser.listSheets(file.buffer);

      return {
        sheets,
        headers: parsed.headers,
        rowCount: parsed.rows.length,
        preview: parsed.rows.slice(0, 5),
        validation,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || '解析文件失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/data/records
   * Import history (from AuditLog where action = DATA_IMPORT)
   */
  @Get('records')
  @CheckPolicies((ability) => ability.can('manage', 'DataImport'))
  async getImportRecords(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const [records, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { action: 'DATA_IMPORT' },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, username: true, realName: true } },
        },
      }),
      this.prisma.auditLog.count({ where: { action: 'DATA_IMPORT' } }),
    ]);

    return {
      records,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }

  /**
   * POST /admin/data/supplementary
   * Import supplementary (征集志愿) data
   */
  @Post('supplementary')
  @CheckPolicies((ability) => ability.can('manage', 'DataImport'))
  @UseInterceptors(FileInterceptor('file'))
  async importSupplementary(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { sheetName?: string },
    @Req() req: any,
  ) {
    if (!file) {
      throw new HttpException('请上传文件', HttpStatus.BAD_REQUEST);
    }

    try {
      const parsed = await this.excelParser.parse(file.buffer, {
        sheetName: body.sheetName,
      });

      // Map parsed rows to SupplementaryImportRow structure
      const data = parsed.rows.map((row) => ({
        year: Number(row.year || row.年份),
        province: String(row.province || row.省份 || '四川'),
        batch: String(row.batch || row.批次 || '本科一批'),
        roundNumber: Number(row.roundNumber || row.round_number || row.轮次 || 1),
        universityId: Number(row.universityId || row.university_id || row.院校ID),
        universityName: String(row.universityName || row.university_name || row.院校名称 || ''),
        majorId: row.majorId || row.major_id || row.专业ID
          ? Number(row.majorId || row.major_id || row.专业ID)
          : undefined,
        majorName: row.majorName || row.major_name || row.专业名称 || undefined,
        planCount: row.planCount || row.plan_count || row.计划数
          ? Number(row.planCount || row.plan_count || row.计划数)
          : undefined,
        requirements: row.requirements || row.要求 || undefined,
        filingMinScore: row.filingMinScore || row.filing_min_score || row.投档最低分
          ? Number(row.filingMinScore || row.filing_min_score || row.投档最低分)
          : undefined,
        filingMinRank: row.filingMinRank || row.filing_min_rank || row.投档最低位次
          ? Number(row.filingMinRank || row.filing_min_rank || row.投档最低位次)
          : undefined,
      }));

      const result = await this.supplementaryImport.import(
        data,
        req.user.id,
        req.ip,
      );

      return result;
    } catch (error: any) {
      throw new HttpException(
        error.message || '征集志愿导入失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/data/quality
   * Data quality dashboard: counts per table, freshness, cache status
   */
  @Get('quality')
  @CheckPolicies((ability) => ability.can('manage', 'DataImport'))
  async getDataQuality() {
    const [
      universityCount,
      majorCount,
      enrollmentPlanCount,
      admissionRecordCount,
      scoreSegmentCount,
      batchLineCount,
      batchConfigCount,
      supplementaryRecordCount,
      supplementarySummaryCount,
      majorMappingCount,
    ] = await Promise.all([
      this.prisma.university.count(),
      this.prisma.major.count(),
      this.prisma.enrollmentPlan.count(),
      this.prisma.admissionRecord.count(),
      this.prisma.scoreSegment.count(),
      this.prisma.batchLine.count(),
      this.prisma.batchConfig.count(),
      this.prisma.supplementaryRecord.count(),
      this.prisma.supplementarySummary.count(),
      this.prisma.majorNameMapping.count(),
    ]);

    // Year-level breakdown for admission records
    const admissionByYear = await this.prisma.admissionRecord.groupBy({
      by: ['year'],
      _count: { id: true },
      orderBy: { year: 'desc' },
    });

    // Latest import log
    const latestImport = await this.prisma.auditLog.findFirst({
      where: { action: 'DATA_IMPORT' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      tables: {
        universities: universityCount,
        majors: majorCount,
        enrollmentPlans: enrollmentPlanCount,
        admissionRecords: admissionRecordCount,
        scoreSegments: scoreSegmentCount,
        batchLines: batchLineCount,
        batchConfigs: batchConfigCount,
        supplementaryRecords: supplementaryRecordCount,
        supplementarySummaries: supplementarySummaryCount,
        majorNameMappings: majorMappingCount,
      },
      admissionByYear: admissionByYear.map((y) => ({
        year: y.year,
        count: y._count.id,
      })),
      lastImportAt: latestImport?.createdAt ?? null,
    };
  }
}
