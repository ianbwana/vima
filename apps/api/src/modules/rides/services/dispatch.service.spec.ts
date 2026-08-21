import { DispatchService } from './dispatch.service';
import { DriverLocationService } from './driver-location.service';

describe('DispatchService', () => {
  let service: DispatchService;
  let mockRedis: Record<string, jest.Mock>;
  let mockDriverLocation: Partial<DriverLocationService>;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    mockDriverLocation = {
      findNearbyDrivers: jest.fn().mockResolvedValue([]),
    };

    service = new DispatchService(
      mockRedis as any,
      mockDriverLocation as DriverLocationService,
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('startDispatch()', () => {
    it('should create initial dispatch state with searching status', async () => {
      const state = await service.startDispatch('tenant-1', 'trip-1', -1.28, 36.81);

      expect(state.tripId).toBe('trip-1');
      expect(state.tenantId).toBe('tenant-1');
      expect(state.pickupLat).toBe(-1.28);
      expect(state.pickupLng).toBe(36.81);
      // With no drivers found, dispatch exhausts radius expansion and expires
      expect(state.offeredTo).toEqual([]);
      expect(state.status).toBe('expired');
    });

    it('should save state to Redis', async () => {
      await service.startDispatch('tenant-1', 'trip-1', -1.28, 36.81);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'dispatch:trip-1',
        3600,
        expect.any(String),
      );
    });

    it('should offer to first nearby driver when available', async () => {
      (mockDriverLocation.findNearbyDrivers as jest.Mock).mockResolvedValue([
        { providerId: 'driver-1', distanceKm: 1.2, lat: -1.27, lng: 36.82 },
        { providerId: 'driver-2', distanceKm: 2.5, lat: -1.26, lng: 36.80 },
      ]);

      const onOffer = jest.fn();
      service.onOfferDriver = onOffer;

      await service.startDispatch('tenant-1', 'trip-1', -1.28, 36.81);

      expect(onOffer).toHaveBeenCalledWith(
        'tenant-1',
        'driver-1',
        expect.objectContaining({ tripId: 'trip-1' }),
      );
    });

    it('should expire trip when no drivers found and max radius reached', async () => {
      (mockDriverLocation.findNearbyDrivers as jest.Mock).mockResolvedValue([]);

      const onExpired = jest.fn();
      service.onTripExpired = onExpired;

      // Start dispatch — will widen radius multiple times until max
      await service.startDispatch('tenant-1', 'trip-1', -1.28, 36.81);

      // Should have called findNearbyDrivers multiple times with increasing radius
      const calls = (mockDriverLocation.findNearbyDrivers as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(1);

      // Last call should use max radius (15km)
      const lastCall = calls[calls.length - 1];
      expect(lastCall[3]).toBe(15); // MAX_RADIUS_KM

      // Should expire
      expect(onExpired).toHaveBeenCalledWith('tenant-1', 'trip-1');
    });
  });

  describe('handleAccept()', () => {
    it('should return true when offer is valid', async () => {
      // Seed state in Redis
      const state = {
        tripId: 'trip-1',
        tenantId: 'tenant-1',
        pickupLat: -1.28,
        pickupLng: 36.81,
        currentRadius: 3,
        offeredTo: ['driver-1'],
        currentOffer: 'driver-1',
        offerExpiresAt: Date.now() + 20000,
        attempts: 1,
        status: 'offered',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      const result = await service.handleAccept('tenant-1', 'trip-1', 'driver-1');
      expect(result).toBe(true);
    });

    it('should return false when no state exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.handleAccept('tenant-1', 'trip-1', 'driver-1');
      expect(result).toBe(false);
    });

    it('should return false when offer is for different driver', async () => {
      const state = {
        tripId: 'trip-1',
        tenantId: 'tenant-1',
        pickupLat: -1.28,
        pickupLng: 36.81,
        currentRadius: 3,
        offeredTo: ['driver-1'],
        currentOffer: 'driver-1',
        offerExpiresAt: Date.now() + 20000,
        attempts: 1,
        status: 'offered',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      const result = await service.handleAccept('tenant-1', 'trip-1', 'driver-2');
      expect(result).toBe(false);
    });

    it('should update state to accepted on success', async () => {
      const state = {
        tripId: 'trip-1',
        tenantId: 'tenant-1',
        pickupLat: -1.28,
        pickupLng: 36.81,
        currentRadius: 3,
        offeredTo: ['driver-1'],
        currentOffer: 'driver-1',
        offerExpiresAt: Date.now() + 20000,
        attempts: 1,
        status: 'offered',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await service.handleAccept('tenant-1', 'trip-1', 'driver-1');

      // Should save updated state with status='accepted'
      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.status).toBe('accepted');
      expect(savedState.currentOffer).toBeUndefined();
    });
  });

  describe('handleDecline()', () => {
    it('should attempt to find next driver after decline', async () => {
      const state = {
        tripId: 'trip-1',
        tenantId: 'tenant-1',
        pickupLat: -1.28,
        pickupLng: 36.81,
        currentRadius: 3,
        offeredTo: ['driver-1'],
        currentOffer: 'driver-1',
        offerExpiresAt: Date.now() + 20000,
        attempts: 1,
        status: 'offered',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      (mockDriverLocation.findNearbyDrivers as jest.Mock).mockResolvedValue([
        { providerId: 'driver-2', distanceKm: 2.0, lat: -1.27, lng: 36.80 },
      ]);

      const onOffer = jest.fn();
      service.onOfferDriver = onOffer;

      await service.handleDecline('tenant-1', 'trip-1', 'driver-1');

      // Should offer to next driver
      expect(onOffer).toHaveBeenCalledWith(
        'tenant-1',
        'driver-2',
        expect.objectContaining({ tripId: 'trip-1' }),
      );
    });
  });

  describe('cancelDispatch()', () => {
    it('should remove dispatch state from Redis', async () => {
      await service.cancelDispatch('trip-1');

      expect(mockRedis.del).toHaveBeenCalledWith('dispatch:trip-1');
    });
  });

  describe('getState()', () => {
    it('should return parsed state from Redis', async () => {
      const state = { tripId: 'trip-1', status: 'searching' };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      const result = await service.getState('trip-1');
      expect(result).toEqual(state);
    });

    it('should return null when no state exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getState('trip-1');
      expect(result).toBeNull();
    });
  });
});
