import { Logger } from '@nestjs/common';
import {
  ChannelMessage,
  ChannelProvider,
  NotificationChannel,
  ProviderResult,
} from '../interfaces/channel-provider.interface';

/**
 * Credentials required for Resend email delivery.
 */
export interface ResendCredentials {
  apiKey: string;
  fromEmail: string; // e.g., 'Vima <noreply@vima.app>'
}

/**
 * Resend email channel provider.
 *
 * Sends transactional emails via the Resend REST API.
 * Supports HTML email with tenant branding and plain text fallback.
 */
export class ResendEmailProvider implements ChannelProvider {
  readonly channel: NotificationChannel = 'email';
  readonly providerName = 'resend';

  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;

  private static readonly API_URL = 'https://api.resend.com/emails';

  private constructor(credentials: ResendCredentials) {
    this.apiKey = credentials.apiKey;
    this.fromEmail = credentials.fromEmail;
  }

  /**
   * Factory method for creating a provider instance with tenant-specific credentials.
   */
  static create(credentials: ResendCredentials): ResendEmailProvider {
    return new ResendEmailProvider(credentials);
  }

  /**
   * Send an email via Resend API.
   *
   * @param message - `recipient` is email address, `title` is subject, `body` is plain text, `htmlBody` is HTML content
   */
  async send(message: ChannelMessage): Promise<ProviderResult> {
    try {
      const payload = {
        from: this.fromEmail,
        to: [message.recipient],
        subject: message.title || 'Notification',
        text: message.body,
        ...(message.htmlBody && { html: message.htmlBody }),
      };

      const response = await fetch(ResendEmailProvider.API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.warn(
          `Resend email send failed: status=${response.status} error=${JSON.stringify(data)}`,
        );
        return {
          success: false,
          errorMessage: data?.message || `HTTP ${response.status}`,
          errorCode: data?.name || String(response.status),
        };
      }

      this.logger.log(`Email sent via Resend: id=${data.id} to=${message.recipient}`);

      return {
        success: true,
        providerMessageId: data.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Resend email send error: ${errorMessage}`);
      return {
        success: false,
        errorMessage,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }
}
