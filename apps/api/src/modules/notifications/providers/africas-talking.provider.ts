import { Logger } from '@nestjs/common';
import {
  ChannelMessage,
  ChannelProvider,
  NotificationChannel,
  ProviderResult,
} from '../interfaces/channel-provider.interface';

/**
 * Credentials required for Africa's Talking SMS delivery.
 */
export interface AfricasTalkingCredentials {
  apiKey: string;
  username: string;
  from?: string; // Optional sender ID (alphanumeric, country-dependent)
}

/**
 * Africa's Talking SMS channel provider.
 *
 * Sends SMS messages via the Africa's Talking REST API.
 * Primarily used for African markets (Nigeria, Ghana, Kenya, South Africa).
 */
export class AfricasTalkingProvider implements ChannelProvider {
  readonly channel: NotificationChannel = 'sms';
  readonly providerName = 'africas_talking';

  private readonly logger = new Logger(AfricasTalkingProvider.name);
  private readonly apiKey: string;
  private readonly username: string;
  private readonly from?: string;

  private static readonly API_URL = 'https://api.africastalking.com/version1/messaging';

  private constructor(credentials: AfricasTalkingCredentials) {
    this.apiKey = credentials.apiKey;
    this.username = credentials.username;
    this.from = credentials.from;
  }

  /**
   * Factory method for creating a provider instance with tenant-specific credentials.
   */
  static create(credentials: AfricasTalkingCredentials): AfricasTalkingProvider {
    return new AfricasTalkingProvider(credentials);
  }

  /**
   * Send an SMS via Africa's Talking API.
   *
   * @param message - `recipient` is phone number (international format), `body` is message text
   */
  async send(message: ChannelMessage): Promise<ProviderResult> {
    try {
      const params = new URLSearchParams({
        username: this.username,
        to: message.recipient,
        message: message.body,
      });

      if (this.from) {
        params.set('from', this.from);
      }

      const response = await fetch(AfricasTalkingProvider.API_URL, {
        method: 'POST',
        headers: {
          apiKey: this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.warn(
          `Africa's Talking SMS send failed: status=${response.status} response=${JSON.stringify(data)}`,
        );
        return {
          success: false,
          errorMessage: data?.SMSMessageData?.Message || `HTTP ${response.status}`,
          errorCode: String(response.status),
        };
      }

      // Africa's Talking wraps results in SMSMessageData.Recipients
      const recipients = data?.SMSMessageData?.Recipients;
      if (!recipients || recipients.length === 0) {
        return {
          success: false,
          errorMessage: data?.SMSMessageData?.Message || 'No recipients in response',
          errorCode: 'NO_RECIPIENTS',
        };
      }

      const recipient = recipients[0];
      const statusCode = recipient.statusCode;

      // Status codes: 100 = processed, 101 = sent, 102 = queued
      if (statusCode >= 100 && statusCode <= 102) {
        this.logger.log(
          `SMS sent via Africa's Talking: messageId=${recipient.messageId} to=${message.recipient}`,
        );
        return {
          success: true,
          providerMessageId: recipient.messageId,
        };
      }

      this.logger.warn(
        `Africa's Talking SMS delivery issue: status=${recipient.status} code=${statusCode}`,
      );
      return {
        success: false,
        errorMessage: recipient.status,
        errorCode: String(statusCode),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Africa's Talking SMS send error: ${errorMessage}`);
      return {
        success: false,
        errorMessage,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }
}
