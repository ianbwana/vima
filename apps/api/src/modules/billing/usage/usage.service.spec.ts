import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';

describe('UsageService', () => {
  let service: UsageService;
  let mockDb: any;

  const mockReturning = jest.fn().mockResolvedValue([{ id: 'rec-1', tenantId: 'tenant-123', metric: 'completed_job', quantity: 5 }]);
  const mockInsertValues = jest.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

  const mockSelect = jest.fn();

  beforeEach(async () => {
    mockDb = {
      insert: mockInsert,
      select: mockSelect,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        {
          provide: ControlPlaneDbService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<UsageService>(UsageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordUsage', () => {
    it('should insert a usage record with correct values', async () => {
      const result = await service.recordUsage('tenant-123', 'completed_job', 5);

      expect(mockInsert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        metric: 'completed_job',
        quantity: 5,
      });
      expect(result).toEqual({
        id: 'rec-1',
        tenantId: 'tenant-123',
        metric: 'completed_job',
        quantity: 5,
      });
    });

    it('should record different metric types', async () => {
      const metrics = ['completed_job', 'app_build', 'sms_sent'];

      for (const metric of metrics) {
        await service.recordUsage('tenant-456', metric, 1);
      }

      expect(mockInsert).toHaveBeenCalledTimes(3);
    });
  });

  describe('getCurrentPeriodUsage', () => {
    it('should query usage grouped by metric for the billing period', async () => {
      // Mock subscription lookup
      const mockSubLimit = jest.fn().mockResolvedValue([
        {
          id: 'sub-1',
          tenantId: 'tenant-123',
          currentPeriodStart: new Date('2024-01-01'),
          currentPeriodEnd: new Date('2024-01-31'),
        },
      ]);
      const mockSubWhere = jest.fn().mockReturnValue({ limit: mockSubLimit });
      const mockSubFrom = jest.fn().mockReturnValue({ where: mockSubWhere });

      // Mock usage records query
      const mockUsageWhere = jest.fn().mockResolvedValue([
        { id: '1', tenantId: 'tenant-123', metric: 'completed_job', quantity: 20, recordedAt: new Date('2024-01-10') },
        { id: '2', tenantId: 'tenant-123', metric: 'completed_job', quantity: 22, recordedAt: new Date('2024-01-15') },
        { id: '3', tenantId: 'tenant-123', metric: 'sms_sent', quantity: 100, recordedAt: new Date('2024-01-12') },
      ]);
      const mockUsageFrom = jest.fn().mockReturnValue({ where: mockUsageWhere });

      mockSelect
        .mockReturnValueOnce({ from: mockSubFrom })
        .mockReturnValueOnce({ from: mockUsageFrom });

      const result = await service.getCurrentPeriodUsage('tenant-123');

      expect(result.tenantId).toBe('tenant-123');
      expect(result.periodStart).toEqual(new Date('2024-01-01'));
      expect(result.periodEnd).toEqual(new Date('2024-01-31'));
      expect(result.metrics).toEqual(
        expect.arrayContaining([
          { metric: 'completed_job', total: 42 },
          { metric: 'sms_sent', total: 100 },
        ]),
      );
    });

    it('should default to current month if no subscription exists', async () => {
      // Subscription lookup returns empty
      const mockSubLimit = jest.fn().mockResolvedValue([]);
      const mockSubWhere = jest.fn().mockReturnValue({ limit: mockSubLimit });
      const mockSubFrom = jest.fn().mockReturnValue({ where: mockSubWhere });

      // Usage records: empty
      const mockUsageWhere = jest.fn().mockResolvedValue([]);
      const mockUsageFrom = jest.fn().mockReturnValue({ where: mockUsageWhere });

      mockSelect
        .mockReturnValueOnce({ from: mockSubFrom })
        .mockReturnValueOnce({ from: mockUsageFrom });

      const result = await service.getCurrentPeriodUsage('tenant-no-sub');

      expect(result.tenantId).toBe('tenant-no-sub');
      expect(result.metrics).toEqual([]);
      // Period start should be start of current month
      const now = new Date();
      expect(result.periodStart).toEqual(new Date(now.getFullYear(), now.getMonth(), 1));
    });
  });

  describe('getTenantsWithUsage', () => {
    it('should return tenant IDs with usage in the given period', async () => {
      const mockGroupBy = jest.fn().mockResolvedValue([
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-2' },
      ]);
      const mockWhere = jest.fn().mockReturnValue({ groupBy: mockGroupBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      const result = await service.getTenantsWithUsage(periodStart, periodEnd);

      expect(result).toEqual(['tenant-1', 'tenant-2']);
    });
  });

  describe('aggregateUsageForPeriod', () => {
    it('should aggregate usage records grouped by metric', async () => {
      const mockUsageWhere = jest.fn().mockResolvedValue([
        { id: '1', tenantId: 'tenant-1', metric: 'completed_job', quantity: 10, recordedAt: new Date() },
        { id: '2', tenantId: 'tenant-1', metric: 'completed_job', quantity: 5, recordedAt: new Date() },
        { id: '3', tenantId: 'tenant-1', metric: 'app_build', quantity: 2, recordedAt: new Date() },
      ]);
      const mockUsageFrom = jest.fn().mockReturnValue({ where: mockUsageWhere });
      mockSelect.mockReturnValue({ from: mockUsageFrom });

      const result = await service.aggregateUsageForPeriod(
        'tenant-1',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(result).toEqual(
        expect.arrayContaining([
          { metric: 'completed_job', totalQuantity: 15 },
          { metric: 'app_build', totalQuantity: 2 },
        ]),
      );
    });
  });
});
