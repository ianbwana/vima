import { Injectable, Logger } from '@nestjs/common';
import { TenantDbService } from '../../database/tenant-db.service';
import * as tenantSchema from '../../database/schemas/tenant.schema';
import { NotificationChannel } from './interfaces/channel-provider.interface';

/**
 * Delivery log metadata that can be stored alongside a notification log entry.
 */
export interface DeliveryLogMetadata {
  providerMessageId?: string;
  errorMessage?: string;
  devicesTargeted?: number;
  devicesSucceeded?: number;
  [key: string]: unknown;
}

/**
 * Delivery Logger Service
 *
 * Records all notification delivery attempts in the tenant's
 * notification_logs table for support debugging and analytics.
 *
 * Logs are retained for 30 days (cleanup handled by a separate cron job).
 */
@Injectable()
export class DeliveryLogger {
  private readonly logger = new Logger(DeliveryLogger.name);

  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Log a notification delivery attempt.
   *
   * @param tenantId - Tenant context
   * @param userId - Target user
   * @param channel - Delivery channel
   * @param templateKey - Template used
   * @param status - Delivery status
   * @param metadata - Additional delivery details
   */
  async log(
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
    templateKey: string,
    status: 'queued' | 'sent' | 'delivered' | 'failed' | 'rate_limited',
    metadata?: DeliveryLogMetadata,
  ): Promise<void> {
    try {
      const db = this.tenantDb.getConnection(tenantId);

      await db.insert(tenantSchema.notificationLogs).values({
        userId,
        channel,
        templateKey,
        status,
        providerMessageId: metadata?.providerMessageId || null,
        errorMessage: metadata?.errorMessage || null,
        metadata: metadata ? (metadata as Record<string, unknown>) : null,
      });
    } catch (error) {
      // Log but don't throw — delivery logging should never block notification delivery
      this.logger.error(
        `Failed to log notification delivery: tenant=${tenantId} user=${userId} ` +
          `channel=${channel} status=${status} error=${error}`,
      );
    }
  }

  /**
   * Query delivery logs for a user (for support/debugging).
   *
   * @param tenantId - Tenant context
   * @param userId - User to query
   * @param limit - Maximum number of logs to return
   */
  async getLogsForUser(
    tenantId: string,
    userId: string,
    limit = 50,
  ) {
    const db = this.tenantDb.getConnection(tenantId);
    const { eq, desc } = await import('drizzle-orm');

    return db
      .select()
      .from(tenantSchema.notificationLogs)
      .where(eq(tenantSchema.notificationLogs.userId, userId))
      .orderBy(desc(tenantSchema.notificationLogs.createdAt))
      .limit(limit);
  }
}
