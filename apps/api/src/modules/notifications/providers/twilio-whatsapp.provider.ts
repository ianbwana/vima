import { Logger } from '@nestjs/common';
import {
  ChannelMessage,
  ChannelProvider,
  NotificationChannel,
  ProviderResult,
} from '../interfaces/channel-provider.interface';

/**
 * Credentials required to initialize the Twilio WhatsApp provider.
 */
export interface TwilioWhatsAppCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string; // WhatsApp-enabled number (without 'whatsapp:' prefix)
}

/**
 * Twilio WhatsApp channel provider.
 *
 * Sends WhatsApp messages via Twilio's messaging API using the
 * `whatsapp:` prefix convention. Uses the same REST API as SMS
 * but with WhatsApp-formatted sender/recipient numbers.
 */
export class TwilioWhatsAppProvider implements ChannelProvider {
  readonly channel: NotificationChannel = 'whatsapp';
  readonly providerName = 'twilio';

  private readonly logger = new Logger(TwilioWhatsAppProvider.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fromNumber: string;

  private constructor(credentials: TwilioWhatsAppCredentials) {
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`;
    this.authHeader =
      'Basic ' +
      Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');
    this.fromNumber = credentials.fromNumber;
  }

  /**
   * Factory method for creating a provider instance with tenant-specific credentials.
   */
  static create(credentials: TwilioWhatsAppCredentials): TwilioWhatsAppProvider {
    return new TwilioWhatsAppProvider(credentials);
  }

  /**
   * Send a WhatsApp message via Twilio REST API.
   *
   * @param message - Must have `recipient` (E.164 phone number) and `body` (message text)
   */
  async send(message: ChannelMessage): Promise<ProviderResult> {
    try {
      const body = new URLSearchParams({
        To: `whatsapp:${message.recipient}`,
        From: `whatsapp:${this.fromNumber}`,
        Body: message.body,
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.warn(
          `Twilio WhatsApp send failed: status=${response.status} code=${data.code} message=${data.message}`,
        );
        return {
          success: false,
          errorMessage: data.message || `HTTP ${response.status}`,
          errorCode: String(data.code || response.status),
        };
      }

      this.logger.log(`WhatsApp sent via Twilio: sid=${data.sid} to=${message.recipient}`);

      return {
        success: true,
        providerMessageId: data.sid,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Twilio WhatsApp send error: ${errorMessage}`);
      return {
        success: false,
        errorMessage,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }
}
