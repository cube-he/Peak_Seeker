import {
  Controller,
  Get,
  Post,
  Put,
  BadRequestException,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { StudentService } from './student.service';
import { IntakeExportService } from './intake-export.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtPayloadUser } from '../casl/types';

class AssignStudentTeacherDto {
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : Number(value)))
  @IsInt()
  @Min(1)
  teacherProfileId?: number | null;
}

@ApiTags('学生管理')
@Controller('students')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class StudentController {
  constructor(
    private studentService: StudentService,
    private intakeExportService: IntakeExportService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建学生' })
  @CheckPolicies((ability) => ability.can('create', 'StudentProfile'))
  async create(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateStudentDto,
  ) {
    return this.studentService.create(user.teacherProfileId!, dto);
  }

  @Get()
  @ApiOperation({ summary: '查询学生列表' })
  @CheckPolicies((ability) => ability.can('read', 'StudentProfile'))
  async findAll(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: QueryStudentDto,
  ) {
    // Admin sees all students; teacher sees only their own
    const teacherProfileId =
      user.role === 'ADMIN' ? undefined : user.teacherProfileId;
    return this.studentService.findByTeacher(teacherProfileId, query);
  }

  // ── 学生自助端点 (/me) ────────────────────────────────
  // 注：/me 必须声明在 /:id 之前，NestJS 才能正确匹配静态路径

  @Get('me')
  @ApiOperation({ summary: '获取当前学生自己的档案（① 字段已过滤）' })
  async getMyProfile(@CurrentUser() user: JwtPayloadUser) {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可调用此端点');
    }
    return this.studentService.getMyProfile(user.id);
  }

  @Put('me')
  @ApiOperation({ summary: '学生更新自己的档案（拒绝 ① 字段）' })
  async updateMyProfile(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可调用此端点');
    }
    return this.studentService.updateMyProfile(user.id, dto);
  }

  @Get('me/progress')
  @ApiOperation({ summary: '取学生自己的进度信息（双轨完整度）' })
  async getMyProgress(@CurrentUser() user: JwtPayloadUser) {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可调用此端点');
    }
    const profile = await this.studentService.getMyProfile(user.id);
    return (profile as { progress: unknown }).progress;
  }

  @Post('me/submit-intake')
  @ApiOperation({ summary: '学生提交资料给老师确认' })
  async submitMyIntake(@CurrentUser() user: JwtPayloadUser) {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可提交自己的资料');
    }
    return this.studentService.submitMyIntake(user.id);
  }

  // ── 老师/管理员端点 ───────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: '获取学生详情' })
  @CheckPolicies((ability) => ability.can('read', 'StudentProfile'))
  async findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const profile = await this.studentService.findById(id);
    if (
      user.role !== 'ADMIN' &&
      user.studentProfileId !== id &&
      profile.teacherId !== user.teacherProfileId
    ) {
      throw new ForbiddenException('无权查看该学生资料');
    }
    return profile;
  }

  @Post(':id/intake-review')
  @ApiOperation({ summary: '老师确认或退回学生资料' })
  @CheckPolicies((ability) => ability.can('update', 'StudentProfile'))
  async reviewIntake(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
    @Body() body: { action: 'VERIFY' | 'REQUEST_CHANGE'; comment?: string },
  ) {
    return this.studentService.reviewIntake(id, {
      teacherProfileId: user.role === 'ADMIN' ? undefined : user.teacherProfileId,
      reviewerUserId: user.id,
      action: body.action,
      comment: body.comment,
    });
  }

  @Post(':id/unlock-batches')
  @ApiOperation({ summary: '老师解锁学生已锁定的批次选择' })
  @CheckPolicies((ability) => ability.can('update', 'StudentProfile'))
  async unlockBatches(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.studentService.unlockBatches(
      id,
      user.id,
      user.role === 'ADMIN' ? undefined : user.teacherProfileId ?? undefined,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update student profile through legacy route' })
  @CheckPolicies((ability) => ability.can('update', 'StudentProfile'))
  async updateProfileLegacy(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.updateProfile(id, user, dto);
  }

  @Put(':id/profile')
  @ApiOperation({ summary: '更新学生档案' })
  @CheckPolicies((ability) => ability.can('update', 'StudentProfile'))
  async updateProfile(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.studentService.updateProfile(id, dto, 'teacher', user.id);
  }

  @Put(':id/assign')
  @ApiOperation({ summary: '分配学生给教师' })
  @CheckPolicies((ability) => ability.can('manage', 'StudentProfile'))
  async assignTeacher(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignStudentTeacherDto,
  ) {
    if (!Object.prototype.hasOwnProperty.call(body, 'teacherProfileId')) {
      throw new BadRequestException('teacherProfileId is required; use null to clear assignment');
    }

    return this.studentService.assignTeacher(id, body.teacherProfileId ?? null);
  }

  @Get(':id/export-intake')
  @ApiOperation({ summary: '导出学生接待单 xlsx（仅老师/管理员）' })
  @CheckPolicies((ability) => ability.can('export', 'StudentProfile'))
  async exportIntake(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.intakeExportService.export(id);
    const profile = await this.studentService.findById(id);
    const realName = (profile as any).user?.realName ?? `student${id}`;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // RFC 5987 编码非 ASCII 文件名
    const filename = `intake_${realName}_${today}.xlsx`;
    const filenameStar = encodeURIComponent(filename);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="intake_${id}_${today}.xlsx"; filename*=UTF-8''${filenameStar}`,
    });
    res.end(Buffer.from(buffer));
  }

  @Get(':id/change-logs')
  @ApiOperation({ summary: '获取学生资料字段变更日志' })
  @ApiParam({ name: 'id', type: Number })
  @CheckPolicies((ability) => ability.can('read', 'StudentProfile'))
  async getChangeLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, string>,
  ) {
    return this.studentService.getChangeLogs(id, {
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
      fieldKey: query.fieldKey || undefined,
    });
  }

}
