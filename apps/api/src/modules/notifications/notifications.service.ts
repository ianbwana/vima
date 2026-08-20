import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { ControlPlaneDbService } from '../../database/control-plane-db.service';
import { eq } from 'drizzle-orm';
import * as cpSchema from '../../database/schemas/control-plane.schema';
import { NotificationPayload, NotificationJob } from './interfaces/notification-event.interface';
import { NotificationChannel } from './interfaces/channel-provider.interface';
import { TemplateService } from './templates/template.service';
import { TenantDbService } from '../../database/tenant-db.service';
import * as tenantSchema from '../../database/schemas/tenant.schema';

/**
 * NotificationService
 *
 * Core dispatch service for all notifications. Handles:
 * - Deduplication via Redis SETNX (idempotencyKey, 1-hour TTL)
 * - Rate limiting via Redis sliding window (per-user, per-channel)
 * - Quiet hours enforcement (tenant-configurable)
 * - Template rendering
 * - Recipient resolution (user lookup or recipientOverride)
 * - BullMQ enqueue for async delivery
 *
 * Critical priority bypasses rate limits and quiet hours.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** Rate limit defaults: [maxCount, windowSeconds] */
  private static readonly RATE_LIMITS: Record<NotificationChannel, [number, number]> = {
    sms: [5, 3600],        // 5 per hour
    push: [20, 3600],      // 20 per hour
    whatsapp: [5, 3600],   // 5 per hour
    email: [10, 3600],     // 10 per hour
  };

  /** Deduplication TTL: 1 hour in seconds */
  private static readonly DEDUP_TTL_SECONDS = 3600;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
    private readonly templateService: TemplateService,
    private readonly tenantDb: TenantDbService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {}

  /**
   * Dispatch a notification for async delivery.
   *
   * Flow:
   * 1. Deduplicate (if idempotencyKey provided)
   * 2. Check rate limit (skip for critical)
   * 3. Check quiet hours (skip for critical)
   * 4. Render template
   * 5. Resolve recipient
   * 6. Enqueue to BullMQ
   */
  async send(payload: NotificationPayload): Promise<void> {
    const { tenantId, userId, channel, templateKey, priority = 'normal' } = payload;
    const isCritical = priority === 'critical';

    // 1. Deduplication check
    if (payload.idempotencyKey) {
      const isDuplicate = await this.checkDuplicate(payload.idempotencyKey);
      if (isDuplicate) {
        this.logger.debug(
          `Notification deduplicated: key=${payload.idempotencyKey} template=${templateKey}`,
        );
        return;
      }
    }

    // 2. Rate limit check (bypassed for critical)
    if (!isCritical) {
      const isRateLimited = await this.checkRateLimit(tenantId, userId, channel);
      if (isRateLimited) {
        this.logger.log(
          `Notification rate-limited: user=${userId} channel=${channel} template=${templateKey}`,
        );
        // Log as rate_limited for tracking
        await this.logDelivery(tenantId, userId, channel, templateKey, 'rate_limited');
        return;
      }
    }

    // 3. Quiet hours check (bypassed for critical)
    if (!isCritical) {
      const isQuietHours = await this.isWithinQuietHours(tenantId);
      if (isQuietHours) {
        this.logger.debug(
          `Notification suppressed (quiet hours): user=${userId} channel=${channel} template=${templateKey}`,
        );
        return;
      }
    }

    // 4. Render template
    const rendered = this.templateService.render(
      templateKey,
      channel,
      payload.templateData || {},
    );

    if (!rendered) {
      this.logger.warn(
        `Cannot render template: key=${templateKey} channel=${channel}`,
      );
      return;
    }

    // 5. Resolve recipient
    const recipient = await this.resolveRecipient(tenantId, userId, channel, payload.recipientOverride);
    if (!recipient) {
      this.logger.warn(
        `Cannot resolve recipient: user=${userId} channel=${channel} tenant=${tenantId}`,
      );
      return;
    }

    // 6. Enqueue job
    const job: NotificationJob = {
      payload,
      recipient,
      title: rendered.title,
      body: rendered.body,
      htmlBody: rendered.htmlBody,
    };

    await this.notificationQueue.add(
      `${channel}:${templateKey}`,
      job,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    // Increment rate limit counter
    if (!isCritical) {
      await this.incrementRateLimit(tenantId, userId, channel);
    }

    this.logger.log(
      `Notification enqueued: channel=${channel} template=${templateKey} user=${userId}`,
    );
  }

  /**
   * Check if a notification with the given idempotency key has already been processed.
   * Sets the key with 1-hour TTL on first encounter.
   */
  private async checkDuplicate(idempotencyKey: string): Promise<boolean> {
    const key = `notif:dedup:${idempotencyKey}`;
    const result = await this.redis.set(
      key,
      '1',
      'EX',
      NotificationsService.DEDUP_TTL_SECONDS,
      'NX',
    );
    return result === null; // null means key already existed (duplicate)
  }

  /**
   * Check if the user has exceeded the rate limit for the given channel.
   * Uses a Redis counter with expiry per user per channel.
   */
  private async checkRateLimit(
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const [maxCount] = NotificationsService.RATE_LIMITS[channel];
    const key = `notif:rate:${tenantId}:${userId}:${channel}`;
    const count = await this.redis.get(key);
    return count !== null && parseInt(count, 10) >= maxCount;
  }

  /**
   * Increment the rate limit counter for a user/channel.
   * Sets TTL on first increment within the window.
   */
  private async incrementRateLimit(
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
  ): Promise<void> {
    const [, windowSeconds] = NotificationsService.RATE_LIMITS[channel];
    const key = `notif:rate:${tenantId}:${userId}:${channel}`;

    const multi = this.redis.multi();
    multi.incr(key);
    multi.expire(key, windowSeconds);
    await multi.exec();
  }

  /**
   * Check if the current time falls within the tenant's quiet hours.
   */
  private async isWithinQuietHours(tenantId: string): Promise<boolean> {
    try {
      const db = this.controlPlaneDb.db;
      const [quietHours] = await db
        .select()
        .from(cpSchema.tenantQuietHours)
        .where(eq(cpSchema.tenantQuietHours.tenantId, tenantId))
        .limit(1);

      if (!quietHours) return false;

      // Get current hour in tenant's timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: quietHours.timezone,
      });
      const currentHour = parseInt(formatter.format(now), 10);

      const { startHour, endHour } = quietHours;

      // Handle overnight ranges (e.g., 22:00–07:00)
      if (startHour > endHour) {
        return currentHour >= startHour || currentHour < endHour;
      }

      return currentHour >= startHour && currentHour < endHour;
    } catch (error) {
      this.logger.error(`Error checking quiet hours: ${error}`);
      return false; // Fail open: deliver if unsure
    }
  }

  /**
   * Resolve the notification recipient based on channel type.
   * - SMS/WhatsApp: user's phone number
   * - Email: user's email address
   * - Push: handled separately in processor (multiple devices)
   *
   * recipientOverride takes precedence over user lookup.
   */
  private async resolveRecipient(
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
    recipientOverride?: string,
  ): Promise<string | null> {
    if (recipientOverride) {
      return recipientOverride;
    }

    // For push, we use a placeholder; the processor resolves device tokens
    if (channel === 'push') {
      return `push:${userId}`;
    }

    try {
      const db = this.tenantDb.getConnection(tenantId);
      const [user] = await db
        .select({ phone: tenantSchema.users.phone, email: tenantSchema.users.email })
        .from(tenantSchema.users)
        .where(eq(tenantSchema.users.id, userId))
        .limit(1);

      if (!user) return null;

      switch (channel) {
        case 'sms':
        case 'whatsapp':
          return user.phone || null;
        case 'email':
          return user.email || null;
        default:
          return null;
      }
    } catch (error) {
      this.logger.error(`Error resolving recipient: user=${userId} error=${error}`);
      return null;
    }
  }

  /**
   * Log a delivery status (used for rate-limited notifications).
   * Full delivery logging happens in the processor.
   */
  private async logDelivery(
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
    templateKey: string,
    status: 'rate_limited',
  ): Promise<void> {
    try {
      const db = this.tenantDb.getConnection(tenantId);
      await db.insert(tenantSchema.notificationLogs).values({
        userId,
        channel,
        templateKey,
        status,
      });
    } catch (error) {
      this.logger.error(`Error logging notification delivery: ${error}`);
    }
  }
}
