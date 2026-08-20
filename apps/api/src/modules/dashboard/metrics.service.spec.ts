import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { TenantDbService } from '@/database/tenant-db.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let mockDb: any;
  let mockTenantDbService: { getConnection: jest.Mock };

  // Helper to create a chainable query builder mock
  function createQueryBuilder(returnValue: any) {
    const builder: any = {};
    builder.select = jest.fn().mockReturnValue(builder);
    builder.from = jest.fn().mockReturnValue(builder);
    builder.where = jest.fn().mockResolvedValue([returnValue]);
    return builder;
  }

  beforeEach(async () => {
    // Create mock DB that supports multiple concurrent select() calls
    // Each call to select() returns a fresh chainable query builder
    const queryResults: any[] = [];
    let callIndex = 0;

    mockDb = {
      select: jest.fn().mockImplementation(() => {
        const result = queryResults[callIndex] ?? { total: '0', count: 0, completed: 0 };
        callIndex++;
        const builder: any = {};
        builder.from = jest.fn().mockReturnValue(builder);
        builder.where = jest.fn().mockResolvedValue([result]);
        return builder;
      }),
      _setResults: (results: any[]) => {
        queryResults.length = 0;
        queryResults.push(...results);
        callIndex = 0;
      },
    };

    mockTenantDbService = {
      getConnection: jest.fn().mockReturnValue(mockDb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: TenantDbService, useValue: mockTenantDbService },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getJobsByModule', () => {
    it('should return job counts grouped by module and date for last 7 days', async () => {
      // Override the mock to support groupBy and orderBy chaining
      const mockResults = [
        { date: '2024-01-15', module: 'ride', count: 10 },
        { date: '2024-01-15', module: 'delivery_leg', count: 5 },
        { date: '2024-01-16', module: 'ride', count: 12 },
      ];

      const builder: any = {};
      builder.select = jest.fn().mockReturnValue(builder);
      builder.from = jest.fn().mockReturnValue(builder);
      builder.where = jest.fn().mockReturnValue(builder);
      builder.groupBy = jest.fn().mockReturnValue(builder);
      builder.orderBy = jest.fn().mockResolvedValue(mockResults);

      mockTenantDbService.getConnection.mockReturnValue(builder);

      const result = await service.getJobsByModule('tenant-123');

      expect(mockTenantDbService.getConnection).toHaveBeenCalledWith('tenant-123');
      expect(result).toEqual({
        data: [
          { date: '2024-01-15', module: 'ride', count: 10 },
          { date: '2024-01-15', module: 'delivery_leg', count: 5 },
          { date: '2024-01-16', module: 'ride', count: 12 },
        ],
      });
    });

    it('should return empty data array when no jobs exist', async () => {
      const builder: any = {};
      builder.select = jest.fn().mockReturnValue(builder);
      builder.from = jest.fn().mockReturnValue(builder);
      builder.where = jest.fn().mockReturnValue(builder);
      builder.groupBy = jest.fn().mockReturnValue(builder);
      builder.orderBy = jest.fn().mockResolvedValue([]);

      mockTenantDbService.getConnection.mockReturnValue(builder);

      const result = await service.getJobsByModule('tenant-123');

      expect(result).toEqual({ data: [] });
    });

    it('should scope queries to the correct tenant database', async () => {
      const builder: any = {};
      builder.select = jest.fn().mockReturnValue(builder);
      builder.from = jest.fn().mockReturnValue(builder);
      builder.where = jest.fn().mockReturnValue(builder);
      builder.groupBy = jest.fn().mockReturnValue(builder);
      builder.orderBy = jest.fn().mockResolvedValue([]);

      mockTenantDbService.getConnection.mockReturnValue(builder);

      await service.getJobsByModule('specific-tenant');

      expect(mockTenantDbService.getConnection).toHaveBeenCalledWith('specific-tenant');
    });
  });

  describe('getMetrics', () => {
    it('should return metrics with correct structure', async () => {
      // Setup: GMV current, GMV prior, Jobs current, Jobs prior, Active providers, Completion stats
      mockDb._setResults([
        { total: '15000.00' },    // GMV current 30d
        { total: '10000.00' },    // GMV prior 30d
        { count: 150 },           // Completed jobs current
        { count: 100 },           // Completed jobs prior
        { count: 25 },            // Active providers
        { completed: 150, total: 180 }, // Completion stats
      ]);

      const result = await service.getMetrics('tenant-123');

      expect(result).toEqual({
        gmv: { value: 15000, growth: 50 },
        completedJobs: { value: 150, growth: 50 },
        activeProviders: 25,
        completionRate: 83.33,
      });
    });

    it('should resolve tenant database connection for the correct tenantId', async () => {
      mockDb._setResults([
        { total: '0' },
        { total: '0' },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { completed: 0, total: 0 },
      ]);

      await service.getMetrics('my-tenant');

      expect(mockTenantDbService.getConnection).toHaveBeenCalledWith('my-tenant');
    });

    it('should compute growth as 100% when prior period is 0 and current is positive', async () => {
      mockDb._setResults([
        { total: '5000.00' },     // GMV current
        { total: '0' },           // GMV prior (0)
        { count: 50 },            // Jobs current
        { count: 0 },             // Jobs prior (0)
        { count: 10 },            // Active providers
        { completed: 50, total: 60 },
      ]);

      const result = await service.getMetrics('tenant-123');

      expect(result.gmv.growth).toBe(100);
      expect(result.completedJobs.growth).toBe(100);
    });

    it('should compute growth as 0% when both periods are 0', async () => {
      mockDb._setResults([
        { total: '0' },
        { total: '0' },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { completed: 0, total: 0 },
      ]);

      const result = await service.getMetrics('tenant-123');

      expect(result.gmv.growth).toBe(0);
      expect(result.completedJobs.growth).toBe(0);
    });

    it('should compute negative growth when current period is less than prior', async () => {
      mockDb._setResults([
        { total: '5000.00' },     // GMV current
        { total: '10000.00' },    // GMV prior
        { count: 50 },            // Jobs current
        { count: 100 },           // Jobs prior
        { count: 5 },
        { completed: 50, total: 60 },
      ]);

      const result = await service.getMetrics('tenant-123');

      expect(result.gmv.growth).toBe(-50);
      expect(result.completedJobs.growth).toBe(-50);
    });

    it('should return 0 completion rate when there are no jobs in the period', async () => {
      mockDb._setResults([
        { total: '0' },
        { total: '0' },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { completed: 0, total: 0 },
      ]);

      const result = await service.getMetrics('tenant-123');

      expect(result.completionRate).toBe(0);
    });

    it('should compute completion rate correctly', async () => {
      mockDb._setResults([
        { total: '1000.00' },
        { total: '500.00' },
        { count: 20 },
        { count: 10 },
        { count: 3 },
        { completed: 75, total: 100 },
      ]);

      const result = await service.getMetrics('tenant-123');

      expect(result.completionRate).toBe(75);
    });

    it('should handle decimal growth percentages', async () => {
      mockDb._setResults([
        { total: '11000.00' },    // GMV current
        { total: '10000.00' },    // GMV prior
        { count: 33 },            // Jobs current
        { count: 30 },            // Jobs prior
        { count: 10 },
        { completed: 33, total: 40 },
      ]);

      const result = await service.getMetrics('tenant-123');

      expect(result.gmv.growth).toBe(10);
      expect(result.completedJobs.growth).toBe(10);
    });
  });
});
