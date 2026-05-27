import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ConsultationService } from './consultation.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { RequestConsultationDto } from './dto/request-consultation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../casl';

@ApiTags('沟通预约')
@Controller('consultations')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class ConsultationController {
  constructor(private service: ConsultationService) {}

  @Post()
  @ApiOperation({ summary: '创建预约' })
  async create(@Request() req: any, @Body() dto: CreateConsultationDto) {
    return this.service.create(req.user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新预约' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConsultationDto,
  ) {
    return this.service.update(req.user.id, id, dto);
  }

  @Post(':id/start')
  @ApiOperation({ summary: '开始沟通(打点)' })
  @ApiParam({ name: 'id', type: Number })
  async start(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.start(req.user.id, id);
  }

  @Post(':id/end')
  @ApiOperation({ summary: '结束沟通(打点 + 自动算时长)' })
  @ApiParam({ name: 'id', type: Number })
  async end(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string },
  ) {
    return this.service.end(req.user.id, id, body.notes);
  }

  @Get('insights/me')
  @ApiOperation({ summary: '老师个人复盘统计' })
  async getMyInsights(@Request() req: any, @Query('range') range?: string) {
    return this.service.getMyInsights(req.user.id, (range as 'week' | 'month') ?? 'month');
  }

  @Get('insights/team')
  @ApiOperation({ summary: '主管报表(需主管权限)' })
  async getTeamInsights(@Request() req: any, @Query('range') range?: string) {
    return this.service.getTeamInsights(req.user.id, (range as 'week' | 'month') ?? 'month');
  }

  @Get('today')
  @ApiOperation({ summary: '今日沟通(Dashboard 用)' })
  async listToday(@Request() req: any) {
    return this.service.listToday(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '按学生列出预约' })
  async listByStudent(
    @Request() req: any,
    @Query('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.service.listByStudent(req.user.id, studentId);
  }

  @Post('request')
  @ApiOperation({ summary: '学生侧申请预约(status=requested)' })
  async requestByParent(@Request() req: any, @Body() dto: RequestConsultationDto) {
    return this.service.requestByParent(req.user.id, dto);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: '老师确认家长申请的预约' })
  @ApiParam({ name: 'id', type: Number })
  async confirmRequest(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.confirmRequest(req.user.id, id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '老师拒绝家长申请的预约' })
  @ApiParam({ name: 'id', type: Number })
  async rejectRequest(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
  ) {
    return this.service.rejectRequest(req.user.id, id, body.reason);
  }

  @Get('pending-requests')
  @ApiOperation({ summary: '老师待确认的家长申请列表' })
  async listPendingRequests(@Request() req: any) {
    return this.service.listPendingRequests(req.user.id);
  }

  @Get('mine')
  @ApiOperation({ summary: '学生侧:自己的预约列表' })
  async listMine(@Request() req: any) {
    return this.service.listMine(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除预约' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user.id, id);
  }
}
