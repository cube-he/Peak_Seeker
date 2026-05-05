import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StudentService } from './student.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtPayloadUser } from '../casl/types';

@ApiTags('学生管理')
@Controller('students')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class StudentController {
  constructor(private studentService: StudentService) {}

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

  // ── 老师/管理员端点 ───────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: '获取学生详情' })
  @CheckPolicies((ability) => ability.can('read', 'StudentProfile'))
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.studentService.findById(id);
  }

  @Put(':id/profile')
  @ApiOperation({ summary: '更新学生档案' })
  @CheckPolicies((ability) => ability.can('update', 'StudentProfile'))
  async updateProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.studentService.updateProfile(id, dto);
  }

  @Put(':id/assign')
  @ApiOperation({ summary: '分配学生给教师' })
  @CheckPolicies((ability) => ability.can('manage', 'StudentProfile'))
  async assignTeacher(
    @Param('id', ParseIntPipe) id: number,
    @Body('teacherProfileId', ParseIntPipe) teacherProfileId: number,
  ) {
    return this.studentService.assignTeacher(id, teacherProfileId);
  }
}
