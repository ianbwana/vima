import { Injectable, Logger } from '@nestjs/common';
import { LedgerService } from '../../payments/ledger/ledger.service';
import { LedgerAccountType, LedgerDirection } from '../../payments/ledger/dto/create-transaction.dto';

export interface CourierSettlementInput {
  parcelId: string;
  senderId: string;
  providerId: string;
  deliveryFee: number;
  commissionRate: number;
  currency: string;
  codAmount?: number;
}

/**
 * CourierSettlementService
 *
 * Handles ledger settlement for delivered parcels.
 *
 * Standard delivery:
 * - Debit: sender wallet (delivery fee)
 * - Credit: courier wallet (fee - commission)
 * - Credit: tenant revenue (commission)
 *
 * COD (Cash on Delivery):
 * - Additional: Debit cash_in_transit (courier owes), Credit sender wallet (COD amount)
 * - Netted from courier earnings on payout
 */
@Injectable()
export class CourierSettlementService {
  private readonly logger = new Logger(CourierSettlementService.name);

  constructor(private readonly ledgerService: LedgerService) {}

  async settle(tenantId: string, input: CourierSettlementInput) {
    const { parcelId, senderId, providerId, deliveryFee, commissionRate, currency, codAmount } = input;

    const commission = Math.round(deliveryFee * commissionRate * 100) / 100;
    const courierEarnings = Math.round((deliveryFee - commission) * 100) / 100;

    // Get accounts
    const senderAccount = await this.ledgerService.getOrCreateAccount(
      tenantId, senderId, LedgerAccountType.CUSTOMER_WALLET, currency,
    );
    const courierAccount = await this.ledgerService.getOrCreateAccount(
      tenantId, providerId, LedgerAccountType.PROVIDER_WALLET, currency,
    );
    const tenantRevenue = await this.ledgerService.getOrCreateAccount(
      tenantId, null, LedgerAccountType.TENANT_REVENUE, currency,
    );

    // Delivery fee settlement
    const entries = [
      { accountId: senderAccount.id, amount: deliveryFee.toFixed(2), direction: LedgerDirection.DEBIT },
      { accountId: courierAccount.id, amount: courierEarnings.toFixed(2), direction: LedgerDirection.CREDIT },
      { accountId: tenantRevenue.id, amount: commission.toFixed(2), direction: LedgerDirection.CREDIT },
    ];

    await this.ledgerService.createTransaction(tenantId, {
      type: 'courier_delivery',
      referenceId: parcelId,
      description: `Courier delivery fee for parcel ${parcelId}`,
      entries,
    });

    // COD settlement (if applicable)
    if (codAmount && codAmount > 0) {
      const cashInTransit = await this.ledgerService.getOrCreateAccount(
        tenantId, providerId, LedgerAccountType.CASH_IN_TRANSIT, currency,
      );

      await this.ledgerService.createTransaction(tenantId, {
        type: 'cod_collection',
        referenceId: parcelId,
        description: `COD collection for parcel ${parcelId}`,
        entries: [
          { accountId: cashInTransit.id, amount: codAmount.toFixed(2), direction: LedgerDirection.DEBIT },
          { accountId: senderAccount.id, amount: codAmount.toFixed(2), direction: LedgerDirection.CREDIT },
        ],
      });
    }

    this.logger.log(
      `Courier settled: parcel=${parcelId} fee=${deliveryFee} courier=${courierEarnings} commission=${commission}${codAmount ? ` cod=${codAmount}` : ''} ${currency}`,
    );

    return { deliveryFee: deliveryFee.toFixed(2), courierEarnings: courierEarnings.toFixed(2), commission: commission.toFixed(2), currency };
  }
}
