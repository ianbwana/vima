import { Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as tenantSchema from '../../../database/schemas/tenant.schema';

/**
 * Device Service
 *
 * Manages user device registrations for push notifications (FCM tokens).
 * Supports multiple devices per user, upsert on re-registration, and
 * deactivation of stale tokens.
 */
@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Register or update a device token for a user.
   * If the deviceId already exists for the user, updates the token.
   */
  async registerDevice(
    tenantId: string,
    userId: string,
    deviceId: string,
    platform: 'ios' | 'android' | 'web',
    fcmToken: string,
  ): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    // Check if device already registered for this user
    const [existing] = await db
      .select()
      .from(tenantSchema.userDevices)
      .where(
        and(
          eq(tenantSchema.userDevices.userId, userId),
          eq(tenantSchema.userDevices.deviceId, deviceId),
        ),
      )
      .limit(1);

    if (existing) {
      // Update token and reactivate if previously deactivated
      await db
        .update(tenantSchema.userDevices)
        .set({
          fcmToken,
          platform,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(tenantSchema.userDevices.id, existing.id));

      this.logger.log(`Device updated: user=${userId} deviceId=${deviceId}`);
    } else {
      await db.insert(tenantSchema.userDevices).values({
        userId,
        deviceId,
        platform,
        fcmToken,
        active: true,
      });

      this.logger.log(`Device registered: user=${userId} deviceId=${deviceId} platform=${platform}`);
    }
  }

  /**
   * Unregister a device (mark as inactive).
   */
  async unregisterDevice(
    tenantId: string,
    userId: string,
    deviceId: string,
  ): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    await db
      .update(tenantSchema.userDevices)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(tenantSchema.userDevices.userId, userId),
          eq(tenantSchema.userDevices.deviceId, deviceId),
        ),
      );

    this.logger.log(`Device unregistered: user=${userId} deviceId=${deviceId}`);
  }

  /**
   * Get all active device tokens for a user.
   * Used by the notification processor for push fan-out.
   */
  async getActiveDevices(
    tenantId: string,
    userId: string,
  ): Promise<Array<{ deviceId: string; platform: string; fcmToken: string }>> {
    const db = this.tenantDb.getConnection(tenantId);

    return db
      .select({
        deviceId: tenantSchema.userDevices.deviceId,
        platform: tenantSchema.userDevices.platform,
        fcmToken: tenantSchema.userDevices.fcmToken,
      })
      .from(tenantSchema.userDevices)
      .where(
        and(
          eq(tenantSchema.userDevices.userId, userId),
          eq(tenantSchema.userDevices.active, true),
        ),
      );
  }

  /**
   * Deactivate a stale FCM token.
   * Called when FCM reports a token as unregistered/invalid.
   */
  async deactivateToken(tenantId: string, fcmToken: string): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    await db
      .update(tenantSchema.userDevices)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(tenantSchema.userDevices.fcmToken, fcmToken));

    this.logger.log(`Stale FCM token deactivated: token=${fcmToken.slice(0, 20)}...`);
  }
}
