import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { HistoricalCasesService } from './historical-cases.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('历史案例')
@Controller('historical-cases')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HistoricalCasesController {
  constructor(private readonly service: HistoricalCasesService) {}

  @Get()
  @ApiOperation({ summary: '历史案例列表 + 过滤 + 分页' })
  async list(
    @Query('examYear') examYear?: string,
    @Query('examType') examType?: 'PHYSICS' | 'HISTORY',
    @Query('batch') batch?: string,
    @Query('scoreFrom') scoreFrom?: string,
    @Query('scoreTo') scoreTo?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list({
      examYear: examYear ? Number(examYear) : undefined,
      examType,
      batch,
      scoreFrom: scoreFrom ? Number(scoreFrom) : undefined,
      scoreTo: scoreTo ? Number(scoreTo) : undefined,
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: '统计概览 (按 examType / batch / 分差 / top 院校)' })
  async stats(@Query('examYear') examYear?: string) {
    return this.service.stats(examYear ? Number(examYear) : undefined);
  }

  @Get('similar')
  @ApiOperation({ summary: '相似历史案例 (按 examType + 分数 ±20 + 位次 ±20%)' })
  async similar(
    @Query('examType') examType: 'PHYSICS' | 'HISTORY',
    @Query('score') score?: string,
    @Query('rank') rank?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.similar({
      examType,
      score: score ? Number(score) : undefined,
      rank: rank ? Number(rank) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '历史案例详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
  }

  @Get('attachments/:id/download')
  @ApiOperation({ summary: '下载附件 (强制保存到本地)' })
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Res() res: Response,
  ) {
    return this.streamAttachment(id, req.user.id, res, 'attachment');
  }

  @Get('attachments/:id/preview')
  @ApiOperation({ summary: '预览附件 (浏览器内打开, 图片直接渲染, PDF 用内置 viewer)' })
  async previewAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Res() res: Response,
  ) {
    return this.streamAttachment(id, req.user.id, res, 'inline');
  }

  private async streamAttachment(
    id: number,
    userId: number,
    res: Response,
    disposition: 'attachment' | 'inline',
  ) {
    const att = await this.service.getAttachmentForDownload(id, userId);
    const uploadsRoot =
      process.env.UPLOADS_ROOT || path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadsRoot, att.storagePath);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`文件丢失: ${att.storagePath}`);
    }
    res.set({
      'Content-Type': att.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(att.originalName)}`,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
