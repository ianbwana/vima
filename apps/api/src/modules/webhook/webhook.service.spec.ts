import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookService } from './webhook.service';
import { REDIS_CLIENT } from '../../database/redis.module';
import { NormalizedWebhookEvent } from './interfaces/webhook-event.interface';

describe('WebhookService', () => {
  let service: WebhookService;
  let mockRedis: { set: jest.Mock };
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockRedis = { set: jest.fn() };
    mockQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: getQueueToken('webhook-events'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  function createEvent(overrides?: Partial<NormalizedWebhookEvent>): NormalizedWebhookEvent {
    return {
      type: 'payment.succeeded',
      provider: 'stripe',
      providerEventId: 'evt_test_123',
      providerReference: 'pi_abc',
      amount: 5000,
      currency: 'usd',
      raw: {},
      ...overrides,
    };
  }

  describe('processEvent', () => {
    it('publishes a new event to the webhook-events queue', async () => {
      // Redis SET NX returns 'OK' — key was set (new event)
      mockRedis.set.mockResolvedValue('OK');
      mockQueue.add.mockResolvedValue({ id: '1' });

      const event = createEvent();
      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'webhook:dedup:evt_test_123',
        '1',
        'EX',
        604800,
        'NX',
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment.succeeded',
        event,
        expect.objectContaining({
          jobId: 'evt_test_123',
        }),
      );
    });

    it('skips publishing for duplicate events (idempotent)', async () => {
      // Redis SET NX returns null — key already exists (duplicate)
      mockRedis.set.mockResolvedValue(null);

      const event = createEvent();
      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'webhook:dedup:evt_test_123',
        '1',
        'EX',
        604800,
        'NX',
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('uses the correct dedup key with the providerEventId', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockQueue.add.mockResolvedValue({ id: '1' });

      const event = createEvent({ providerEventId: 'evt_paystack_456' });
      await service.processEvent(event);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'webhook:dedup:evt_paystack_456',
        '1',
        'EX',
        604800,
        'NX',
      );
    });

    it('uses the event type as the queue job name', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockQueue.add.mockResolvedValue({ id: '1' });

      const event = createEvent({ type: 'refund.succeeded' });
      await service.processEvent(event);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'refund.succeeded',
        expect.anything(),
        expect.anything(),
      );
    });

    it('sets a 7-day TTL (604800 seconds) on the dedup key', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockQueue.add.mockResolvedValue({ id: '1' });

      const event = createEvent();
      await service.processEvent(event);

      // Verify EX 604800 is passed (7 days in seconds)
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        'EX',
        604800,
        'NX',
      );
    });
  });
});
