import { FareService, FareRuleData } from './fare.service';
import { TenantDbService } from '../../../database/tenant-db.service';

describe('FareService', () => {
  let service: FareService;
  let mockTenantDb: Partial<TenantDbService>;

  beforeEach(() => {
    mockTenantDb = {
      getConnection: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    service = new FareService(mockTenantDb as TenantDbService);
  });

  describe('calculateDistance()', () => {
    it('should calculate zero distance for same point', () => {
      const distance = service.calculateDistance(1.0, 36.0, 1.0, 36.0);
      expect(distance).toBe(0);
    });

    it('should calculate known distance between Nairobi and Mombasa (~440km)', () => {
      // Nairobi: -1.286389, 36.817223
      // Mombasa: -4.043477, 39.668206
      const distance = service.calculateDistance(-1.286389, 36.817223, -4.043477, 39.668206);
      // Should be approximately 440km (Haversine straight line)
      expect(distance).toBeGreaterThan(400);
      expect(distance).toBeLessThan(500);
    });

    it('should calculate short distance correctly (~1km)', () => {
      // Two points approximately 1km apart
      const distance = service.calculateDistance(0, 0, 0.009, 0);
      // 0.009 degrees latitude ≈ 1km
      expect(distance).toBeGreaterThan(0.9);
      expect(distance).toBeLessThan(1.1);
    });

    it('should be symmetric (A→B == B→A)', () => {
      const d1 = service.calculateDistance(1.0, 36.0, 2.0, 37.0);
      const d2 = service.calculateDistance(2.0, 37.0, 1.0, 36.0);
      expect(d1).toBeCloseTo(d2, 10);
    });
  });

  describe('calculateFare()', () => {
    const baseRule: FareRuleData = {
      baseFare: 2.50,
      perKm: 1.20,
      perMinute: 0.30,
      minimumFare: 5.00,
      surgeMultiplier: 1.0,
      currency: 'USD',
      commissionRate: 0.20,
    };

    it('should calculate fare correctly with base formula', () => {
      // 10km, 15 min: 2.50 + (10 * 1.20) + (15 * 0.30) = 2.50 + 12.00 + 4.50 = 19.00
      const fare = service.calculateFare(baseRule, 10, 15);
      expect(fare).toBe(19.00);
    });

    it('should enforce minimum fare', () => {
      // Very short trip: 0.5km, 2 min: 2.50 + (0.5 * 1.20) + (2 * 0.30) = 2.50 + 0.60 + 0.60 = 3.70
      // This is below minimum of 5.00
      const fare = service.calculateFare(baseRule, 0.5, 2);
      expect(fare).toBe(5.00);
    });

    it('should apply surge multiplier', () => {
      const surgeRule = { ...baseRule, surgeMultiplier: 1.5 };
      // 10km, 15 min: 19.00 * 1.5 = 28.50
      const fare = service.calculateFare(surgeRule, 10, 15);
      expect(fare).toBe(28.50);
    });

    it('should apply surge to minimum fare', () => {
      const surgeRule = { ...baseRule, surgeMultiplier: 2.0 };
      // 0.5km, 2 min: raw = 3.70, min = 5.00, with 2x surge = 10.00
      const fare = service.calculateFare(surgeRule, 0.5, 2);
      expect(fare).toBe(10.00);
    });

    it('should handle zero distance and duration', () => {
      // 0km, 0 min: raw = 2.50, min = 5.00
      const fare = service.calculateFare(baseRule, 0, 0);
      expect(fare).toBe(5.00);
    });

    it('should round to 2 decimal places', () => {
      const rule = { ...baseRule, perKm: 1.33, perMinute: 0.17 };
      // 7km, 11min: 2.50 + (7 * 1.33) + (11 * 0.17) = 2.50 + 9.31 + 1.87 = 13.68
      const fare = service.calculateFare(rule, 7, 11);
      expect(fare.toString()).toMatch(/^\d+\.\d{1,2}$/);
    });

    it('should handle very long trips', () => {
      // 50km, 60 min: 2.50 + (50 * 1.20) + (60 * 0.30) = 2.50 + 60 + 18 = 80.50
      const fare = service.calculateFare(baseRule, 50, 60);
      expect(fare).toBe(80.50);
    });
  });

  describe('getEstimates()', () => {
    it('should return empty array when no fare rules exist', async () => {
      const estimates = await service.getEstimates('tenant-1', 0, 0, 1, 1);
      expect(estimates).toEqual([]);
    });

    it('should calculate estimates for available vehicle classes', async () => {
      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([
                {
                  fareRuleId: 'rule-1',
                  baseFare: '3.00',
                  perKm: '1.50',
                  perMinute: '0.25',
                  minimumFare: '5.00',
                  surgeMultiplier: '1.00',
                  currency: 'USD',
                  vehicleClassId: 'vc-1',
                  vehicleClassName: 'Economy',
                },
                {
                  fareRuleId: 'rule-2',
                  baseFare: '5.00',
                  perKm: '2.50',
                  perMinute: '0.50',
                  minimumFare: '8.00',
                  surgeMultiplier: '1.00',
                  currency: 'USD',
                  vehicleClassId: 'vc-2',
                  vehicleClassName: 'Comfort',
                },
              ]),
            }),
          }),
        }),
      };
      (mockTenantDb.getConnection as jest.Mock).mockReturnValue(mockDb);

      const estimates = await service.getEstimates(
        'tenant-1',
        -1.286389, 36.817223, // Nairobi
        -1.300000, 36.830000, // ~2km away
      );

      expect(estimates).toHaveLength(2);
      expect(estimates[0].vehicleClassName).toBe('Economy');
      expect(estimates[1].vehicleClassName).toBe('Comfort');
      expect(parseFloat(estimates[0].estimatedFare)).toBeGreaterThan(0);
      expect(parseFloat(estimates[1].estimatedFare)).toBeGreaterThan(parseFloat(estimates[0].estimatedFare));
      expect(estimates[0].distanceKm).toBeGreaterThan(0);
      expect(estimates[0].durationMin).toBeGreaterThan(0);
    });

    it('should filter by vehicle class ID when provided', async () => {
      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([
                {
                  fareRuleId: 'rule-1',
                  baseFare: '3.00',
                  perKm: '1.50',
                  perMinute: '0.25',
                  minimumFare: '5.00',
                  surgeMultiplier: '1.00',
                  currency: 'USD',
                  vehicleClassId: 'vc-1',
                  vehicleClassName: 'Economy',
                },
                {
                  fareRuleId: 'rule-2',
                  baseFare: '5.00',
                  perKm: '2.50',
                  perMinute: '0.50',
                  minimumFare: '8.00',
                  surgeMultiplier: '1.00',
                  currency: 'USD',
                  vehicleClassId: 'vc-2',
                  vehicleClassName: 'Comfort',
                },
              ]),
            }),
          }),
        }),
      };
      (mockTenantDb.getConnection as jest.Mock).mockReturnValue(mockDb);

      const estimates = await service.getEstimates(
        'tenant-1',
        0, 0, 0.01, 0.01,
        'vc-1', // Only Economy
      );

      expect(estimates).toHaveLength(1);
      expect(estimates[0].vehicleClassId).toBe('vc-1');
    });
  });
});
