import { OrderSettlementService } from './order-settlement.service';
import { LedgerService } from '../../payments/ledger/ledger.service';
import { LedgerAccountType, LedgerDirection } from '../../payments/ledger/dto/create-transaction.dto';

describe('OrderSettlementService', () => {
  let service: OrderSettlementService;
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
        type: 'order_settlement',
        entries: [],
        createdAt: new Date(),
      }),
    };

    service = new OrderSettlementService(mockLedgerService as LedgerService);
  });

  describe('settle()', () => {
    it('should settle order with merchant + provider + tenant revenue', async () => {
      const result = await service.settle('tenant-1', {
        orderId: 'order-1',
        customerId: 'customer-1',
        merchantUserId: 'merchant-user-1',
        providerUserId: 'provider-1',
        subtotal: 50.00,
        deliveryFee: 5.00,
        commissionAmount: 7.50, // 15% of 50
        tip: 2.00,
        currency: 'USD',
      });

      expect(result.total).toBe('57.00'); // 50 + 5 + 2
      expect(result.merchantEarnings).toBe('42.50'); // 50 - 7.50
      expect(parseFloat(result.providerEarnings)).toBeGreaterThan(0); // delivery fee - platform cut + tip
      expect(parseFloat(result.tenantRevenue)).toBeGreaterThan(0);
      expect(result.currency).toBe('USD');
    });

    it('should get/create correct account types', async () => {
      await service.settle('tenant-1', {
        orderId: 'order-1',
        customerId: 'customer-1',
        merchantUserId: 'merchant-user-1',
        providerUserId: 'provider-1',
        subtotal: 30.00,
        deliveryFee: 3.00,
        commissionAmount: 4.50,
        tip: 0,
        currency: 'KES',
      });

      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', 'customer-1', LedgerAccountType.CUSTOMER_WALLET, 'KES',
      );
      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', 'merchant-user-1', LedgerAccountType.MERCHANT_WALLET, 'KES',
      );
      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', null, LedgerAccountType.TENANT_REVENUE, 'KES',
      );
      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', 'provider-1', LedgerAccountType.PROVIDER_WALLET, 'KES',
      );
    });

    it('should handle order without delivery provider', async () => {
      const result = await service.settle('tenant-1', {
        orderId: 'order-2',
        customerId: 'customer-1',
        merchantUserId: 'merchant-user-1',
        providerUserId: undefined, // self-pickup
        subtotal: 25.00,
        deliveryFee: 0,
        commissionAmount: 3.75,
        tip: 0,
        currency: 'USD',
      });

      expect(result.total).toBe('25.00');
      expect(result.merchantEarnings).toBe('21.25'); // 25 - 3.75
      expect(result.providerEarnings).toBe('0.00');

      // Should NOT create a provider account
      expect(mockLedgerService.getOrCreateAccount).not.toHaveBeenCalledWith(
        expect.anything(), undefined, LedgerAccountType.PROVIDER_WALLET, expect.anything(),
      );
    });

    it('should create ledger transaction with type order_settlement', async () => {
      await service.settle('tenant-1', {
        orderId: 'order-3',
        customerId: 'c1',
        merchantUserId: 'm1',
        providerUserId: 'p1',
        subtotal: 100.00,
        deliveryFee: 10.00,
        commissionAmount: 15.00,
        tip: 5.00,
        currency: 'USD',
      });

      expect(mockLedgerService.createTransaction).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          type: 'order_settlement',
          referenceId: 'order-3',
          entries: expect.arrayContaining([
            expect.objectContaining({ direction: LedgerDirection.DEBIT }),
            expect.objectContaining({ direction: LedgerDirection.CREDIT }),
          ]),
        }),
      );
    });

    it('should pass tip to provider earnings', async () => {
      const result = await service.settle('tenant-1', {
        orderId: 'order-4',
        customerId: 'c1',
        merchantUserId: 'm1',
        providerUserId: 'p1',
        subtotal: 40.00,
        deliveryFee: 5.00,
        commissionAmount: 6.00,
        tip: 10.00, // Large tip
        currency: 'USD',
      });

      // Provider gets: (5 - 0.50 platform cut) + 10 tip = 14.50
      expect(parseFloat(result.providerEarnings)).toBe(14.50);
    });

    it('should handle zero tip and zero delivery fee', async () => {
      const result = await service.settle('tenant-1', {
        orderId: 'order-5',
        customerId: 'c1',
        merchantUserId: 'm1',
        providerUserId: 'p1',
        subtotal: 20.00,
        deliveryFee: 0,
        commissionAmount: 3.00,
        tip: 0,
        currency: 'USD',
      });

      expect(result.total).toBe('20.00');
      expect(result.merchantEarnings).toBe('17.00');
    });
  });
});
