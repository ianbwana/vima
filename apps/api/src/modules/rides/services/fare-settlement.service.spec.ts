import { FareSettlementService } from './fare-settlement.service';
import { LedgerService } from '../../payments/ledger/ledger.service';
import { LedgerAccountType, LedgerDirection } from '../../payments/ledger/dto/create-transaction.dto';

describe('FareSettlementService', () => {
  let service: FareSettlementService;
  let mockLedgerService: Partial<LedgerService>;

  beforeEach(() => {
    mockLedgerService = {
      getOrCreateAccount: jest.fn().mockImplementation((tenantId, userId, type) => ({
        id: `account-${type}-${userId || 'system'}`,
        userId,
        type,
        currency: 'USD',
      })),
      createTransaction: jest.fn().mockResolvedValue({
        id: 'tx-1',
        type: 'fare',
        entries: [],
        createdAt: new Date(),
      }),
    };

    service = new FareSettlementService(mockLedgerService as LedgerService);
  });

  describe('settle()', () => {
    it('should create balanced ledger transaction with correct splits', async () => {
      const result = await service.settle('tenant-1', {
        tripId: 'trip-1',
        customerId: 'customer-1',
        providerId: 'provider-1',
        totalFare: 20.00,
        commissionRate: 0.20,
        currency: 'USD',
      });

      expect(result.totalFare).toBe('20.00');
      expect(result.commission).toBe('4.00');       // 20 * 0.20
      expect(result.providerEarnings).toBe('16.00'); // 20 - 4
      expect(result.currency).toBe('USD');
    });

    it('should get/create all three accounts', async () => {
      await service.settle('tenant-1', {
        tripId: 'trip-1',
        customerId: 'customer-1',
        providerId: 'provider-1',
        totalFare: 10.00,
        commissionRate: 0.20,
        currency: 'KES',
      });

      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', 'customer-1', LedgerAccountType.CUSTOMER_WALLET, 'KES',
      );
      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', 'provider-1', LedgerAccountType.PROVIDER_WALLET, 'KES',
      );
      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', null, LedgerAccountType.TENANT_REVENUE, 'KES',
      );
    });

    it('should create transaction with type "fare" and correct entries', async () => {
      await service.settle('tenant-1', {
        tripId: 'trip-1',
        customerId: 'customer-1',
        providerId: 'provider-1',
        totalFare: 100.00,
        commissionRate: 0.25,
        currency: 'USD',
      });

      expect(mockLedgerService.createTransaction).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          type: 'fare',
          referenceId: 'trip-1',
          entries: [
            {
              accountId: `account-${LedgerAccountType.CUSTOMER_WALLET}-customer-1`,
              amount: '100.00',
              direction: LedgerDirection.DEBIT,
            },
            {
              accountId: `account-${LedgerAccountType.PROVIDER_WALLET}-provider-1`,
              amount: '75.00', // 100 - 25
              direction: LedgerDirection.CREDIT,
            },
            {
              accountId: `account-${LedgerAccountType.TENANT_REVENUE}-system`,
              amount: '25.00', // 100 * 0.25
              direction: LedgerDirection.CREDIT,
            },
          ],
        }),
      );
    });

    it('should handle 0% commission', async () => {
      const result = await service.settle('tenant-1', {
        tripId: 'trip-1',
        customerId: 'customer-1',
        providerId: 'provider-1',
        totalFare: 50.00,
        commissionRate: 0,
        currency: 'USD',
      });

      expect(result.commission).toBe('0.00');
      expect(result.providerEarnings).toBe('50.00');
    });

    it('should handle fractional amounts correctly', async () => {
      const result = await service.settle('tenant-1', {
        tripId: 'trip-1',
        customerId: 'customer-1',
        providerId: 'provider-1',
        totalFare: 15.99,
        commissionRate: 0.20,
        currency: 'USD',
      });

      // 15.99 * 0.20 = 3.198 → rounded to 3.20
      expect(result.commission).toBe('3.20');
      // 15.99 - 3.20 = 12.79
      expect(result.providerEarnings).toBe('12.79');
    });
  });
});
