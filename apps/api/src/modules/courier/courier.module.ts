import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { RidesModule } from '../rides/rides.module';
import { CourierController } from './controllers/courier.controller';
import { CourierService } from './services/courier.service';
import { CourierSettlementService } from './services/courier-settlement.service';

/**
 * CourierModule
 *
 * Parcel delivery vertical. Reuses the ride-hailing dispatch engine
 * (DispatchService, DriverLocationService) with 'parcel' job type.
 * Adds: package categories, COD collection, proof of delivery.
 *
 * Gated behind 'courier' module entitlement.
 */
@Module({
  imports: [PaymentsModule, RidesModule],
  controllers: [CourierController],
  providers: [CourierService, CourierSettlementService],
  exports: [CourierService],
})
export class CourierModule {}
