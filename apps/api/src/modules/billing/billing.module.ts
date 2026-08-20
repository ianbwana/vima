import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StripeBillingClient } from './stripe-billing.client';
import { SubscriptionService } from './subscription/subscription.service';
import { SubscriptionController } from './subscription/subscription.controller';
import { UsageService } from './usage/usage.service';
import { UsagePushProcessor } from './usage/usage-push.processor';
import { UsageController } from './usage/usage.controller';
import { ModuleEntitlementListener } from './listeners/module-entitlement.listener';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'usage-push',
    }),
  ],
  controllers: [SubscriptionController, UsageController],
  providers: [
    StripeBillingClient,
    SubscriptionService,
    UsageService,
    UsagePushProcessor,
    ModuleEntitlementListener,
  ],
  exports: [SubscriptionService, UsageService, StripeBillingClient],
})
export class BillingModule {}
