import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract the resolved tenant ID from the request.
 * Usage: @TenantId() tenantId: string
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId;
  },
);
