import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayloadUser } from '@modules/casl/types';

/**
 * Extract the authenticated user from the request.
 *
 * @example
 * @CurrentUser() user: JwtPayloadUser          // full user object
 * @CurrentUser('id') userId: number             // single field
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayloadUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser;
    return field ? user?.[field] : user;
  },
);
