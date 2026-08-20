import * as crypto from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookIngressController } from './webhook-ingress.controller';
import { WebhookService } from './webhook.service';
import { PspConnectionService } from '../payments/psp-connection/psp-connection.service';
import { PspProvider } from '../payments/psp-connection/dto/connect-psp.dto';
import { REDIS_CLIENT } from '../../database/redis.module';

/**
 * Integration tests for the Webhook E2E flow.
 *
 * Tests the complete path:
 *   HTTP request → signature verification → normalization → deduplication → queue publish
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * These tests mock Redis and BullMQ queue so they can run without external dependencies.
 * The PspConnectionService is mocked to return test credentials.
 */

// --- Test constants ---
const STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_12345';
const PAYSTACK_SECRET_KEY = 'sk_test_paystack_secret_key';

// --- Signature helpers ---

/**
 * Generate a valid Stripe webhook signature header.
 * Stripe uses the format: t=<timestamp>,v1=<signature>
 * where signature = HMAC-SHA256(timestamp + '.' + payload, webhookSecret)
 */
function generateStripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Generate a valid Paystack webhook signature header.
 * Paystack uses HMAC-SHA512 of the raw body signed with the secret key.
 */
function generatePaystackSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha512', secret)
    .update(payload)
    .digest('hex');
}

// --- Test payload factories ---

function createStripePaymentIntentSucceededPayload(): object {
  return {
    id: 'evt_stripe_test_001',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_123',
        object: 'payment_intent',
        amount: 5000,
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          tenantId: 'tenant_abc',
          userId: 'user_xyz',
        },
      },
    },
  };
}

function createPaystackChargeSuccessPayload(): object {
  return {
    event: 'charge.success',
    data: {
      id: 98765,
      reference: 'ref_paystack_001',
      amount: 100000,
      currency: 'NGN',
      status: 'success',
      metadata: {
        tenantId: 'tenant_abc',
        userId: 'user_xyz',
      },
    },
  };
}

