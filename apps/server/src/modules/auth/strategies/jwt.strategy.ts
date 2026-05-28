import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RedisService } from '../../../redis/redis.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayloadUser, PermissionOverride } from '../../casl/types';

// 从 cookie header 提取 access_token (无 cookie-parser 依赖, 手工 parse).
// 让浏览器原生标签 (<a href> 下载 / <img src> 图片) 也能走 HttpOnly cookie 鉴权.
function extractTokenFromCookie(req: Request): string | null {
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const tokenExtractor = ExtractJwt.fromExtractors([
  ExtractJwt.fromAuthHeaderAsBearerToken(),
  extractTokenFromCookie,
]);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: tokenExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any): Promise<JwtPayloadUser> {
    const token = tokenExtractor(req);

    // Check if token is blacklisted (user has logged out)
    if (token) {
      const isBlacklisted = await this.redisService.isBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('令牌已失效，请重新登录');
      }
    }

    // Load fresh permissionOverrides from DB so admin changes take effect immediately
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { permissionOverrides: true },
    });

    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      teacherProfileId: payload.teacherProfileId ?? undefined,
      studentProfileId: payload.studentProfileId ?? undefined,
      isSupervisor: payload.isSupervisor ?? false,
      permissionOverrides: (user?.permissionOverrides as PermissionOverride[] | null) ?? undefined,
    };
  }
}
