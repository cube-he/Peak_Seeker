import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CheckPolicies, PoliciesGuard } from '../casl';

const CONFIG_CACHE_KEY = 'admin:system-config';

const DEFAULT_CONFIG = {
  currentYear: 2026,
  province: '四川',
  maxVolunteers: 45,
  defaultRushRatio: 40,
  defaultStableRatio: 40,
  defaultSafeRatio: 20,
  rankFluctuationYears: 4,
  freezeMode: false,
};

interface AdminUserPayload {
  username: string;
  password?: string;
  realName?: string;
  phone?: string;
  email?: string;
  role?: Role;
}

@ApiTags('管理后台')
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('stats')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '管理后台统计' })
  async getStats() {
    const [totalStudents, totalTeachers, totalPlans, finalizedPlans] =
      await Promise.all([
        this.prisma.studentProfile.count(),
        this.prisma.teacherProfile.count(),
        this.prisma.volunteerPlan.count(),
        this.prisma.volunteerPlan.count({ where: { status: 'FINALIZED' } }),
      ]);

    return {
      data: {
        totalStudents,
        totalTeachers,
        totalPlans,
        finalizedPlans,
      },
    };
  }

  @Get('config')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '读取管理后台配置' })
  async getConfig() {
    const cached = await this.redis.getCache<Record<string, unknown>>(
      CONFIG_CACHE_KEY,
    );
    return { data: { ...DEFAULT_CONFIG, ...(cached ?? {}) } };
  }

  @Put('config')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '保存管理后台配置' })
  async updateConfig(@Body() body: Record<string, unknown>) {
    const config = { ...DEFAULT_CONFIG, ...body };
    await this.redis.setCache(CONFIG_CACHE_KEY, config, 60 * 60 * 24 * 30);
    return { data: config };
  }

  @Get('users')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  @ApiOperation({ summary: '管理后台用户列表' })
  async getUsers(
    @Query('role') role?: Role,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const where: Record<string, any> = {};
    if (role) where.role = role;

    const keyword = search?.trim();
    if (keyword) {
      where.OR = [
        { realName: { contains: keyword } },
        { username: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    const take = Math.max(1, Number(pageSize) || 20);
    const currentPage = Math.max(1, Number(page) || 1);
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          realName: true,
          phone: true,
          email: true,
          role: true,
          createdAt: true,
          teacherProfile: { select: { id: true, school: true } },
          studentProfile: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * take,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => ({
        ...user,
        status: user.studentProfile?.status ?? 'ACTIVE',
      })),
      total,
      page: currentPage,
      pageSize: take,
    };
  }

  @Post('users')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  @ApiOperation({ summary: '管理后台创建用户' })
  async createUser(@Body() body: AdminUserPayload) {
    const existing = await this.prisma.user.findUnique({
      where: { username: body.username },
    });
    if (existing) {
      throw new ConflictException('用户名已存在');
    }

    const role = body.role ?? Role.STUDENT;
    const passwordHash = await bcrypt.hash(body.password ?? 'Aa123456', 12);
    const profileData =
      role === Role.TEACHER
        ? { teacherProfile: { create: {} } }
        : role === Role.STUDENT
          ? { studentProfile: { create: { province: '四川' } } }
          : {};

    const user = await this.prisma.user.create({
      data: {
        username: body.username,
        passwordHash,
        realName: body.realName,
        phone: body.phone,
        email: body.email,
        role,
        ...profileData,
      },
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return { data: { ...user, status: 'ACTIVE' } };
  }

  @Put('users/:id')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  @ApiOperation({ summary: '管理后台更新用户基础资料' })
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<AdminUserPayload>,
  ) {
    // username 唯一，改名前查重；命中自己则放行
    if (body.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: body.username },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('用户名已存在');
      }
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        username: body.username,
        realName: body.realName,
        phone: body.phone,
        email: body.email,
      },
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    return { data: { ...user, status: 'ACTIVE' } };
  }

  @Put('users/:id/reset-password')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  @ApiOperation({ summary: '管理后台重置用户密码' })
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body('password') password?: string,
  ) {
    // 默认重置回 123456，方便老师忘密码时一键恢复
    const newPassword = password || '123456';
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: '密码已重置', data: { password: newPassword } };
  }

  @Delete('users/:id')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  @ApiOperation({ summary: '管理后台删除用户' })
  async deleteUser(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    if (id === req.user.id) {
      throw new ForbiddenException('不能删除当前登录账号');
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: '已删除' };
  }
}
