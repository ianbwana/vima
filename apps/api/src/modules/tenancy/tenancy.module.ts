import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TenantResolutionMiddleware } from './middleware/tenant-resolution.middleware';
import { TenancyService } from './tenancy.service';
import { TenancyController } from './tenancy.controller';
import { ProvisioningProcessor } from './provisioning.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'provisioning',
    }),
  ],
  controllers: [TenancyController],
  providers: [TenancyService, ProvisioningProcessor],
  exports: [TenancyService],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant resolution to all routes except platform-admin, health,
    // and public tenant self-service signup (POST /tenants creates a new tenant
    // before any tenant context exists — it must not require resolution).
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude(
        'health',
        'platform-admin/(.*)',
        { path: 'tenants', method: RequestMethod.POST },
        // Platform admin lists all tenants — authenticated via JWT platform_admin
        // role, so there is no single tenant context to resolve.
        { path: 'tenants', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
