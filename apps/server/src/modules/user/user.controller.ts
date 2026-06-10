import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateExamInfoDto } from './dto/update-exam-info.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeUsernameDto } from './dto/change-username.dto';
import { PermissionOverride } from '../casl/types';

@ApiTags('用户')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  async getMe(@Request() req: any) {
    const user = await this.userService.findById(req.user.id);
    if (!user) return null;
    const { passwordHash, ...result } = user;
    return result;
  }

  @Put('me')
  @ApiOperation({ summary: '更新个人信息' })
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    const user = await this.userService.updateProfile(req.user.id, dto);
    const { passwordHash, ...result } = user;
    return result;
  }

  @Put('me/exam-info')
  @ApiOperation({ summary: '更新考试信息' })
  async updateExamInfo(@Request() req: any, @Body() dto: UpdateExamInfoDto) {
    const user = await this.userService.updateExamInfo(req.user.id, dto);
    const { passwordHash, ...result } = user;
    return result;
  }

  @Put('me/preferences')
  @ApiOperation({ summary: '更新偏好设置' })
  async updatePreferences(
    @Request() req: any,
    @Body() dto: UpdatePreferencesDto,
  ) {
    const user = await this.userService.updatePreferences(req.user.id, dto);
    const { passwordHash, ...result } = user;
    return result;
  }

  @Put('me/password')
  @ApiOperation({ summary: '修改密码' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(
      req.user.id,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  @Put('me/username')
  @ApiOperation({ summary: '修改用户名' })
  async changeUsername(@Request() req: any, @Body() dto: ChangeUsernameDto) {
    return this.userService.changeUsername(req.user.id, dto.username);
  }

  // ── Admin endpoints ─────────────────────────────────────

  @Get('admin/all')
  @ApiOperation({ summary: '管理员获取所有用户列表' })
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  async findAllUsers(
    @Query('role') role?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const where: Record<string, any> = {};

    if (role) {
      where.role = role;
    }

    if (keyword) {
      where.OR = [
        { realName: { contains: keyword } },
        { username: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    return this.userService.findMany(
      where,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Put('admin/:id/permissions')
  @ApiOperation({ summary: '管理员设置用户权限覆盖' })
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  async updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body('overrides') overrides: PermissionOverride[],
  ) {
    return this.userService.updatePermissionOverrides(id, overrides);
  }

  @Get('admin/:id/permissions')
  @ApiOperation({ summary: '管理员查看用户有效权限' })
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  async getPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getEffectivePermissions(id);
  }
}
