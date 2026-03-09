import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const VIP_LEVEL_ORDER: Record<string, number> = {
  FREE: 0,
  BASIC: 1,
  PREMIUM: 2,
  EXPERT: 3,
};

@Injectable()
export class VipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredLevel = this.reflector.getAllAndOverride<string>('vipLevel', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredLevel) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('请先登录');
    }

    // Check VIP expiration
    if (user.vipExpireAt && new Date(user.vipExpireAt) < new Date()) {
      throw new ForbiddenException('VIP 会员已过期，请续费');
    }

    const userLevel = VIP_LEVEL_ORDER[user?.vipLevel] || 0;
    const required = VIP_LEVEL_ORDER[requiredLevel] || 0;

    if (userLevel < required) {
      throw new ForbiddenException(`此功能需要 ${requiredLevel} 及以上会员等级`);
    }

    return true;
  }
}
