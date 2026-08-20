import { HomeServicesService } from './home-services.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantDbService } from '../../../database/tenant-db.service';

describe('HomeServicesService', () => {
  let service: HomeServicesService;
  let mockTenantDb: any;
  let mockEventEmitter: Partial<EventEmitter2>;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            // Return a thenable that also has .limit() and .orderBy()
            const result: any = Promise.resolve([]);
            result.limit = jest.fn().mockResolvedValue([]);
            result.orderBy = jest.fn().mockResolvedValue([]);
            return result;
          }),
          orderBy: jest.fn().mockResolvedValue([]),
        })),
      })),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: 'booking-1',
            customerId: 'customer-1',
            categoryId: 'cat-1',
            status: 'pending',
            scheduledDate: '2026-09-01',
            scheduledTime: '10:00',
            currency: 'USD',
            createdAt: new Date(),
          }]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              id: 'booking-1',
              status: 'confirmed',
              providerId: 'provider-1',
              customerId: 'customer-1',
            }]),
          }),
        }),
      }),
    };

    mockTenantDb = { getConnection: jest.fn().mockReturnValue(mockDb) };
    mockEventEmitter = { emit: jest.fn() };

    service = new HomeServicesService(
      mockTenantDb as TenantDbService,
      mockEventEmitter as EventEmitter2,
    );
  });

  describe('createBooking()', () => {
    it('should create a booking and emit event', async () => {
      const result = await service.createBooking('tenant-1', 'customer-1', {
        categoryId: 'cat-1',
        scheduledDate: '2026-09-01',
        scheduledTime: '10:00',
      });

      expect(result.id).toBe('booking-1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.created',
        expect.objectContaining({ tenantId: 'tenant-1', bookingId: 'booking-1' }),
      );
    });

    it('should calculate price for fixed-type price card', async () => {
      // Mock price card lookup
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              id: 'pc-1',
              type: 'fixed',
              price: '50.00',
            }]),
          }),
        }),
      });

      await service.createBooking('tenant-1', 'customer-1', {
        categoryId: 'cat-1',
        priceCardId: 'pc-1',
        scheduledDate: '2026-09-01',
        scheduledTime: '14:00',
      });

      // Should insert with quotedPrice
      const insertCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertCall.quotedPrice).toBe('50');
    });

    it('should calculate hourly price based on duration', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              id: 'pc-2',
              type: 'hourly',
              price: '30.00',
            }]),
          }),
        }),
      });

      await service.createBooking('tenant-1', 'customer-1', {
        categoryId: 'cat-1',
        priceCardId: 'pc-2',
        scheduledDate: '2026-09-01',
        scheduledTime: '09:00',
        durationHours: 3,
      });

      const insertCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertCall.quotedPrice).toBe('90'); // 30 * 3
    });
  });

  describe('acceptBooking()', () => {
    it('should assign provider and emit confirmed event', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              id: 'booking-1',
              status: 'pending',
              customerId: 'customer-1',
            }]),
          }),
        }),
      });

      const result = await service.acceptBooking('tenant-1', 'booking-1', 'provider-1');

      expect(result.status).toBe('confirmed');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.confirmed',
        expect.objectContaining({
          tenantId: 'tenant-1',
          bookingId: 'booking-1',
          providerId: 'provider-1',
        }),
      );
    });

    it('should throw when booking not found or already assigned', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        service.acceptBooking('tenant-1', 'nonexistent', 'provider-1'),
      ).rejects.toThrow('Booking not found or already assigned');
    });
  });

  describe('submitQuote()', () => {
    it('should create a quote and emit event', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: 'quote-1',
            bookingId: 'booking-1',
            providerId: 'provider-1',
            price: '150.00',
            status: 'pending',
          }]),
        }),
      });

      const result = await service.submitQuote('tenant-1', 'provider-1', {
        bookingId: 'booking-1',
        price: 150,
        description: 'Full kitchen renovation',
      });

      expect(result.id).toBe('quote-1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.quote_submitted',
        expect.objectContaining({
          tenantId: 'tenant-1',
          bookingId: 'booking-1',
          quoteId: 'quote-1',
        }),
      );
    });
  });

  describe('completeJob()', () => {
    it('should mark booking as completed with photos', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              id: 'booking-1',
              status: 'completed',
              customerId: 'customer-1',
            }]),
          }),
        }),
      });

      const result = await service.completeJob('tenant-1', 'booking-1', 'provider-1', ['photo1.jpg', 'photo2.jpg']);

      expect(result.status).toBe('completed');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'booking.completed',
        expect.objectContaining({ tenantId: 'tenant-1', bookingId: 'booking-1' }),
      );
    });
  });
});
