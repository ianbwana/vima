import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { TenantDbService } from '@/database/tenant-db.service';

/**
 * Property-Based Test: Dashboard Metrics Tenant Isolation
 *
 * Property 11: Dashboard Metrics Tenant Isolation — For any two distinct tenants,
 * a dashboard metrics query for tenant A SHALL never include data from tenant B's database.
 *
 * **Validates: Requirements 17.6**
 *
 * The MetricsService resolves tenant databases via TenantDbService.getConnection(tenantId).
 * This test verifies that:
 * 1. getConnection is always called with the correct tenant ID
 * 2. Only the target tenant's database connection is used for queries
 * 3. No cross-tenant data leakage occurs at the service layer
 */

describe('Dashboard Metrics Tenant Isolation (Property 11)', () => {
  /**
   * Creates a mock DB instance that tracks all query invocations.
   * Each mock is unique per tenant so we can verify isolation.
   * The mock supports both query patterns used by MetricsService:
   * - getMetrics: select().from().where() → resolves directly
   * - getJobsByModule: select().from().where().groupBy().orderBy() → resolves at orderBy
   */
  function createMockDb(tenantId: string) {
    const invocations: string[] = [];

    const db: any = {
      select: jest.fn().mockImplementation(() => {
        invocations.push(`select:${tenantId}`);
        const chain: any = {};
        chain.from = jest.fn().mockReturnValue(chain);
        chain.where = jest.fn().mockImplementation(() => {
          // Return a thenable that also supports .groupBy() chaining
          // This handles both patterns:
          // - await db.select().from().where() (getMetrics)
          // - db.select().from().where().groupBy().orderBy() (getJobsByModule)
          const groupByChain: any = {
            groupBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockResolvedValue([]),
            }),
            then: (resolve: any, reject?: any) => {
              return Promise.resolve([
                { total: '0', count: 0, completed: 0 },
              ]).then(resolve, reject);
            },
          };
          return groupByChain;
        });
        return chain;
      }),
    };

    return { db, invocations };
  }

  let service: MetricsService;
  let mockTenantDbService: { getConnection: jest.Mock };
  const dbMap = new Map<string, { db: any; invocations: string[] }>();

  beforeEach(async () => {
    dbMap.clear();

    mockTenantDbService = {
      getConnection: jest.fn().mockImplementation((tenantId: string) => {
        if (!dbMap.has(tenantId)) {
          dbMap.set(tenantId, createMockDb(tenantId));
        }
        return dbMap.get(tenantId)!.db;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: TenantDbService, useValue: mockTenantDbService },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  // Arbitrary for generating valid tenant IDs (non-empty, alphanumeric-ish, distinct)
  const tenantIdArb = fc.string({ minLength: 1, maxLength: 36 })
    .filter((s) => s.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(s));

  const distinctTenantPairArb = fc.tuple(tenantIdArb, tenantIdArb)
    .filter(([a, b]) => a !== b);

  it('getMetrics: should only use the target tenant database connection, never another tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctTenantPairArb,
        async ([tenantA, tenantB]) => {
          // Reset state for each property iteration
          mockTenantDbService.getConnection.mockClear();
          dbMap.clear();

          // Pre-register both tenant mock DBs
          dbMap.set(tenantA, createMockDb(tenantA));
          dbMap.set(tenantB, createMockDb(tenantB));

          // Query metrics for tenant A
          await service.getMetrics(tenantA);

          // Property 1: getConnection was called with tenantA only
          expect(mockTenantDbService.getConnection).toHaveBeenCalledWith(tenantA);
          expect(mockTenantDbService.getConnection).not.toHaveBeenCalledWith(tenantB);

          // Property 2: Only tenant A's DB had queries executed against it
          const tenantAInvocations = dbMap.get(tenantA)!.invocations;
          const tenantBInvocations = dbMap.get(tenantB)!.invocations;

          expect(tenantAInvocations.length).toBeGreaterThan(0);
          expect(tenantBInvocations.length).toBe(0);

          // Property 3: All invocations are tagged with tenantA
          for (const inv of tenantAInvocations) {
            expect(inv).toBe(`select:${tenantA}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getJobsByModule: should only use the target tenant database connection, never another tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctTenantPairArb,
        async ([tenantA, tenantB]) => {
          // Reset state for each property iteration
          mockTenantDbService.getConnection.mockClear();
          dbMap.clear();

          // Pre-register both tenant mock DBs
          dbMap.set(tenantA, createMockDb(tenantA));
          dbMap.set(tenantB, createMockDb(tenantB));

          // Query jobs-by-module for tenant A
          await service.getJobsByModule(tenantA);

          // Property 1: getConnection was called with tenantA only
          expect(mockTenantDbService.getConnection).toHaveBeenCalledWith(tenantA);
          expect(mockTenantDbService.getConnection).not.toHaveBeenCalledWith(tenantB);

          // Property 2: Only tenant A's DB was queried
          const tenantAInvocations = dbMap.get(tenantA)!.invocations;
          const tenantBInvocations = dbMap.get(tenantB)!.invocations;

          expect(tenantAInvocations.length).toBeGreaterThan(0);
          expect(tenantBInvocations.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sequential queries for different tenants should maintain isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctTenantPairArb,
        async ([tenantA, tenantB]) => {
          // Reset state for each property iteration
          mockTenantDbService.getConnection.mockClear();
          dbMap.clear();

          // Pre-register both tenant mock DBs
          dbMap.set(tenantA, createMockDb(tenantA));
          dbMap.set(tenantB, createMockDb(tenantB));

          // Query metrics for tenant A, then tenant B sequentially
          await service.getMetrics(tenantA);
          await service.getMetrics(tenantB);

          // Property: Each tenant's DB received only its own queries
          const tenantAInvocations = dbMap.get(tenantA)!.invocations;
          const tenantBInvocations = dbMap.get(tenantB)!.invocations;

          // Both should have invocations (each got queried)
          expect(tenantAInvocations.length).toBeGreaterThan(0);
          expect(tenantBInvocations.length).toBeGreaterThan(0);

          // All of tenant A's invocations are tagged with A
          for (const inv of tenantAInvocations) {
            expect(inv).toBe(`select:${tenantA}`);
          }

          // All of tenant B's invocations are tagged with B
          for (const inv of tenantBInvocations) {
            expect(inv).toBe(`select:${tenantB}`);
          }

          // getConnection was called exactly once per tenant
          const calls = mockTenantDbService.getConnection.mock.calls.map((c: any[]) => c[0]);
          expect(calls.filter((c: string) => c === tenantA).length).toBe(1);
          expect(calls.filter((c: string) => c === tenantB).length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('concurrent queries for different tenants should maintain isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctTenantPairArb,
        async ([tenantA, tenantB]) => {
          // Reset state for each property iteration
          mockTenantDbService.getConnection.mockClear();
          dbMap.clear();

          // Pre-register both tenant mock DBs
          dbMap.set(tenantA, createMockDb(tenantA));
          dbMap.set(tenantB, createMockDb(tenantB));

          // Execute concurrent metrics queries for both tenants
          await Promise.all([
            service.getMetrics(tenantA),
            service.getMetrics(tenantB),
          ]);

          // Property: Each tenant's DB received only its own queries
          const tenantAInvocations = dbMap.get(tenantA)!.invocations;
          const tenantBInvocations = dbMap.get(tenantB)!.invocations;

          // Both should have invocations
          expect(tenantAInvocations.length).toBeGreaterThan(0);
          expect(tenantBInvocations.length).toBeGreaterThan(0);

          // No cross-contamination
          for (const inv of tenantAInvocations) {
            expect(inv).toBe(`select:${tenantA}`);
          }
          for (const inv of tenantBInvocations) {
            expect(inv).toBe(`select:${tenantB}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
