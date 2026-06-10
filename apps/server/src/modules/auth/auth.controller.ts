import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CheckPolicies, PoliciesGuard } from '../casl';

// access_token cookie 用 HttpOnly, 防 XSS 偷 token. middleware 仍可读 (HttpOnly 只阻止 JS).
// SameSite=Lax 兼容跨页跳转, Secure 在 prod 启用 (本地 http://132.232.245.53 不强制).
const ACCESS_TOKEN_COOKIE = 'access_token';
const ACCESS_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 天, 和前端原 cookie 一致
function setAccessTokenCookie(res: Response, token: string) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true',
  });
}
function clearAccessTokenCookie(res: Response) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
}

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 注册已关闭对外开放：账号统一由管理员在后台创建。
  // 保留路由但加管理员守卫，公开访问返回 401。
  @Post('register')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户注册（仅管理员）' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录' })
  async login(
    @Body() dto: LoginDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const result = await this.authService.login(dto, ip);
    if (result?.accessToken) {
      setAccessTokenCookie(res, result.accessToken);
    }
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登出' })
  async logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    clearAccessTokenCookie(res);
    return this.authService.logout(token);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新令牌' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refreshToken(dto.refreshToken);
    if (result?.accessToken) {
      setAccessTokenCookie(res, result.accessToken);
    }
    return result;
  }
}
