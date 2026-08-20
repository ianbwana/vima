import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from '../entitlements.service';
import { REQUIRED_MODULE_KEY } from '../decorators/require-module.decorator';

/**
 * Guard that checks if the resolved tenant has access to a specific module.
 * Works in combination with @RequireModule() decorator.
 *
 * Usage:
 *   @RequireModule('rides')
 *   @UseGuards(JwtAuthGuard, ModuleGuard)
 *   @Get('rides/estimate')
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(REQUIRED_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No module requirement set — allow
    if (!requiredModule) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }

    const hasAccess = await this.entitlementsService.checkModuleAccess(tenantId, requiredModule);

    if (!hasAccess) {
      throw new ForbiddenException(
        `Module "${requiredModule}" is not enabled for this tenant`,
      );
    }

    return true;
  }
}
