import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PaymentsModule } from '../payments/payments.module';
import { RidesController } from './controllers/rides.controller';
import { RidesAdminController } from './controllers/rides-admin.controller';
import { RideGateway } from './gateway/ride.gateway';
import { RideService } from './services/ride.service';
import { FareService } from './services/fare.service';
import { DispatchService } from './services/dispatch.service';
import { DriverLocationService } from './services/driver-location.service';
import { FareSettlementService } from './services/fare-settlement.service';

/**
 * RidesModule
 *
 * First vertical module: ride-hailing.
 * Exercises the full logistics pipeline: dispatch, realtime tracking,
 * fare calculation, and payment settlement.
 *
 * Depends on:
 * - PaymentsModule (LedgerService for fare settlement)
 * - DatabaseModule (TenantDbService, global)
 * - RedisModule (REDIS_CLIENT, global)
 * - JwtModule (for WebSocket auth in RideGateway)
 *
 * Gated behind 'rides' module entitlement at the controller level.
 */
@Module({
  imports: [
    PaymentsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [RidesController, RidesAdminController],
  providers: [
    RideService,
    FareService,
    DispatchService,
    DriverLocationService,
    FareSettlementService,
    RideGateway,
  ],
  exports: [RideService, FareService, DriverLocationService],
})
export class RidesModule {}
