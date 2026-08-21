import { AnalyticsQueryService } from './analytics-query.service';
import { TenantDbService } from '../../../database/tenant-db.service';

describe('AnalyticsQueryService', () => {
  let service: AnalyticsQueryService;
  let mockTenantDb: any;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            const result: any = Promise.resolve([]);
            result.orderBy = jest.fn().mockResolvedValue([]);
            result.groupBy = jest.fn().mockImplementation(() => ({
              orderBy: jest.fn().mockResolvedValue([]),
            }));
            return result;
          }),
          groupBy: jest.fn().mockResolvedValue([]),
        })),
      })),
    };

    mockTenantDb = { getConnection: jest.fn().mockReturnValue(mockDb) };
    service = new AnalyticsQueryService(mockTenantDb as TenantDbService);
  });

  describe('getTimeSeries()', () => {
    it('should query analytics_daily for the given metric and date range', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([
              { date: '2026-08-01', value: '150.00' },
              { date: '2026-08-02', value: '200.50' },
              { date: '2026-08-03', value: '175.25' },
            ]),
          }),
        }),
      });

      const result = await service.getTimeSeries('tenant-1', 'gmv', '2026-08-01', '2026-08-03');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ date: '2026-08-01', value: 150 });
      expect(result[1]).toEqual({ date: '2026-08-02', value: 200.5 });
      expect(result[2]).toEqual({ date: '2026-08-03', value: 175.25 });
    });

    it('should return empty array when no data exists', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.getTimeSeries('tenant-1', 'gmv', '2026-01-01', '2026-01-31');
      expect(result).toEqual([]);
    });
  });

  describe('getBreakdown()', () => {
    it('should return metric breakdown by dimension', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockResolvedValue([
                { dimensionValue: 'rides', total: '5000.00' },
                { dimensionValue: 'food', total: '3000.00' },
                { dimensionValue: 'courier', total: '1200.00' },
              ]),
            }),
          }),
        }),
      });

      const result = await service.getBreakdown('tenant-1', 'gmv', 'module', '2026-08-01', '2026-08-31');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ dimensionValue: 'rides', value: 5000 });
      expect(result[1]).toEqual({ dimensionValue: 'food', value: 3000 });
      expect(result[2]).toEqual({ dimensionValue: 'courier', value: 1200 });
    });
  });

  describe('getTotal()', () => {
    it('should return summed value for a metric over date range', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: '9200.00' }]),
        }),
      });

      const result = await service.getTotal('tenant-1', 'gmv', '2026-08-01', '2026-08-31');
      expect(result).toBe(9200);
    });
  });

  describe('getTotalWithGrowth()', () => {
    it('should calculate growth percentage vs prior period', async () => {
      // Mock two calls: current period, prior period
      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '12000.00' }]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '10000.00' }]),
          }),
        });

      const result = await service.getTotalWithGrowth('tenant-1', 'gmv', 30);

      expect(result.value).toBe(12000);
      expect(result.growth).toBe(20); // (12000-10000)/10000 * 100
    });

    it('should return 100% growth when prior period is 0', async () => {
      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '5000.00' }]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '0' }]),
          }),
        });

      const result = await service.getTotalWithGrowth('tenant-1', 'gmv', 30);

      expect(result.value).toBe(5000);
      expect(result.growth).toBe(100);
    });

    it('should return 0% growth when both periods are 0', async () => {
      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '0' }]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '0' }]),
          }),
        });

      const result = await service.getTotalWithGrowth('tenant-1', 'gmv', 30);

      expect(result.value).toBe(0);
      expect(result.growth).toBe(0);
    });

    it('should handle negative growth', async () => {
      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '8000.00' }]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ total: '10000.00' }]),
          }),
        });

      const result = await service.getTotalWithGrowth('tenant-1', 'gmv', 30);

      expect(result.value).toBe(8000);
      expect(result.growth).toBe(-20);
    });
  });
});
