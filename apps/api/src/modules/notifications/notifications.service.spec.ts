import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { TemplateService } from './templates/template.service';
import { TenantDbService } from '../../database/tenant-db.service';
import { ControlPlaneDbService } from '../../database/control-plane-db.service';
import { REDIS_CLIENT } from '../../database/redis.module';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockRedis: Record<string, jest.Mock>;
  let mockQueue: Record<string, jest.Mock>;
  let mockTemplateService: Partial<TemplateService>;
  let mockTenantDb: Partial<TenantDbService>;
  let mockControlPlaneDb: Partial<ControlPlaneDbService>;

  beforeEach(async () => {
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      multi: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockTemplateService = {
      render: jest.fn().mockReturnValue({
        title: 'Test Title',
        body: 'Test body message',
      }),
    };

    mockTenantDb = {
      getConnection: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ phone: '+254700000000', email: 'test@example.com' }]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    mockControlPlaneDb = {
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
        { provide: TemplateService, useValue: mockTemplateService },
        { provide: TenantDbService, useValue: mockTenantDb },
        { provide: ControlPlaneDbService, useValue: mockControlPlaneDb },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('send()', () => {
    const basePayload = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      channel: 'sms' as const,
      templateKey: 'otp.requested',
      templateData: { otp: '123456', appName: 'Vima' },
    };

    it('should enqueue a notification successfully', async () => {
      await service.send(basePayload);

      expect(mockTemplateService.render).toHaveBeenCalledWith(
        'otp.requested',
        'sms',
        { otp: '123456', appName: 'Vima' },
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sms:otp.requested',
        expect.objectContaining({
          payload: basePayload,
          recipient: '+254700000000',
          body: 'Test body message',
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      );
    });

    it('should deduplicate notifications with the same idempotency key', async () => {
      // First call: Redis SET returns null (key already exists)
      mockRedis.set.mockResolvedValue(null);

      await service.send({ ...basePayload, idempotencyKey: 'dedup-key-1' });

      // Should NOT enqueue since it's a duplicate
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should allow first notification with an idempotency key', async () => {
      // Redis SET returns 'OK' (key was set, meaning it's new)
      mockRedis.set.mockResolvedValue('OK');

      await service.send({ ...basePayload, idempotencyKey: 'dedup-key-2' });

      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should reject rate-limited notifications', async () => {
      // Simulate rate limit exceeded: Redis GET returns count >= limit
      mockRedis.get.mockResolvedValue('5'); // 5 >= 5 SMS per hour

      await service.send(basePayload);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should bypass rate limits for critical priority', async () => {
      mockRedis.get.mockResolvedValue('100'); // Way over limit

      await service.send({ ...basePayload, priority: 'critical' });

      // Critical bypasses rate limits
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should suppress notifications during quiet hours', async () => {
      // Mock quiet hours config that covers current hour
      const currentHour = new Date().getHours();
      (mockControlPlaneDb.db as any).select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              startHour: 0,
              endHour: 23, // Covers all hours
              timezone: 'UTC',
            }]),
          }),
        }),
      });

      await service.send(basePayload);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should bypass quiet hours for critical priority', async () => {
      // Mock quiet hours covering all hours
      (mockControlPlaneDb.db as any).select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              startHour: 0,
              endHour: 23,
              timezone: 'UTC',
            }]),
          }),
        }),
      });

      await service.send({ ...basePayload, priority: 'critical' });

      // Critical bypasses quiet hours
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should use recipientOverride when provided', async () => {
      await service.send({
        ...basePayload,
        recipientOverride: '+1234567890',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sms:otp.requested',
        expect.objectContaining({ recipient: '+1234567890' }),
        expect.any(Object),
      );
    });

    it('should not enqueue when template cannot be rendered', async () => {
      (mockTemplateService.render as jest.Mock).mockReturnValue(null);

      await service.send(basePayload);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should use push:userId as recipient for push channel', async () => {
      (mockTemplateService.render as jest.Mock).mockReturnValue({
        title: 'Payment confirmed',
        body: 'Your payment was successful',
      });

      await service.send({
        ...basePayload,
        channel: 'push',
        templateKey: 'payment.succeeded',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'push:payment.succeeded',
        expect.objectContaining({ recipient: 'push:user-1' }),
        expect.any(Object),
      );
    });
  });
});
