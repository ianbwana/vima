import { Module } from '@nestjs/common';
import { HomeServicesController } from './controllers/home-services.controller';
import { HomeServicesAdminController } from './controllers/home-services-admin.controller';
import { HomeServicesService } from './services/home-services.service';

/**
 * HomeServicesModule
 *
 * Scheduled booking vertical with broadcast matching.
 * Different dispatch pattern from instant-dispatch modules (rides, courier):
 * - Scheduled time slots instead of ASAP
 * - Broadcast to all qualified providers instead of nearest-first
 * - Quote flow for non-standard jobs
 *
 * Gated behind 'home_services' module entitlement.
 */
@Module({
  controllers: [HomeServicesController, HomeServicesAdminController],
  providers: [HomeServicesService],
  exports: [HomeServicesService],
})
export class HomeServicesModule {}