describe('Webhook E2E Integration Tests', () => {
  let app: INestApplication;
  let mockRedis: { set: jest.Mock };
  let mockQueue: { add: jest.Mock };
  let mockPspConnectionService: {
    findConnectionsByProvider: jest.Mock;
    decryptCredentials: jest.Mock;
  };

  beforeAll(async () => {
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job_1' }),
    };

    mockPspConnectionService = {
      findConnectionsByProvider: jest.fn(),
      decryptCredentials: jest.fn(),
    };

    // Configure mock PspConnectionService to return test credentials
    mockPspConnectionService.findConnectionsByProvider.mockImplementation(
      (provider: PspProvider) => {
        if (provider === PspProvider.STRIPE) {
          return Promise.resolve([
            {
              id: 'conn_stripe_1',
              tenantId: 'tenant_abc',
              provider: 'stripe',
              verified: true,
              lastVerifiedAt: new Date(),
              createdAt: new Date(),
            },
          ]);
        }
        if (provider === PspProvider.PAYSTACK) {
          return Promise.resolve([
            {
              id: 'conn_paystack_1',
              tenantId: 'tenant_abc',
              provider: 'paystack',
              verified: true,
              lastVerifiedAt: new Date(),
              createdAt: new Date(),
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    mockPspConnectionService.decryptCredentials.mockImplementation(
      (_tenantId: string, provider: PspProvider) => {
        if (provider === PspProvider.STRIPE) {
          return Promise.resolve({
            secretKey: 'sk_test_stripe_key',
            webhookSecret: STRIPE_WEBHOOK_SECRET,
          });
        }
        if (provider === PspProvider.PAYSTACK) {
          return Promise.resolve({
            secretKey: PAYSTACK_SECRET_KEY,
          });
        }
        return Promise.reject(new Error('Unknown provider'));
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WebhookIngressController],
      providers: [
        WebhookService,
        { provide: PspConnectionService, useValue: mockPspConnectionService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: getQueueToken('webhook-events'), useValue: mockQueue },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Enable raw body access for signature verification
    app.use(
      require('express').json({
        verify: (req: any, _res: any, buf: Buffer) => {
          req.rawBody = buf;
        },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Reset queue and redis mocks between tests
    mockRedis.set.mockClear();
    mockRedis.set.mockResolvedValue('OK');
    mockQueue.add.mockClear();
    mockQueue.add.mockResolvedValue({ id: 'job_1' });
  });

  describe('Stripe webhook - payment_intent.succeeded (Requirement 5.1, 5.2)', () => {
    it('should verify signature, normalize event, and publish to queue', async () => {
      const payload = createStripePaymentIntentSucceededPayload();
      const payloadStr = JSON.stringify(payload);
      const signature = generateStripeSignature(payloadStr, STRIPE_WEBHOOK_SECRET);

      const response = await request(app.getHttpServer())
        .post('/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payloadStr);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });

      // Wait briefly for async processEvent fire-and-forget to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify deduplication check was made
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('webhook:dedup:'),
        '1',
        'EX',
        604800,
        'NX',
      );

      // Verify event was published to BullMQ queue
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment.succeeded',
        expect.objectContaining({
          type: 'payment.succeeded',
          provider: 'stripe',
          providerEventId: 'evt_stripe_test_001',
          amount: 5000,
          currency: 'usd',
        }),
        expect.objectContaining({
          jobId: 'evt_stripe_test_001',
          attempts: 3,
        }),
      );
    });
  });

  describe('Paystack webhook - charge.success (Requirement 5.1, 5.2)', () => {
    it('should verify HMAC-SHA512 signature, normalize event, and publish to queue', async () => {
      const payload = createPaystackChargeSuccessPayload();
      const payloadStr = JSON.stringify(payload);
      const signature = generatePaystackSignature(payloadStr, PAYSTACK_SECRET_KEY);

      const response = await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payloadStr);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });

      // Wait briefly for async processEvent to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify deduplication check
      expect(mockRedis.set).toHaveBeenCalledWith(
        'webhook:dedup:98765',
        '1',
        'EX',
        604800,
        'NX',
      );

      // Verify normalized event published to queue
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment.succeeded',
        expect.objectContaining({
          type: 'payment.succeeded',
          provider: 'paystack',
          providerEventId: '98765',
          providerReference: 'ref_paystack_001',
          amount: 100000,
          currency: 'NGN',
        }),
        expect.objectContaining({
          jobId: '98765',
          attempts: 3,
        }),
      );
    });
  });

  describe('Invalid Stripe signature (Requirement 5.3)', () => {
    it('should return 401 when stripe-signature header is missing', async () => {
      const payload = createStripePaymentIntentSucceededPayload();
      const payloadStr = JSON.stringify(payload);

      const response = await request(app.getHttpServer())
        .post('/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(payloadStr);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid webhook signature');

      // Verify no event was published
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return 401 when stripe-signature is incorrect', async () => {
      const payload = createStripePaymentIntentSucceededPayload();
      const payloadStr = JSON.stringify(payload);

      // Use a wrong secret to generate an invalid signature
      const badSignature = generateStripeSignature(payloadStr, 'whsec_wrong_secret');

      const response = await request(app.getHttpServer())
        .post('/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', badSignature)
        .send(payloadStr);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid webhook signature');

      // Verify no event was published
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Invalid Paystack signature (Requirement 5.3)', () => {
    it('should return 401 when x-paystack-signature header is missing', async () => {
      const payload = createPaystackChargeSuccessPayload();
      const payloadStr = JSON.stringify(payload);

      const response = await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .send(payloadStr);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid webhook signature');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return 401 when x-paystack-signature is tampered', async () => {
      const payload = createPaystackChargeSuccessPayload();
      const payloadStr = JSON.stringify(payload);

      // Tampered signature (signed with wrong key)
      const badSignature = generatePaystackSignature(payloadStr, 'wrong_secret_key');

      const response = await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', badSignature)
        .send(payloadStr);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid webhook signature');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Unknown provider (Requirement 5.1)', () => {
    it('should return 404 for an unsupported provider', async () => {
      const response = await request(app.getHttpServer())
        .post('/webhooks/unknown-provider')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ event: 'test' }));

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Unknown webhook provider');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
