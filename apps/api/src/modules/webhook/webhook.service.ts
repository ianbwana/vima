import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { NormalizedWebhookEvent } from './interfaces/webhook-event.interface';

/**
 * Handles post-verification webhook event processing.
 *
 * Responsibilities:
 * - Deduplication by providerEventId using Redis SETNX with 7-day TTL
 * - Publishing normalized events to BullMQ 'webhook-events' queue for async processing
 *
 * Requirements:
 * - 5.2: Normalize events into NormalizedWebhookEvent format
 * - 5.4: Deduplicate by providerEventId (idempotent processing)
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  /** Redis key prefix for webhook deduplication */
  private static readonly DEDUP_KEY_PREFIX = 'webhook:dedup:';

  /** TTL for deduplication keys: 7 days in seconds */
  private static readonly DEDUP_TTL_SECONDS = 604800;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue('webhook-events') private readonly webhookQueue: Queue,
  ) {}

  /**
   * Process a verified and normalized webhook event.
   *
   * 1. Check deduplication (Redis SETNX with TTL)
   * 2. If duplicate → return true (idempotent, no re-processing)
   * 3. If new → publish to BullMQ 'webhook-events' queue
   * 4. Return true on success
   *
   * @param event - The normalized webhook event from the PSP adapter
   * @returns true if the event was accepted (either new or duplicate — both are success)
   */
  async processEvent(event: NormalizedWebhookEvent): Promise<boolean> {
    const dedupKey = `${WebhookService.DEDUP_KEY_PREFIX}${event.providerEventId}`;

    // Attempt to set the dedup key. SETNX returns 'OK' if the key was set (new event),
    // or null if the key already exists (duplicate event).
    const result = await this.redis.set(
      dedupKey,
      '1',
      'EX',
      WebhookService.DEDUP_TTL_SECONDS,
      'NX',
    );

    if (result === null) {
      // Key already exists — this is a duplicate event
      this.logger.log(
        `Duplicate webhook event skipped: providerEventId=${event.providerEventId} provider=${event.provider}`,
      );
      return true;
    }

    // New event — publish to BullMQ queue for async processing
    // Configured with 3 retry attempts and exponential backoff (1s base delay)
    // per requirement 5.5
    await this.webhookQueue.add(
      event.type,
      event,
      {
        jobId: event.providerEventId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    this.logger.log(
      `Webhook event published: type=${event.type} provider=${event.provider} eventId=${event.providerEventId}`,
    );

    return true;
  }
}
