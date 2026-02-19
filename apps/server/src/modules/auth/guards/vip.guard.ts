import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const VIP_LEVEL_ORDER = {
  FREE: 0,
  BASIC: 1,
  PREMIUM: 2,
  EXPERT: 3,
};

@Injectable()
export class VipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredLevel = this.reflector.get<string>(
      'vipLevel',
      context.getHandler(),
    );
    if (!requiredLevel) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const userLevel = VIP_LEVEL_ORDER[user?.vipLevel] || 0;
    const required = VIP_LEVEL_ORDER[requiredLevel] || 0;

    return userLevel >= required;
  }
}
