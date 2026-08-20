import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { IdentityModule } from './modules/identity/identity.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { BillingModule } from './modules/billing/billing.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { RidesModule } from './modules/rides/rides.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { FoodModule } from './modules/food/food.module';
import { GroceriesModule } from './modules/groceries/groceries.module';
import { CourierModule } from './modules/courier/courier.module';
import { HomeServicesModule } from './modules/home-services/home-services.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.getOrThrow<string>('REDIS_URL');
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
          },
        };
      },
    }),
    DatabaseModule,
    TenancyModule,
    IdentityModule,
    EntitlementsModule,
    PaymentsModule,
    BillingModule,
    WebhookModule,
    RidesModule,
    CatalogModule,
    FoodModule,
    GroceriesModule,
    CourierModule,
    HomeServicesModule,
    DashboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
