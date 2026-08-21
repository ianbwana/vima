import { AnalyticsEventCollector } from './analytics-event-collector.service';

describe('AnalyticsEventCollector', () => {
  let collector: AnalyticsEventCollector;
  let mockRedis: Record<string, jest.Mock>;

  beforeEach(() => {
    mockRedis = {
      xadd: jest.fn().mockResolvedValue('stream-id-1'),
    };

    collector = new AnalyticsEventCollector(mockRedis as any);
  });

  describe('onRideCompleted()', () => {
    it('should write trip_completed event to Redis Stream', async () => {
      await collector.onRideCompleted({
        tenantId: 'tenant-1',
        tripId: 'trip-1',
        fare: 25.50,
        currency: 'USD',
        providerId: 'provider-1',
      });

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'analytics:tenant-1:events',
        'MAXLEN', '~', '100000',
        '*',
        'eventType', 'trip_completed',
        'module', 'rides',
        'timestamp', expect.any(String),
        'tripId', 'trip-1',
        'fare', '25.5',
        'currency', 'USD',
        'providerId', 'provider-1',
      );
    });
  });

  describe('onRideCancelled()', () => {
    it('should write trip_cancelled event to tenant stream', async () => {
      await collector.onRideCancelled({ tenantId: 'tenant-2', tripId: 'trip-5' });

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'analytics:tenant-2:events',
        'MAXLEN', '~', '100000',
        '*',
        'eventType', 'trip_cancelled',
        'module', 'rides',
        'timestamp', expect.any(String),
        'tripId', 'trip-5',
      );
    });
  });

  describe('onOrderDelivered()', () => {
    it('should write order_delivered event to stream', async () => {
      await collector.onOrderDelivered({ tenantId: 'tenant-1', orderId: 'order-1' });

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'analytics:tenant-1:events',
        expect.anything(), expect.anything(), expect.anything(),
        '*',
        'eventType', 'order_delivered',
        'module', 'food',
        expect.anything(), expect.anything(),
        'orderId', 'order-1',
      );
    });
  });

  describe('onParcelDelivered()', () => {
    it('should write parcel_delivered event to stream', async () => {
      await collector.onParcelDelivered({ tenantId: 'tenant-1', parcelId: 'parcel-1', providerId: 'p-1' });

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'analytics:tenant-1:events',
        expect.anything(), expect.anything(), expect.anything(),
        '*',
        'eventType', 'parcel_delivered',
        'module', 'courier',
        expect.anything(), expect.anything(),
        'parcelId', 'parcel-1',
        'providerId', 'p-1',
      );
    });
  });

  describe('onBookingCompleted()', () => {
    it('should write booking_completed event to stream', async () => {
      await collector.onBookingCompleted({ tenantId: 'tenant-1', bookingId: 'b-1', providerId: 'p-1' });

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'analytics:tenant-1:events',
        expect.anything(), expect.anything(), expect.anything(),
        '*',
        'eventType', 'booking_completed',
        'module', 'home_services',
        expect.anything(), expect.anything(),
        'bookingId', 'b-1',
        'providerId', 'p-1',
      );
    });
  });

  describe('tenant isolation', () => {
    it('should use different stream keys for different tenants', async () => {
      await collector.onRideCompleted({
        tenantId: 'tenant-A',
        tripId: 't1',
        fare: 10,
        currency: 'USD',
        providerId: 'p1',
      });
      await collector.onRideCompleted({
        tenantId: 'tenant-B',
        tripId: 't2',
        fare: 20,
        currency: 'KES',
        providerId: 'p2',
      });

      expect(mockRedis.xadd).toHaveBeenCalledTimes(2);
      expect(mockRedis.xadd.mock.calls[0][0]).toBe('analytics:tenant-A:events');
      expect(mockRedis.xadd.mock.calls[1][0]).toBe('analytics:tenant-B:events');
    });
  });
});
