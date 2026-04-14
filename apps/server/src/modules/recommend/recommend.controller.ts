import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  ParseIntPipe,
  Header,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { RecommendService } from './recommend.service';
import { PlanGeneratorService } from './services/plan-generator.service';
import { SmartReplacerService } from './services/smart-replacer.service';
import { ExportFormatterService } from './services/export-formatter.service';
import { RecommendPlanDto } from './dto/recommend-plan.dto';
import {
  GeneratePlanDto,
  ReplaceItemDto,
  ExportPlanDto,
  BatchUpdateScoresDto,
} from './dto/generate-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ExportFormat, PlanGenerationJobData } from './interfaces/recommend.types';

@ApiTags('智能推荐')
@Controller('recommend')
export class RecommendController {
  constructor(
    private readonly recommendService: RecommendService,
    private readonly planGenerator: PlanGeneratorService,
    private readonly smartReplacer: SmartReplacerService,
    private readonly exportFormatter: ExportFormatterService,
    @InjectQueue('plan-generation') private readonly planQueue: Queue,
  ) {}

  // ---- Legacy endpoints (preserved for backward compatibility) ----

  @Post('plan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成志愿方案(旧版)' })
  async generatePlanLegacy(@Body() dto: RecommendPlanDto) {
    return this.recommendService.generatePlan(dto);
  }

  @Post('universities')
  @ApiOperation({ summary: '推荐院校' })
  async recommendUniversities(
    @Body() dto: { score: number; rank: number; province: string; limit?: number },
  ) {
    return this.recommendService.recommendUniversities(dto);
  }

  // ---- v4.4 Plan Generation Endpoints ----

  @Post('plans/generate/:studentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '启动异步方案生成（v4.4引擎）' })
  @ApiParam({ name: 'studentId', type: Number })
  async generatePlan(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: GeneratePlanDto,
    @Req() req: any,
  ) {
    const jobData: PlanGenerationJobData = {
      studentId,
      createdById: req.user.id,
      batch: dto.batch,
      priorityMode: dto.priorityMode as any,
      overrides: dto.overrides,
    };

    const jobId = await this.planGenerator.queueGeneration(jobData, 2);

    return {
      jobId,
      message: '方案生成已开始，请通过 SSE 或轮询获取进度',
      statusUrl: `/recommend/plans/generate/${jobId}/status`,
    };
  }

  @Get('plans/generate/:jobId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询方案生成进度' })
  @ApiParam({ name: 'jobId', type: String })
  async getGenerationStatus(@Param('jobId') jobId: string) {
    const job = await this.planQueue.getJob(jobId);

    if (!job) {
      return { status: 'not_found', message: '任务不存在' };
    }

    const state = await job.getState();
    const progress = job.progress as any;

    return {
      jobId: job.id,
      status: state,
      progress: progress || { stage: 'queued', percentage: 0, message: '排队中...' },
      result: state === 'completed' ? job.returnvalue : undefined,
      failReason: state === 'failed' ? job.failedReason : undefined,
    };
  }

  @Post('plans/:id/replace/:sequence')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '智能替换方案中的一个志愿' })
  @ApiParam({ name: 'id', type: Number, description: '方案ID' })
  @ApiParam({ name: 'sequence', type: Number, description: '志愿序号' })
  async replacePlanItem(
    @Param('id', ParseIntPipe) planId: number,
    @Param('sequence', ParseIntPipe) sequence: number,
    @Body() dto: ReplaceItemDto,
    @Req() req: any,
  ) {
    const student = await this.planGenerator.loadStudentProfile(
      // First get the plan to find the student
      await this.getStudentIdFromPlan(planId),
    );

    const suggestions = await this.smartReplacer.findReplacements(
      planId,
      sequence,
      student,
      dto.topN || 3,
    );

    return {
      planId,
      sequence,
      suggestions: suggestions.map((s) => ({
        universityId: s.candidate.universityId,
        universityName: s.candidate.universityName,
        majorId: s.candidate.majorId,
        majorName: s.candidate.majorName,
        compositeScore: s.candidate.compositeScore,
        reason: s.reason,
      })),
    };
  }

  @Post('plans/:id/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '导出方案（Excel/PDF）' })
  @ApiParam({ name: 'id', type: Number })
  async exportPlan(
    @Param('id', ParseIntPipe) planId: number,
    @Body() dto: ExportPlanDto,
    @Res() res: Response,
  ) {
    const format = dto.format as ExportFormat;
    const buffer = await this.exportFormatter.export(planId, format);

    const mimeTypes: Record<string, string> = {
      excel_full: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      excel_compact: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
    };

    const extensions: Record<string, string> = {
      excel_full: 'xlsx',
      excel_compact: 'xlsx',
      pdf: 'pdf',
    };

    const filename = `volunteer_plan_${planId}.${extensions[format] || 'xlsx'}`;

    res.setHeader('Content-Type', mimeTypes[format] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('students/batch-update-scores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量更新学生成绩并可选重新生成方案' })
  async batchUpdateScores(
    @Body() dto: BatchUpdateScoresDto,
    @Req() req: any,
  ) {
    const results: { studentId: number; success: boolean; jobId?: string; error?: string }[] = [];

    for (const update of dto.updates) {
      try {
        // Update student profile scores
        await this.recommendService.updateStudentScore(
          update.studentId,
          update.totalScore,
          update.provincialRank,
        );

        let jobId: string | undefined;
        if (dto.autoRegenerate) {
          jobId = await this.planGenerator.queueGeneration(
            {
              studentId: update.studentId,
              createdById: req.user.id,
            },
            1, // Priority 1 for batch post-score
          );
        }

        results.push({ studentId: update.studentId, success: true, jobId });
      } catch (error: any) {
        results.push({
          studentId: update.studentId,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      totalUpdated: results.filter((r) => r.success).length,
      totalFailed: results.filter((r) => !r.success).length,
      results,
    };
  }

  @Get('light/:studentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '轻量推荐（Top 30，不持久化）' })
  @ApiParam({ name: 'studentId', type: Number })
  async lightRecommend(
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    const candidates = await this.planGenerator.lightRecommend(studentId, 30);

    return {
      count: candidates.length,
      items: candidates.map((c) => ({
        universityId: c.universityId,
        universityName: c.universityName,
        majorId: c.majorId,
        majorName: c.majorName,
        compositeScore: c.compositeScore,
        scoreBreakdown: c.scoreBreakdown,
        is985: c.is985,
        is211: c.is211,
        runningNature: c.runningNature,
        planCount: c.planCount,
        tuition: c.tuition,
      })),
    };
  }

  // ---- Private helpers ----

  private async getStudentIdFromPlan(planId: number): Promise<number> {
    const plan = await this.recommendService.getPlanStudentId(planId);
    return plan;
  }
}
