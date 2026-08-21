import { Injectable, Logger } from '@nestjs/common';
import { LedgerService } from '../../payments/ledger/ledger.service';
import { LedgerAccountType, LedgerDirection } from '../../payments/ledger/dto/create-transaction.dto';

/**
 * Settlement input for a completed food/grocery order.
 */
export interface OrderSettlementInput {
  orderId: string;
  customerId: string;
  merchantUserId: string;
  providerUserId?: string; // delivery provider (null if self-pickup)
  subtotal: number;
  deliveryFee: number;
  commissionAmount: number;
  tip: number;
  currency: string;
}

/**
 * OrderSettlementService
 *
 * Handles double-entry ledger settlement for completed food/grocery orders.
 * Creates a balanced transaction:
 * - Debit: customer wallet (total)
 * - Credit: merchant wallet (subtotal - commission)
 * - Credit: provider wallet (delivery fee - platform cut + tip)
 * - Credit: tenant revenue (commission + platform delivery cut)
 *
 * Follows the same pattern as FareSettlementService for rides.
 */
@Injectable()
export class OrderSettlementService {
  private readonly logger = new Logger(OrderSettlementService.name);

  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * Settle a completed order through the double-entry ledger.
   */
  async settle(tenantId: string, input: OrderSettlementInput) {
    const {
      orderId,
      customerId,
      merchantUserId,
      providerUserId,
      subtotal,
      deliveryFee,
      commissionAmount,
      tip,
      currency,
    } = input;

    const total = subtotal + deliveryFee + tip;
    const merchantEarnings = Math.round((subtotal - commissionAmount) * 100) / 100;

    // Platform takes a cut of delivery fee (same commission rate applied)
    const deliveryPlatformCut = Math.round(deliveryFee * 0.1 * 100) / 100; // 10% of delivery fee
    const providerEarnings = Math.round((deliveryFee - deliveryPlatformCut + tip) * 100) / 100;
    const tenantRevenue = Math.round((commissionAmount + deliveryPlatformCut) * 100) / 100;

    // Get or create accounts
    const customerAccount = await this.ledgerService.getOrCreateAccount(
      tenantId, customerId, LedgerAccountType.CUSTOMER_WALLET, currency,
    );
    const merchantAccount = await this.ledgerService.getOrCreateAccount(
      tenantId, merchantUserId, LedgerAccountType.MERCHANT_WALLET, currency,
    );
    const tenantRevenueAccount = await this.ledgerService.getOrCreateAccount(
      tenantId, null, LedgerAccountType.TENANT_REVENUE, currency,
    );

    const entries = [
      {
        accountId: customerAccount.id,
        amount: total.toFixed(2),
        direction: LedgerDirection.DEBIT,
      },
      {
        accountId: merchantAccount.id,
        amount: merchantEarnings.toFixed(2),
        direction: LedgerDirection.CREDIT,
      },
      {
        accountId: tenantRevenueAccount.id,
        amount: tenantRevenue.toFixed(2),
        direction: LedgerDirection.CREDIT,
      },
    ];

    // If there's a delivery provider, credit their earnings
    if (providerUserId && providerEarnings > 0) {
      const providerAccount = await this.ledgerService.getOrCreateAccount(
        tenantId, providerUserId, LedgerAccountType.PROVIDER_WALLET, currency,
      );
      entries.push({
        accountId: providerAccount.id,
        amount: providerEarnings.toFixed(2),
        direction: LedgerDirection.CREDIT,
      });
    } else {
      // No provider — delivery fee goes to tenant revenue
      entries[2].amount = (tenantRevenue + providerEarnings).toFixed(2);
    }

    await this.ledgerService.createTransaction(tenantId, {
      type: 'order_settlement',
      referenceId: orderId,
      description: `Order settlement for ${orderId}`,
      entries,
    });

    this.logger.log(
      `Order settled: ${orderId} total=${total} merchant=${merchantEarnings} provider=${providerEarnings} tenant=${tenantRevenue} ${currency}`,
    );

    return {
      total: total.toFixed(2),
      merchantEarnings: merchantEarnings.toFixed(2),
      providerEarnings: providerEarnings.toFixed(2),
      tenantRevenue: tenantRevenue.toFixed(2),
      currency,
    };
  }
}
