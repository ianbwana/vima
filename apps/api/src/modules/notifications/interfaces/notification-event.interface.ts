import { NotificationChannel, NotificationPriority } from './channel-provider.interface';

/**
 * Payload for dispatching a notification via NotificationService.send().
 * This is the primary interface used by calling modules.
 */
export interface NotificationPayload {
  /** Tenant context for multi-tenant isolation */
  tenantId: string;

  /** Target user ID (used to resolve recipient details and device tokens) */
  userId: string;

  /** Delivery channel */
  channel: NotificationChannel;

  /** Template key for message content resolution (e.g., 'otp.requested') */
  templateKey: string;

  /** Variables for template interpolation */
  templateData?: Record<string, string>;

  /** Priority level: 'critical' bypasses rate limits and quiet hours */
  priority?: NotificationPriority;

  /**
   * Idempotency key for deduplication.
   * If omitted, no deduplication is applied.
   */
  idempotencyKey?: string;

  /**
   * Direct recipient override.
   * If provided, skips user lookup and sends directly to this address/number/token.
   * Useful for OTP where we already have the phone number.
   */
  recipientOverride?: string;
}

/**
 * Internal job data stored in the BullMQ notifications queue.
 * Extends the payload with resolved recipient and rendered content.
 */
export interface NotificationJob {
  /** Original payload */
  payload: NotificationPayload;

  /** Resolved recipient (phone, email, or FCM token) */
  recipient: string;

  /** Rendered message title (push/email) */
  title?: string;

  /** Rendered message body */
  body: string;

  /** Rendered HTML body (email only) */
  htmlBody?: string;

  /** Data payload (push only) */
  data?: Record<string, string>;

  /** Whether this is a fallback attempt */
  isFallback?: boolean;

  /** Original channel that failed (when this is a fallback) */
  originalChannel?: NotificationChannel;
}

/**
 * Domain events that trigger notifications.
 * Used by NotificationListener to map events to notification dispatches.
 */
export interface OtpRequestedEvent {
  tenantId: string;
  phone: string;
  otp: string;
}

export interface PaymentSucceededEvent {
  tenantId: string;
  userId: string;
  amount: number;
  currency: string;
}

export interface PayoutCompletedEvent {
  tenantId: string;
  userId: string;
  amount: number;
  currency: string;
}
