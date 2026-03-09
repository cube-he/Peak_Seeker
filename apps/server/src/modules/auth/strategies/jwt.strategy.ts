import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    // Check if token is blacklisted (user has logged out)
    if (token) {
      const isBlacklisted = await this.redisService.isBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('令牌已失效，请重新登录');
      }
    }

    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      vipLevel: payload.vipLevel,
    };
  }
}
