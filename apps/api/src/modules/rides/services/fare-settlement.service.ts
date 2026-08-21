import { Injectable, Logger } from '@nestjs/common';
import { LedgerService } from '../../payments/ledger/ledger.service';
import { LedgerAccountType, LedgerDirection } from '../../payments/ledger/dto/create-transaction.dto';
import { FareSettlement } from '../interfaces/ride.interfaces';

/**
 * Input for fare settlement.
 */
export interface SettlementInput {
  tripId: string;
  customerId: string;
  providerId: string;
  totalFare: number;
  commissionRate: number; // e.g., 0.20 for 20%
  currency: string;
}

/**
 * FareSettlementService
 *
 * Handles the double-entry ledger settlement for completed trips.
 * Creates a balanced transaction:
 * - Debit: customer wallet (total fare)
 * - Credit: provider wallet (fare - commission)
 * - Credit: tenant revenue (commission)
 *
 * Uses the existing LedgerService from PaymentsModule.
 */
@Injectable()
export class FareSettlementService {
  private readonly logger = new Logger(FareSettlementService.name);

  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * Settle a completed trip's fare through the ledger.
   *
   * @returns The settlement breakdown
   */
  async settle(tenantId: string, input: SettlementInput): Promise<FareSettlement> {
    const { tripId, customerId, providerId, totalFare, commissionRate, currency } = input;

    // Calculate splits
    const commission = Math.round(totalFare * commissionRate * 100) / 100;
    const providerEarnings = Math.round((totalFare - commission) * 100) / 100;

    // Get or create ledger accounts
    const customerAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      customerId,
      LedgerAccountType.CUSTOMER_WALLET,
      currency,
    );

    const providerAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      providerId,
      LedgerAccountType.PROVIDER_WALLET,
      currency,
    );

    const tenantRevenueAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      null, // System account
      LedgerAccountType.TENANT_REVENUE,
      currency,
    );

    // Create balanced ledger transaction
    await this.ledgerService.createTransaction(tenantId, {
      type: 'fare',
      referenceId: tripId,
      description: `Ride fare settlement for trip ${tripId}`,
      entries: [
        {
          accountId: customerAccount.id,
          amount: totalFare.toFixed(2),
          direction: LedgerDirection.DEBIT,
        },
        {
          accountId: providerAccount.id,
          amount: providerEarnings.toFixed(2),
          direction: LedgerDirection.CREDIT,
        },
        {
          accountId: tenantRevenueAccount.id,
          amount: commission.toFixed(2),
          direction: LedgerDirection.CREDIT,
        },
      ],
    });

    this.logger.log(
      `Fare settled: trip=${tripId} total=${totalFare} provider=${providerEarnings} commission=${commission} ${currency}`,
    );

    return {
      totalFare: totalFare.toFixed(2),
      commission: commission.toFixed(2),
      providerEarnings: providerEarnings.toFixed(2),
      currency,
    };
  }
}
