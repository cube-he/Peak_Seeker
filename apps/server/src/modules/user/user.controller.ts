import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateExamInfoDto } from './dto/update-exam-info.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

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
}
