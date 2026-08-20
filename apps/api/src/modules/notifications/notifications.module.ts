import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsListener } from './notifications.listener';
import { ProviderRegistry } from './providers/provider-registry';
import { TemplateService } from './templates/template.service';
import { DeviceService } from './device/device.service';
import { DeviceController } from './device/device.controller';
import { DeliveryLogger } from './delivery-logger.service';

/**
 * Notifications Module
 *
 * Cross-cutting notification infrastructure supporting push (FCM), SMS (Twilio/Africa's Talking),
 * WhatsApp, and email (Resend) channels. All dispatch is async via BullMQ.
 *
 * Provides NotificationService for imperative sends and NotificationListener for
 * event-driven dispatch via @nestjs/event-emitter.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  controllers: [DeviceController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    NotificationsListener,
    ProviderRegistry,
    TemplateService,
    DeviceService,
    DeliveryLogger,
  ],
  exports: [NotificationsService, DeviceService],
})
export class NotificationsModule {}
