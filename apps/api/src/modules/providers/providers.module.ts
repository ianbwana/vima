import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ProvidersController } from './providers.controller';

/**
 * ProvidersModule
 *
 * Exposes tenant-scoped provider listing. Imports IdentityModule so the
 * passport JWT strategy (used by JwtAuthGuard) is available. TenantDbService
 * is provided globally by DatabaseModule.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ProvidersController],
})
export class ProvidersModule {}
