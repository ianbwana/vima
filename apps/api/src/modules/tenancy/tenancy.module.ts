import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { TenantResolutionMiddleware } from './middleware/tenant-resolution.middleware';
import { TenancyService } from './tenancy.service';
import { TenancyController } from './tenancy.controller';
import { ProvisioningProcessor } from './provisioning.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'provisioning',
    }),
    // Public signup creates a Postgres database per call, so it is rate
    // limited per client IP (see @Throttle on TenancyController.create).
    ThrottlerModule.forRoot([
      {
        name: 'signup',
        ttl: 60 * 60 * 1000,
        limit: Number(process.env.SIGNUP_RATE_LIMIT_PER_HOUR) || 5,
      },
    ]),
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
