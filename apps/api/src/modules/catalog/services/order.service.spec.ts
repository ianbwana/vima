import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderService } from './order.service';
import { TenantDbService } from '../../../database/tenant-db.service';

describe('OrderService', () => {
  let service: OrderService;
  let mockTenantDb: any;
  let mockEventEmitter: Partial<EventEmitter2>;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
            orderBy: jest.fn().mockResolvedValue([]),
          }),
          orderBy: jest.fn().mockResolvedValue([]),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: 'order-1',
            customerId: 'customer-1',
            merchantId: 'merchant-1',
            status: 'placed',
            subtotal: '20.00',
            deliveryFee: '3.00',
            commissionAmount: '3.00',
            tip: '0.00',
            total: '23.00',
            currency: 'USD',
            placedAt: new Date(),
          }]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              id: 'order-1',
              status: 'accepted',
              merchantId: 'merchant-1',
            }]),
          }),
        }),
      }),
    };

    mockTenantDb = {
      getConnection: jest.fn().mockReturnValue(mockDb),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    service = new OrderService(
      mockTenantDb as TenantDbService,
      mockEventEmitter as EventEmitter2,
    );
  });

  describe('placeOrder()', () => {
    it('should create an order when merchant and items are valid', async () => {
      // Mock merchant exists and is active
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              id: 'merchant-1',
              status: 'active',
              commissionRate: '0.15',
            }]),
          }),
        }),
      });

      // Mock catalog item exists and is available
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              id: 'item-1',
              name: 'Burger',
              price: '10.00',
            }]),
          }),
        }),
      });

      const result = await service.placeOrder('tenant-1', 'customer-1', {
        merchantId: 'merchant-1',
        items: [{ catalogItemId: 'item-1', quantity: 2 }],
        deliveryFee: 3,
        currency: 'USD',
      });

      expect(result.id).toBe('order-1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.placed',
        expect.objectContaining({
          tenantId: 'tenant-1',
          orderId: 'order-1',
          merchantId: 'merchant-1',
          customerId: 'customer-1',
        }),
      );
    });

    it('should throw when merchant not found', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]), // No merchant
          }),
        }),
      });

      await expect(
        service.placeOrder('tenant-1', 'customer-1', {
          merchantId: 'nonexistent',
          items: [{ catalogItemId: 'item-1', quantity: 1 }],
        }),
      ).rejects.toThrow('Merchant not found or inactive');
    });

    it('should throw when item is unavailable', async () => {
      // Merchant found
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              id: 'merchant-1',
              status: 'active',
              commissionRate: '0.15',
            }]),
          }),
        }),
      });

      // Item NOT found (unavailable)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        service.placeOrder('tenant-1', 'customer-1', {
          merchantId: 'merchant-1',
          items: [{ catalogItemId: 'unavailable-item', quantity: 1 }],
        }),
      ).rejects.toThrow('not available');
    });
  });

  describe('acceptOrder()', () => {
    it('should transition order to accepted and emit event', async () => {
      const result = await service.acceptOrder('tenant-1', 'order-1', 'merchant-user-1');

      expect(result.status).toBe('accepted');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.accepted',
        expect.objectContaining({ tenantId: 'tenant-1', orderId: 'order-1' }),
      );
    });
  });

  describe('markReady()', () => {
    it('should transition order to ready and emit event', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              id: 'order-1',
              status: 'ready',
              merchantId: 'merchant-1',
            }]),
          }),
        }),
      });

      const result = await service.markReady('tenant-1', 'order-1');

      expect(result.status).toBe('ready');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.ready',
        expect.objectContaining({ tenantId: 'tenant-1', orderId: 'order-1' }),
      );
    });
  });

  describe('markDelivered()', () => {
    it('should transition order to delivered and emit event', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              id: 'order-1',
              status: 'delivered',
            }]),
          }),
        }),
      });

      const result = await service.markDelivered('tenant-1', 'order-1');

      expect(result.status).toBe('delivered');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.delivered',
        expect.objectContaining({ tenantId: 'tenant-1', orderId: 'order-1' }),
      );
    });
  });

  describe('cancelOrder()', () => {
    it('should transition order to cancelled and emit event', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              id: 'order-1',
              status: 'cancelled',
            }]),
          }),
        }),
      });

      const result = await service.cancelOrder('tenant-1', 'order-1', 'Changed mind');

      expect(result.status).toBe('cancelled');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.cancelled',
        expect.objectContaining({ tenantId: 'tenant-1', orderId: 'order-1' }),
      );
    });
  });
});
