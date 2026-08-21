/**
 * Result returned by a channel provider after attempting to send a notification.
 */
export interface ProviderResult {
  /** Whether the send was successful */
  success: boolean;
  /** Provider-specific message ID (e.g., Twilio SID, FCM message ID) */
  providerMessageId?: string;
  /** Error message if send failed */
  errorMessage?: string;
  /** Error code from the provider (for programmatic handling) */
  errorCode?: string;
}

/**
 * Message payload passed to a channel provider for delivery.
 */
export interface ChannelMessage {
  /** Recipient identifier: phone number (SMS/WhatsApp), email address, or FCM token */
  recipient: string;
  /** Message subject (email) or title (push) */
  title?: string;
  /** Message body text (SMS, push body, email plain text) */
  body: string;
  /** HTML body for email channel */
  htmlBody?: string;
  /** Additional data payload (push notifications data field) */
  data?: Record<string, string>;
}

/**
 * Notification channel types supported by the platform.
 */
export type NotificationChannel = 'push' | 'sms' | 'whatsapp' | 'email';

/**
 * Priority levels for notifications.
 * Critical notifications bypass rate limits and quiet hours.
 */
export type NotificationPriority = 'normal' | 'high' | 'critical';

/**
 * Pluggable channel provider interface.
 *
 * Each provider implementation handles delivery for a specific channel
 * (SMS, push, email, WhatsApp) via a specific third-party service
 * (Twilio, FCM, Resend, Africa's Talking).
 *
 * Providers are instantiated per-tenant with tenant-specific credentials
 * using the factory pattern: `static create(credentials)`.
 */
export interface ChannelProvider {
  /** The channel this provider handles */
  readonly channel: NotificationChannel;

  /** Human-readable provider name (e.g., 'twilio', 'fcm', 'resend') */
  readonly providerName: string;

  /**
   * Send a notification message to a recipient.
   *
   * @param message - The message payload to deliver
   * @returns Result with success status and provider message ID
   */
  send(message: ChannelMessage): Promise<ProviderResult>;
}
