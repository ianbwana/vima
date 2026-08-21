import { NotificationChannel } from '../../interfaces/channel-provider.interface';
import { otpTemplate } from './otp.template';
import { paymentTemplate } from './payment.template';
import { payoutTemplate } from './payout.template';

/**
 * Channel-specific content for a notification template.
 */
export interface ChannelContent {
  title?: string;
  body: string;
  htmlBody?: string;
}

/**
 * Notification template definition.
 * Each template provides content variants for supported channels.
 */
export interface NotificationTemplate {
  /** Unique key identifying this template (e.g., 'otp.requested') */
  key: string;
  /** Human-readable description */
  description: string;
  /** Notification category for preference matching */
  category: string;
  /** Default title (used as email subject fallback) */
  defaultTitle?: string;
  /** Channel-specific content */
  channels: Partial<Record<NotificationChannel, ChannelContent>>;
}

/**
 * Template registry — maps template keys to their definitions.
 * New templates are added here by importing and registering them.
 */
export const templateRegistry = new Map<string, NotificationTemplate>();

// Register all templates
const templates: NotificationTemplate[] = [
  otpTemplate,
  paymentTemplate,
  payoutTemplate,
];

for (const template of templates) {
  templateRegistry.set(template.key, template);
}
