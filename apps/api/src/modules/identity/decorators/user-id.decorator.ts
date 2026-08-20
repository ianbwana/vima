import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract the authenticated user's ID (sub claim) from the JWT payload.
 * Usage: @UserId() userId: string
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.sub;
  },
);
