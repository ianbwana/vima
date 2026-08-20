import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
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
    // Apply tenant resolution to all routes except platform-admin and health
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude('health', 'platform-admin/(.*)')
      .forRoutes('*');
  }
}
