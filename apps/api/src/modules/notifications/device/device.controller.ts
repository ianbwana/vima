import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DeviceService } from './device.service';
import { RegisterDeviceDto, UpdateNotificationPreferenceDto } from '../dto/register-device.dto';
import { TenantDbService } from '../../../database/tenant-db.service';
import { eq, and } from 'drizzle-orm';
import * as tenantSchema from '../../../database/schemas/tenant.schema';
import { DeliveryLogger } from '../delivery-logger.service';

/**
 * Device & Preferences Controller
 *
 * Endpoints for managing push notification device tokens and
 * user notification preferences (opt-in/out by category/channel).
 *
 * All endpoints require authentication. The tenant context and user ID
 * are extracted from the JWT token on the request.
 */
@Controller('notifications')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly tenantDb: TenantDbService,
    private readonly deliveryLogger: DeliveryLogger,
  ) {}

  /**
   * Register a device for push notifications.
   * POST /notifications/devices
   */
  @Post('devices')
  async registerDevice(
    @Req() req: any,
    @Body() dto: RegisterDeviceDto,
  ) {
    const { tenantId, sub: userId } = req.user;

    await this.deviceService.registerDevice(
      tenantId,
      userId,
      dto.deviceId,
      dto.platform,
      dto.fcmToken,
    );

    return { success: true, message: 'Device registered' };
  }

  /**
   * Unregister a device.
   * DELETE /notifications/devices/:deviceId
   */
  @Delete('devices/:deviceId')
  async unregisterDevice(
    @Req() req: any,
    @Param('deviceId') deviceId: string,
  ) {
    const { tenantId, sub: userId } = req.user;
    await this.deviceService.unregisterDevice(tenantId, userId, deviceId);
    return { success: true, message: 'Device unregistered' };
  }

  /**
   * Get user's notification preferences.
   * GET /notifications/preferences
   */
  @Get('preferences')
  async getPreferences(@Req() req: any) {
    const { tenantId, sub: userId } = req.user;
    const db = this.tenantDb.getConnection(tenantId);

    const preferences = await db
      .select()
      .from(tenantSchema.notificationPreferences)
      .where(eq(tenantSchema.notificationPreferences.userId, userId));

    return { preferences };
  }

  /**
   * Update a notification preference (opt-in/out for a category+channel).
   * PATCH /notifications/preferences
   */
  @Patch('preferences')
  async updatePreference(
    @Req() req: any,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    const { tenantId, sub: userId } = req.user;
    const db = this.tenantDb.getConnection(tenantId);

    // Upsert: check if preference exists
    const [existing] = await db
      .select()
      .from(tenantSchema.notificationPreferences)
      .where(
        and(
          eq(tenantSchema.notificationPreferences.userId, userId),
          eq(tenantSchema.notificationPreferences.category, dto.category),
          eq(tenantSchema.notificationPreferences.channel, dto.channel),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(tenantSchema.notificationPreferences)
        .set({ enabled: dto.enabled, updatedAt: new Date() })
        .where(eq(tenantSchema.notificationPreferences.id, existing.id));
    } else {
      await db.insert(tenantSchema.notificationPreferences).values({
        userId,
        category: dto.category,
        channel: dto.channel,
        enabled: dto.enabled,
      });
    }

    return { success: true, message: 'Preference updated' };
  }

  /**
   * Get notification delivery logs for the current user (for debugging).
   * GET /notifications/logs
   */
  @Get('logs')
  async getLogs(@Req() req: any) {
    const { tenantId, sub: userId } = req.user;
    const logs = await this.deliveryLogger.getLogsForUser(tenantId, userId);
    return { logs };
  }
}
