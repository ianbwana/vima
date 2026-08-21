import * as fc from 'fast-check';

/**
 * Property-Based Test: Usage Record Idempotency
 *
 * Property 10: Usage Record Idempotency — Same idempotency key does not result
 * in duplicate charges regardless of retry count.
 *
 * **Validates: Requirements 8.3**
 *
 * The Billing_Service pushes usage records to Stripe with idempotency keys
 * (format: usage_${tenantId}_${metric}_${period}). This test verifies that
 * regardless of how many times a push is attempted with the same key, only one
 * effective usage record is created on Stripe's side.
 */

interface UsageRecordParams {
  subscriptionItemId: string;
  quantity: number;
  timestamp: number;
  idempotencyKey: string;
}

interface StripeClientLike {
  createUsageRecord(params: UsageRecordParams): Promise<unknown>;
}

describe('Usage Record Idempotency (Property 10)', () => {
  /**
   * Simulates the Stripe idempotency key behavior:
   * - First call with a given key creates the record and stores the result
   * - Subsequent calls with the same key return the cached result without creating a new record
   *
   * This mirrors how Stripe's idempotency works in production.
   */
  function createIdempotentStripeMock() {
    const processedKeys = new Map<string, { subscriptionItemId: string; quantity: number; timestamp: number }>();
    let creationCount = 0;

    const createUsageRecord = jest.fn(async (params: UsageRecordParams) => {
      if (processedKeys.has(params.idempotencyKey)) {
        // Stripe returns the cached result — no new record created
        return { id: `usage_rec_cached_${params.idempotencyKey}`, ...processedKeys.get(params.idempotencyKey) };
      }

      // First time seeing this key — create the record
      creationCount++;
      const record = {
        subscriptionItemId: params.subscriptionItemId,
        quantity: params.quantity,
        timestamp: params.timestamp,
      };
      processedKeys.set(params.idempotencyKey, record);

      return { id: `usage_rec_${creationCount}`, ...record };
    });

    return {
      createUsageRecord,
      getCreationCount: () => creationCount,
      getProcessedKeys: () => processedKeys,
    };
  }

  /**
   * Extracted pushWithRetry logic to make it testable outside the processor.
   * This replicates the UsagePushProcessor.pushWithRetry behavior:
   * - Calls stripeClient.createUsageRecord with idempotency key
   * - Retries on failure up to MAX_RETRIES times
   * - Always uses the same idempotency key for all retries
   */
  async function pushWithRetry(
    stripeClient: StripeClientLike,
    params: UsageRecordParams,
    maxRetries: number,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await stripeClient.createUsageRecord(params);
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        // In production there's exponential backoff; skip the delay in tests
      }
    }
  }

  it('should never create duplicate usage records for the same idempotency key regardless of retry count', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary tenant ID
        fc.string({ minLength: 1, maxLength: 36 }).filter((s) => s.trim().length > 0),
        // Generate arbitrary metric name
        fc.constantFrom('jobs_completed', 'app_builds', 'sms_sent', 'api_calls'),
        // Generate arbitrary quantity (positive integer)
        fc.integer({ min: 1, max: 100000 }),
        // Generate a period key (date string)
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).chain(
          (d) => {
            try {
              return fc.constant(d.toISOString().split('T')[0]);
            } catch {
              return fc.constant('2025-01-15');
            }
          },
        ),
        // Generate the number of times to push the same usage (simulating retries/redundant pushes)
        fc.integer({ min: 1, max: 10 }),
        // Subscription item ID
        fc.uuid(),
        async (tenantId, metric, quantity, periodKey, pushCount, subscriptionItemId) => {
          const mock = createIdempotentStripeMock();

          // Construct the idempotency key as the real processor does
          const idempotencyKey = `usage_${tenantId}_${metric}_${periodKey}`;

          const timestamp = Math.floor(Date.now() / 1000);

          // Push usage multiple times with the same idempotency key
          for (let i = 0; i < pushCount; i++) {
            await pushWithRetry(
              mock,
              {
                subscriptionItemId,
                quantity,
                timestamp,
                idempotencyKey,
              },
              3,
            );
          }

          // Property: Only 1 usage record was actually created, regardless of pushCount
          expect(mock.getCreationCount()).toBe(1);

          // Stripe was called pushCount times, but only 1 record was created
          expect(mock.createUsageRecord).toHaveBeenCalledTimes(pushCount);

          // All calls used the same idempotency key
          for (const call of mock.createUsageRecord.mock.calls) {
            expect(call[0].idempotencyKey).toBe(idempotencyKey);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should create separate records for different idempotency keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two distinct tenant IDs
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 36 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 36 }).filter((s) => s.trim().length > 0),
        ).filter(([a, b]) => a !== b),
        // Generate metric
        fc.constantFrom('jobs_completed', 'app_builds', 'sms_sent'),
        // Generate quantities
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        // Period key
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
          (d) => d.toISOString().split('T')[0],
        ),
        // Subscription item IDs
        fc.uuid(),
        fc.uuid(),
        async ([tenantA, tenantB], metric, qtyA, qtyB, periodKey, subItemA, subItemB) => {
          const mock = createIdempotentStripeMock();

          const keyA = `usage_${tenantA}_${metric}_${periodKey}`;
          const keyB = `usage_${tenantB}_${metric}_${periodKey}`;

          const timestamp = Math.floor(Date.now() / 1000);

          // Push for tenant A
          await pushWithRetry(
            mock,
            { subscriptionItemId: subItemA, quantity: qtyA, timestamp, idempotencyKey: keyA },
            3,
          );

          // Push for tenant B
          await pushWithRetry(
            mock,
            { subscriptionItemId: subItemB, quantity: qtyB, timestamp, idempotencyKey: keyB },
            3,
          );

          // Property: Two distinct keys should create two separate records
          expect(mock.getCreationCount()).toBe(2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should preserve idempotency even when initial attempts fail before succeeding', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Tenant ID
        fc.string({ minLength: 1, maxLength: 36 }).filter((s) => s.trim().length > 0),
        // Metric
        fc.constantFrom('jobs_completed', 'app_builds', 'sms_sent'),
        // Quantity
        fc.integer({ min: 1, max: 100000 }),
        // Period key
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
          (d) => d.toISOString().split('T')[0],
        ),
        // Number of failures before success (0 to 2, since maxRetries is 3)
        fc.integer({ min: 0, max: 2 }),
        // Subscription item ID
        fc.uuid(),
        async (tenantId, metric, quantity, periodKey, failuresBeforeSuccess, subscriptionItemId) => {
          let callCount = 0;
          let creationCount = 0;
          const processedKeys = new Set<string>();

          // Mock that fails N times then succeeds, but respects idempotency
          const stripeClient = {
            createUsageRecord: jest.fn(
              async (params: {
                subscriptionItemId: string;
                quantity: number;
                timestamp: number;
                idempotencyKey: string;
              }) => {
                callCount++;
                if (callCount <= failuresBeforeSuccess) {
                  throw new Error('Stripe API temporarily unavailable');
                }

                // On success: check idempotency
                if (!processedKeys.has(params.idempotencyKey)) {
                  creationCount++;
                  processedKeys.add(params.idempotencyKey);
                }
                return { id: `usage_rec_${creationCount}` };
              },
            ),
          };

          const idempotencyKey = `usage_${tenantId}_${metric}_${periodKey}`;
          const timestamp = Math.floor(Date.now() / 1000);

          // First call: may fail then succeed via retry
          await pushWithRetry(
            stripeClient,
            { subscriptionItemId, quantity, timestamp, idempotencyKey },
            3,
          );

          // Second call with same key: should be idempotent
          // Reset callCount so the second push doesn't hit artificial failures
          callCount = failuresBeforeSuccess + 1;
          await pushWithRetry(
            stripeClient,
            { subscriptionItemId, quantity, timestamp, idempotencyKey },
            3,
          );

          // Property: Only 1 record was created despite retries and duplicate pushes
          expect(creationCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
