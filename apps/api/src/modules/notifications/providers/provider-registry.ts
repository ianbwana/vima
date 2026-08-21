import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import { eq, and } from 'drizzle-orm';
import * as cpSchema from '../../../database/schemas/control-plane.schema';
import {
  ChannelProvider,
  NotificationChannel,
} from '../interfaces/channel-provider.interface';
import { TwilioSmsProvider } from './twilio-sms.provider';
import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';
import { FcmProvider } from './fcm.provider';
import { ResendEmailProvider } from './resend-email.provider';
import { AfricasTalkingProvider } from './africas-talking.provider';

/**
 * Provider Registry & Resolver
 *
 * Resolves the correct ChannelProvider instance for a given tenant and channel.
 * Resolution order:
 * 1. Tenant-specific config from control plane DB (encrypted credentials)
 * 2. Platform-level defaults from environment variables
 *
 * Provider instances are created per-request (not cached) since credentials
 * may change. If performance becomes an issue, add a short TTL cache.
 */
@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);

  constructor(
    private readonly config: ConfigService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {}

  /**
   * Resolve a ChannelProvider for a given tenant and channel.
   * Falls back to platform defaults if no tenant-specific config exists.
   *
   * @returns ChannelProvider instance or null if no provider is configured
   */
  async resolve(
    tenantId: string,
    channel: NotificationChannel,
  ): Promise<ChannelProvider | null> {
    // Try tenant-specific configuration first
    const tenantConfig = await this.getTenantConfig(tenantId, channel);

    if (tenantConfig) {
      return this.createFromTenantConfig(tenantConfig, channel);
    }

    // Fall back to platform defaults
    return this.createFromDefaults(channel);
  }

  /**
   * Get the configured fallback channel for a tenant's channel.
   * Returns null if no fallback is configured.
   */
  async getFallbackChannel(
    tenantId: string,
    channel: NotificationChannel,
  ): Promise<NotificationChannel | null> {
    const tenantConfig = await this.getTenantConfig(tenantId, channel);
    return (tenantConfig?.fallbackChannel as NotificationChannel) || null;
  }

  /**
   * Look up tenant-specific notification config from control plane DB.
   */
  private async getTenantConfig(tenantId: string, channel: NotificationChannel) {
    const db = this.controlPlaneDb.db;

    const [config] = await db
      .select()
      .from(cpSchema.tenantNotificationConfig)
      .where(
        and(
          eq(cpSchema.tenantNotificationConfig.tenantId, tenantId),
          eq(cpSchema.tenantNotificationConfig.channel, channel),
          eq(cpSchema.tenantNotificationConfig.active, true),
        ),
      )
      .limit(1);

    return config || null;
  }

  /**
   * Create a provider instance from tenant-specific config.
   * Decrypts credentials before passing to the provider factory.
   */
  private createFromTenantConfig(
    config: typeof cpSchema.tenantNotificationConfig.$inferSelect,
    channel: NotificationChannel,
  ): ChannelProvider | null {
    try {
      // TODO: Decrypt credentials using envelope encryption (same pattern as PSP connections)
      // For now, assume credentials are JSON-stringified (plaintext in dev, encrypted in prod)
      const credentials = JSON.parse(config.encryptedCredentials);

      switch (config.provider) {
        case 'twilio':
          if (channel === 'whatsapp') {
            return TwilioWhatsAppProvider.create(credentials);
          }
          return TwilioSmsProvider.create(credentials);

        case 'africas_talking':
          return AfricasTalkingProvider.create(credentials);

        case 'fcm':
          return FcmProvider.create(credentials);

        case 'resend':
          return ResendEmailProvider.create(credentials);

        default:
          this.logger.warn(`Unknown provider: ${config.provider} for channel: ${channel}`);
          return null;
      }
    } catch (error) {
      this.logger.error(
        `Failed to create provider from tenant config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Create a provider instance from platform-level environment defaults.
   * Used when a tenant has no specific configuration for a channel.
   */
  private createFromDefaults(channel: NotificationChannel): ChannelProvider | null {
    switch (channel) {
      case 'sms': {
        const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
        const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
        const fromNumber = this.config.get<string>('TWILIO_SMS_FROM');
        if (!accountSid || !authToken || !fromNumber) {
          this.logger.warn('Platform SMS provider not configured (missing TWILIO_* env vars)');
          return null;
        }
        return TwilioSmsProvider.create({ accountSid, authToken, fromNumber });
      }

      case 'whatsapp': {
        const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
        const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
        const fromNumber = this.config.get<string>('TWILIO_WHATSAPP_FROM');
        if (!accountSid || !authToken || !fromNumber) {
          this.logger.warn('Platform WhatsApp provider not configured (missing TWILIO_* env vars)');
          return null;
        }
        return TwilioWhatsAppProvider.create({ accountSid, authToken, fromNumber });
      }

      case 'push': {
        const projectId = this.config.get<string>('FCM_PROJECT_ID');
        const serviceAccountKey = this.config.get<string>('FCM_SERVICE_ACCOUNT_KEY');
        if (!projectId || !serviceAccountKey) {
          this.logger.warn('Platform push provider not configured (missing FCM_* env vars)');
          return null;
        }
        return FcmProvider.create({ projectId, serviceAccountKey });
      }

      case 'email': {
        const apiKey = this.config.get<string>('RESEND_API_KEY');
        const fromEmail = this.config.get<string>('RESEND_FROM_EMAIL');
        if (!apiKey || !fromEmail) {
          this.logger.warn('Platform email provider not configured (missing RESEND_* env vars)');
          return null;
        }
        return ResendEmailProvider.create({ apiKey, fromEmail });
      }

      default:
        this.logger.warn(`No default provider for channel: ${channel}`);
        return null;
    }
  }
}
