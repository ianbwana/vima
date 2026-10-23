import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformAdminAuthController } from './platform-admin-auth.controller';

/**
 * Platform-admin module: authentication and platform-scoped operations for
 * Vima administrators. Imports IdentityModule to reuse the configured
 * JwtModule and the passport JWT strategy.
 */
@Module({
  imports: [IdentityModule],
  controllers: [PlatformAdminAuthController],
  providers: [PlatformAdminAuthService],
})
export class PlatformAdminModule {}
