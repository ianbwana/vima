import { Logger } from '@nestjs/common';
import {
  ChannelMessage,
  ChannelProvider,
  NotificationChannel,
  ProviderResult,
} from '../interfaces/channel-provider.interface';

/**
 * Credentials for Firebase Cloud Messaging.
 * The serviceAccountKey is a base64-encoded JSON service account key.
 */
export interface FcmCredentials {
  projectId: string;
  serviceAccountKey: string; // base64-encoded JSON
}

/**
 * Parsed service account key for OAuth2 token generation.
 */
interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

/**
 * Firebase Cloud Messaging (FCM) push notification provider.
 *
 * Sends push notifications via FCM HTTP v1 API using service account
 * credentials for authentication. Supports both notification messages
 * (visible to user) and data messages (handled by app).
 *
 * Reports stale tokens via the `onTokenInvalid` callback so the
 * DeviceService can deactivate them.
 */
export class FcmProvider implements ChannelProvider {
  readonly channel: NotificationChannel = 'push';
  readonly providerName = 'fcm';

  private readonly logger = new Logger(FcmProvider.name);
  private readonly projectId: string;
  private readonly serviceAccount: ServiceAccountKey;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  /** Optional callback invoked when FCM reports a token as invalid */
  onTokenInvalid?: (fcmToken: string) => void;

  private constructor(credentials: FcmCredentials) {
    this.projectId = credentials.projectId;
    const decoded = Buffer.from(credentials.serviceAccountKey, 'base64').toString('utf-8');
    this.serviceAccount = JSON.parse(decoded);
  }

  /**
   * Factory method for creating a provider instance with tenant-specific credentials.
   */
  static create(credentials: FcmCredentials): FcmProvider {
    return new FcmProvider(credentials);
  }

  /**
   * Send a push notification to a single device via FCM HTTP v1 API.
   *
   * @param message - `recipient` is the FCM registration token, `title` and `body` form the notification
   */
  async send(message: ChannelMessage): Promise<ProviderResult> {
    try {
      const token = await this.getAccessToken();

      const fcmPayload: Record<string, unknown> = {
        message: {
          token: message.recipient,
          notification: {
            title: message.title || '',
            body: message.body,
          },
          ...(message.data && { data: message.data }),
        },
      };

      const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorCode = data?.error?.details?.[0]?.errorCode || data?.error?.status;

        // Handle invalid/expired registration tokens
        if (
          errorCode === 'UNREGISTERED' ||
          errorCode === 'INVALID_ARGUMENT' ||
          response.status === 404
        ) {
          this.logger.warn(`FCM token invalid, marking for removal: token=${message.recipient.slice(0, 20)}...`);
          this.onTokenInvalid?.(message.recipient);
        }

        this.logger.warn(
          `FCM send failed: status=${response.status} error=${JSON.stringify(data?.error)}`,
        );
        return {
          success: false,
          errorMessage: data?.error?.message || `HTTP ${response.status}`,
          errorCode: errorCode || String(response.status),
        };
      }

      const messageId = data.name; // FCM returns message name as ID
      this.logger.log(`Push sent via FCM: messageId=${messageId}`);

      return {
        success: true,
        providerMessageId: messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`FCM send error: ${errorMessage}`);
      return {
        success: false,
        errorMessage,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  /**
   * Get a valid OAuth2 access token for FCM API calls.
   * Caches the token until near expiry (5 min buffer).
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const jwt = await this.createJwt(now);

    const response = await fetch(this.serviceAccount.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get FCM access token: HTTP ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = now * 1000 + data.expires_in * 1000;

    return this.accessToken!;
  }

  /**
   * Create a signed JWT for Google OAuth2 service account authentication.
   */
  private async createJwt(now: number): Promise<string> {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: this.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: this.serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    };

    const encHeader = this.base64UrlEncode(JSON.stringify(header));
    const encPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encHeader}.${encPayload}`;

    // Use Node.js crypto for RS256 signing
    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(this.serviceAccount.private_key, 'base64url');

    return `${signingInput}.${signature}`;
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
