import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard that restricts access to platform admins.
 * Checks the user's role from the JWT payload against the required roles.
 * If no @Roles() decorator is applied, defaults to requiring 'platform_admin'.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Default to platform_admin if no explicit roles specified
    const roles = requiredRoles ?? ['platform_admin'];

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException(
        'Access restricted to platform administrators',
      );
    }

    return true;
  }
}
