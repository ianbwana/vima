import { CourierSettlementService } from './courier-settlement.service';
import { LedgerService } from '../../payments/ledger/ledger.service';
import { LedgerAccountType, LedgerDirection } from '../../payments/ledger/dto/create-transaction.dto';

describe('CourierSettlementService', () => {
  let service: CourierSettlementService;
  let mockLedgerService: Partial<LedgerService>;

  beforeEach(() => {
    mockLedgerService = {
      getOrCreateAccount: jest.fn().mockImplementation((tenantId, userId, type) => ({
        id: `account-${type}-${userId || 'system'}`,
        userId,
        type,
        currency: 'USD',
      })),
      createTransaction: jest.fn().mockResolvedValue({ id: 'tx-1', entries: [] }),
    };

    service = new CourierSettlementService(mockLedgerService as LedgerService);
  });

  describe('settle()', () => {
    it('should settle standard delivery fee correctly', async () => {
      const result = await service.settle('tenant-1', {
        parcelId: 'parcel-1',
        senderId: 'sender-1',
        providerId: 'courier-1',
        deliveryFee: 10.00,
        commissionRate: 0.20,
        currency: 'USD',
      });

      expect(result.deliveryFee).toBe('10.00');
      expect(result.commission).toBe('2.00');
      expect(result.courierEarnings).toBe('8.00');
      expect(result.currency).toBe('USD');
    });

    it('should create delivery fee ledger transaction', async () => {
      await service.settle('tenant-1', {
        parcelId: 'parcel-1',
        senderId: 'sender-1',
        providerId: 'courier-1',
        deliveryFee: 15.00,
        commissionRate: 0.25,
        currency: 'KES',
      });

      expect(mockLedgerService.createTransaction).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          type: 'courier_delivery',
          referenceId: 'parcel-1',
          entries: expect.arrayContaining([
            expect.objectContaining({ direction: LedgerDirection.DEBIT, amount: '15.00' }),
            expect.objectContaining({ direction: LedgerDirection.CREDIT }),
          ]),
        }),
      );
    });

    it('should handle COD settlement separately', async () => {
      await service.settle('tenant-1', {
        parcelId: 'parcel-1',
        senderId: 'sender-1',
        providerId: 'courier-1',
        deliveryFee: 8.00,
        commissionRate: 0.20,
        currency: 'USD',
        codAmount: 50.00,
      });

      // Should create 2 transactions: delivery fee + COD
      expect(mockLedgerService.createTransaction).toHaveBeenCalledTimes(2);

      // COD transaction
      expect(mockLedgerService.createTransaction).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          type: 'cod_collection',
          entries: expect.arrayContaining([
            expect.objectContaining({ amount: '50.00', direction: LedgerDirection.DEBIT }),
            expect.objectContaining({ amount: '50.00', direction: LedgerDirection.CREDIT }),
          ]),
        }),
      );
    });

    it('should not create COD transaction when codAmount is 0', async () => {
      await service.settle('tenant-1', {
        parcelId: 'parcel-1',
        senderId: 'sender-1',
        providerId: 'courier-1',
        deliveryFee: 5.00,
        commissionRate: 0.20,
        currency: 'USD',
        codAmount: 0,
      });

      // Only delivery fee transaction
      expect(mockLedgerService.createTransaction).toHaveBeenCalledTimes(1);
    });

    it('should get correct account types for COD', async () => {
      await service.settle('tenant-1', {
        parcelId: 'parcel-1',
        senderId: 'sender-1',
        providerId: 'courier-1',
        deliveryFee: 5.00,
        commissionRate: 0.20,
        currency: 'USD',
        codAmount: 25.00,
      });

      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        'tenant-1', 'courier-1', LedgerAccountType.CASH_IN_TRANSIT, 'USD',
      );
    });
  });
});
