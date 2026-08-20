import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { WebhookEventsProcessor } from './webhook-events.processor';
import { WalletService } from '../payments/wallet/wallet.service';
import { NormalizedWebhookEvent } from './interfaces/webhook-event.interface';

describe('WebhookEventsProcessor', () => {
  let processor: WebhookEventsProcessor;
  let walletService: jest.Mocked<WalletService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookEventsProcessor,
        {
          provide: WalletService,
          useValue: {
            completeTopup: jest.fn().mockResolvedValue(undefined),
            refund: jest.fn().mockResolvedValue({
              transactionId: 'txn_123',
              pspRefundId: 'ref_123',
              status: 'succeeded',
            }),
          },
        },
      ],
    }).compile();

    processor = module.get<WebhookEventsProcessor>(WebhookEventsProcessor);
    walletService = module.get(WalletService);
  });

  function createJob(data: NormalizedWebhookEvent, attemptsMade = 0): Job<NormalizedWebhookEvent> {
    return {
      data,
      attemptsMade,
      id: 'job_1',
    } as unknown as Job<NormalizedWebhookEvent>;
  }

  describe('payment.succeeded', () => {
    it('should call walletService.completeTopup with correct params', async () => {
      const event: NormalizedWebhookEvent = {
        type: 'payment.succeeded',
        provider: 'stripe',
        providerEventId: 'evt_123',
        providerReference: 'pi_abc',
        amount: 5000,
        currency: 'usd',
        metadata: { tenantId: 'tenant_1', userId: 'user_1' },
        raw: {},
      };

      await processor.process(createJob(event));

      expect(walletService.completeTopup).toHaveBeenCalledWith({
        tenantId: 'tenant_1',
        userId: 'user_1',
        amount: 5000,
        currency: 'usd',
        providerReference: 'pi_abc',
      });
    });

    it('should throw if tenantId is missing from metadata', async () => {
      const event: NormalizedWebhookEvent = {
        type: 'payment.succeeded',
        provider: 'stripe',
        providerEventId: 'evt_123',
        providerReference: 'pi_abc',
        amount: 5000,
        currency: 'usd',
        metadata: { userId: 'user_1' },
        raw: {},
      };

      await expect(processor.process(createJob(event))).rejects.toThrow(
        'Missing required metadata (tenantId/userId)',
      );
    });

    it('should throw if userId is missing from metadata', async () => {
      const event: NormalizedWebhookEvent = {
        type: 'payment.succeeded',
        provider: 'stripe',
        providerEventId: 'evt_123',
        providerReference: 'pi_abc',
        amount: 5000,
        currency: 'usd',
        metadata: { tenantId: 'tenant_1' },
        raw: {},
      };

      await expect(processor.process(createJob(event))).rejects.toThrow(
        'Missing required metadata (tenantId/userId)',
      );
    });
  });

  describe('refund.succeeded', () => {
    it('should call walletService.refund with correct params', async () => {
      const event: NormalizedWebhookEvent = {
        type: 'refund.succeeded',
        provider: 'stripe',
        providerEventId: 'evt_456',
        providerReference: 'pi_original',
        amount: 2500,
        currency: 'usd',
        metadata: { tenantId: 'tenant_1', userId: 'user_2' },
        raw: {},
      };

      await processor.process(createJob(event));

      expect(walletService.refund).toHaveBeenCalledWith('tenant_1', {
        userId: 'user_2',
        paymentId: 'pi_original',
        amount: 2500,
        currency: 'usd',
        reason: 'Refund via PSP webhook',
      });
    });

    it('should throw if metadata is missing for refund', async () => {
      const event: NormalizedWebhookEvent = {
        type: 'refund.succeeded',
        provider: 'paystack',
        providerEventId: 'evt_789',
        providerReference: 'ref_xyz',
        amount: 1000,
        currency: 'ngn',
        metadata: undefined,
        raw: {},
      };

      await expect(processor.process(createJob(event))).rejects.toThrow(
        'Missing required metadata (tenantId/userId)',
      );
    });
  });

  describe('unknown event types', () => {
    it('should skip unknown event types without throwing', async () => {
      const event: NormalizedWebhookEvent = {
        type: 'payout.succeeded',
        provider: 'stripe',
        providerEventId: 'evt_999',
        providerReference: 'po_123',
        amount: 10000,
        currency: 'usd',
        metadata: { tenantId: 'tenant_1', userId: 'user_1' },
        raw: {},
      };

      await expect(processor.process(createJob(event))).resolves.toBeUndefined();
      expect(walletService.completeTopup).not.toHaveBeenCalled();
      expect(walletService.refund).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('should log structured failure details', () => {
      const event: NormalizedWebhookEvent = {
        type: 'payment.succeeded',
        provider: 'stripe',
        providerEventId: 'evt_fail',
        providerReference: 'pi_fail',
        amount: 3000,
        currency: 'usd',
        metadata: { tenantId: 'tenant_1', userId: 'user_1' },
        raw: {},
      };

      const job = createJob(event, 3);
      const error = new Error('Connection timeout');

      // Should not throw — it just logs
      expect(() => processor.onFailed(job, error)).not.toThrow();
    });
  });
});
