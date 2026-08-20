import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookService } from './webhook.service';
import { REDIS_CLIENT } from '../../database/redis.module';
import { NormalizedWebhookEvent } from './interfaces/webhook-event.interface';

/**
 * Property-Based Test: Webhook Idempotency
 *
 * Property 8: Webhook Idempotency — For any webhook event processed successfully,
 * reprocessing the same event (same providerEventId) produces no additional side
 * effects and returns true (HTTP 200 equivalent).
 *
 * **Validates: Requirements 5.4**
 *
 * The WebhookService uses Redis SETNX with a 7-day TTL for deduplication.
 * The first call sets the key and publishes to BullMQ. Subsequent calls find
 * the key already exists and skip publishing. All calls return true.
 */

/**
 * Arbitrary generator for NormalizedWebhookEvent.
 * Constrains to the valid input space defined by the interface.
 */
const arbNormalizedWebhookEvent: fc.Arbitrary<NormalizedWebhookEvent> = fc.record({
  type: fc.constantFrom(
    'payment.succeeded' as const,
    'payment.failed' as const,
    'payout.succeeded' as const,
    'payout.failed' as const,
    'refund.succeeded' as const,
  ),
  provider: fc.constantFrom('stripe', 'paystack'),
  providerEventId: fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
  providerReference: fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
  amount: fc.integer({ min: 1, max: 10_000_000 }),
  currency: fc.constantFrom('usd', 'ngn', 'kes', 'ghs', 'zar', 'gbp', 'eur'),
  metadata: fc.option(fc.dictionary(fc.string({ minLength: 1, maxLength: 16 }), fc.string({ maxLength: 64 })), { nil: undefined }),
  raw: fc.constant({}),
});

describe('Webhook Idempotency (Property 8)', () => {
  let service: WebhookService;
  let mockRedis: { set: jest.Mock };
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockRedis = { set: jest.fn() };
    mockQueue = { add: jest.fn().mockResolvedValue({ id: '1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: getQueueToken('webhook-events'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should publish to the queue exactly once regardless of how many times the same event is processed', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNormalizedWebhookEvent,
        // Number of times to process the same event (1 to 10)
        fc.integer({ min: 1, max: 10 }),
        async (event, processCount) => {
          // Reset mocks for each property run
          mockRedis.set.mockReset();
          mockQueue.add.mockReset();
          mockQueue.add.mockResolvedValue({ id: '1' });

          // Simulate Redis SETNX behavior:
          // First call returns 'OK' (key set), subsequent calls return null (key exists)
          let firstCall = true;
          mockRedis.set.mockImplementation(() => {
            if (firstCall) {
              firstCall = false;
              return Promise.resolve('OK');
            }
            return Promise.resolve(null);
          });

          // Process the event N times
          const results: boolean[] = [];
          for (let i = 0; i < processCount; i++) {
            const result = await service.processEvent(event);
            results.push(result);
          }

          // Property: ALL calls return true (both new and duplicate are accepted)
          expect(results.every((r) => r === true)).toBe(true);

          // Property: queue.add() was called EXACTLY ONCE (first event only)
          expect(mockQueue.add).toHaveBeenCalledTimes(1);

          // Property: The single queue publish used the correct event type and ID
          expect(mockQueue.add).toHaveBeenCalledWith(
            event.type,
            event,
            expect.objectContaining({ jobId: event.providerEventId }),
          );

          // Property: Redis SET was called for every process attempt (dedup check)
          expect(mockRedis.set).toHaveBeenCalledTimes(processCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should never publish to the queue for purely duplicate events (all calls after first)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNormalizedWebhookEvent,
        // Number of duplicate retries after the initial processing (1 to 10)
        fc.integer({ min: 1, max: 10 }),
        async (event, duplicateCount) => {
          // Reset mocks
          mockRedis.set.mockReset();
          mockQueue.add.mockReset();
          mockQueue.add.mockResolvedValue({ id: '1' });

          // Simulate: event was already processed (all calls return null = duplicate)
          mockRedis.set.mockResolvedValue(null);

          // Process the event as if it were a duplicate every time
          const results: boolean[] = [];
          for (let i = 0; i < duplicateCount; i++) {
            const result = await service.processEvent(event);
            results.push(result);
          }

          // Property: ALL duplicate calls return true (idempotent success)
          expect(results.every((r) => r === true)).toBe(true);

          // Property: queue.add() was NEVER called (no side effects for duplicates)
          expect(mockQueue.add).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should use the providerEventId as the dedup key for any event', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNormalizedWebhookEvent,
        async (event) => {
          // Reset mocks
          mockRedis.set.mockReset();
          mockQueue.add.mockReset();
          mockQueue.add.mockResolvedValue({ id: '1' });
          mockRedis.set.mockResolvedValue('OK');

          await service.processEvent(event);

          // Property: The dedup key is always derived from providerEventId
          expect(mockRedis.set).toHaveBeenCalledWith(
            `webhook:dedup:${event.providerEventId}`,
            '1',
            'EX',
            604800, // 7 days TTL
            'NX',
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
