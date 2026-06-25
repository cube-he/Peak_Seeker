import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeacherService } from './teacher.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtPayloadUser } from '../casl/types';

@ApiTags('教师管理')
@Controller('teachers')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class TeacherController {
  constructor(private teacherService: TeacherService) {}

  @Get()
  @ApiOperation({ summary: '获取所有教师列表' })
  @CheckPolicies((ability) => ability.can('read', 'TeacherProfile'))
  async findAll() {
    return this.teacherService.findAll();
  }

  @Get('me/stats')
  @ApiOperation({ summary: '获取当前教师的学生统计' })
  async getMyStats(@CurrentUser() user: JwtPayloadUser) {
    return this.teacherService.getStudentStats(user.teacherProfileId!);
  }

  @Get('me/gradient-config')
  @ApiOperation({ summary: '获取当前教师的 8 段动态梯度阈值(未设则返回系统默认)' })
  async getMyGradientConfig(@CurrentUser() user: JwtPayloadUser) {
    return this.teacherService.getGradientConfig(user.teacherProfileId!);
  }

  @Put('me/gradient-config')
  @ApiOperation({ summary: '保存当前教师的 8 段动态梯度阈值(老师级偏好, 全局生效)' })
  async updateMyGradientConfig(
    @CurrentUser() user: JwtPayloadUser,
    @Body() body: Record<string, number>,
  ) {
    return this.teacherService.updateGradientConfig(user.teacherProfileId!, body);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取教师详情' })
  @CheckPolicies((ability) => ability.can('read', 'TeacherProfile'))
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.teacherService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新教师信息' })
  @CheckPolicies((ability) => ability.can('manage', 'TeacherProfile'))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { school?: string; isSupervisor?: boolean },
  ) {
    return this.teacherService.updateProfile(id, body);
  }
}
