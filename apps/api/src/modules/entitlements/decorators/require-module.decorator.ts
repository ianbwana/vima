import { SetMetadata } from '@nestjs/common';

export const REQUIRED_MODULE_KEY = 'required_module';

/**
 * Decorator to mark a controller or route as requiring a specific module entitlement.
 * Used with the ModuleGuard to enforce entitlement checks.
 *
 * Usage:
 *   @RequireModule('rides')
 *   @UseGuards(JwtAuthGuard, ModuleGuard)
 *   @Controller('rides')
 */
export const RequireModule = (module: string) => SetMetadata(REQUIRED_MODULE_KEY, module);
