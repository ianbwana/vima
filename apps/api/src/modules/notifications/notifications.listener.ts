import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import {
  OtpRequestedEvent,
  PaymentSucceededEvent,
  PayoutCompletedEvent,
} from './interfaces/notification-event.interface';

/**
 * Notification Listener
 *
 * Reacts to domain events emitted across the platform and maps them
 * to notification dispatches. New event handlers are added here as
 * new verticals (ride-hailing, food delivery, etc.) come online.
 *
 * Each handler constructs a NotificationPayload and calls
 * NotificationService.send() for async delivery.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * OTP requested — Send verification code via SMS.
   * Critical priority: bypasses rate limits and quiet hours.
   */
  @OnEvent('otp.requested')
  async handleOtpRequested(event: OtpRequestedEvent): Promise<void> {
    this.logger.debug(`Event received: otp.requested for phone=${event.phone}`);

    await this.notificationsService.send({
      tenantId: event.tenantId,
      userId: event.phone, // Use phone as user identifier for OTP (user may not exist yet)
      channel: 'sms',
      templateKey: 'otp.requested',
      templateData: {
        otp: event.otp,
        appName: 'Vima', // Could be resolved from tenant theme
      },
      priority: 'critical',
      recipientOverride: event.phone,
      idempotencyKey: `otp:${event.phone}:${event.otp}`,
    });
  }

  /**
   * Payment succeeded — Notify customer via push notification.
   */
  @OnEvent('payment.succeeded')
  async handlePaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    this.logger.debug(`Event received: payment.succeeded for user=${event.userId}`);

    await this.notificationsService.send({
      tenantId: event.tenantId,
      userId: event.userId,
      channel: 'push',
      templateKey: 'payment.succeeded',
      templateData: {
        amount: event.amount.toFixed(2),
        currency: event.currency,
        description: 'Wallet top-up',
      },
      priority: 'normal',
      idempotencyKey: `payment:${event.tenantId}:${event.userId}:${event.amount}:${Date.now()}`,
    });
  }

  /**
   * Payout completed — Notify provider via push notification.
   */
  @OnEvent('payout.completed')
  async handlePayoutCompleted(event: PayoutCompletedEvent): Promise<void> {
    this.logger.debug(`Event received: payout.completed for user=${event.userId}`);

    await this.notificationsService.send({
      tenantId: event.tenantId,
      userId: event.userId,
      channel: 'push',
      templateKey: 'payout.completed',
      templateData: {
        amount: event.amount.toFixed(2),
        currency: event.currency,
        destination: 'your bank account',
      },
      priority: 'normal',
      idempotencyKey: `payout:${event.tenantId}:${event.userId}:${event.amount}:${Date.now()}`,
    });
  }
}
