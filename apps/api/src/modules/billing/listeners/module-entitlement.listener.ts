import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  ModuleEnabledEvent,
  ModuleDisabledEvent,
} from '../../entitlements/events/module-status-changed.event';

/**
 * Listens for module enable/disable events from the EntitlementsModule
 * and synchronises Stripe subscription items accordingly.
 *
 * When a tenant enables a module, we add a subscription item in Stripe.
 * When a tenant disables a module, we remove the subscription item.
 *
 * Pricing convention: price_{module}_monthly (matches the plan tier pattern)
 *
 * Requirements: 7.2, 10.4
 */
@Injectable()
export class ModuleEntitlementListener {
  private readonly logger = new Logger(ModuleEntitlementListener.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  @OnEvent(ModuleEnabledEvent.event)
  async handleModuleEnabled(event: ModuleEnabledEvent): Promise<void> {
    const { tenantId, module } = event;

    this.logger.log(
      `Module enabled event received: tenant=${tenantId} module=${module}`,
    );

    try {
      const priceId = `price_${module}_monthly`;
      await this.subscriptionService.addModuleItem(tenantId, module, priceId, '0.00');
      this.logger.log(
        `Subscription item added for module "${module}" on tenant ${tenantId}`,
      );
    } catch (error) {
      // Log but don't throw — we don't want to block the entitlement update
      // if the billing sync fails. The subscription can be reconciled later.
      this.logger.error(
        `Failed to add subscription item for module "${module}" on tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(ModuleDisabledEvent.event)
  async handleModuleDisabled(event: ModuleDisabledEvent): Promise<void> {
    const { tenantId, module } = event;

    this.logger.log(
      `Module disabled event received: tenant=${tenantId} module=${module}`,
    );

    try {
      await this.subscriptionService.removeModuleItem(tenantId, module);
      this.logger.log(
        `Subscription item removed for module "${module}" on tenant ${tenantId}`,
      );
    } catch (error) {
      // Log but don't throw — same reasoning as above
      this.logger.error(
        `Failed to remove subscription item for module "${module}" on tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
    }
  }
}
