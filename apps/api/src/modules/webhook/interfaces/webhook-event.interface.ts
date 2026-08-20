import { NormalizedWebhookEvent } from '@vima/psp-adapters';

/**
 * Re-export the PSP adapter's NormalizedWebhookEvent for use within the webhook module.
 * This keeps the webhook module's public API independent of the PSP adapter package structure.
 */
export type { NormalizedWebhookEvent };

/**
 * Internal representation of a webhook event after verification and normalization,
 * enriched with metadata for processing and deduplication.
 */
export interface WebhookEventPayload {
  /** The normalized event from the PSP adapter */
  event: NormalizedWebhookEvent;
  /** Timestamp when the webhook was received */
  receivedAt: Date;
  /** The provider that sent this webhook (e.g., 'stripe', 'paystack') */
  provider: string;
}
