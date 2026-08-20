import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StripeAdapter, PaystackAdapter, PspAdapter } from '@vima/psp-adapters';
import { PspConnectionService } from '../payments/psp-connection/psp-connection.service';
import { PspProvider } from '../payments/psp-connection/dto/connect-psp.dto';
import { WebhookService } from './webhook.service';

/**
 * Ingress controller for PSP webhook events.
 *
 * Receives raw HTTP POST requests from payment providers (Stripe, Paystack, etc.),
 * verifies signatures using the appropriate PSP adapter, and delegates verified
 * events to the WebhookService for deduplication and processing.
 *
 * The raw body is preserved for signature verification using NestJS rawBody option
 * (configured in main.ts). This controller responds with HTTP 200 as quickly as
 * possible to avoid PSP timeout retries (requirement 5.6: respond within 5 seconds).
 */
@Controller('webhooks')
export class WebhookIngressController {
  private readonly logger = new Logger(WebhookIngressController.name);

  constructor(
    private readonly pspConnectionService: PspConnectionService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * POST /webhooks/:provider
   *
   * Receives webhook events from PSPs. Routes to the correct adapter based on
   * the URL path parameter, verifies the signature, and publishes the event.
   *
   * Requirements:
   * - 5.1: Route to correct PSP_Adapter based on URL path
   * - 5.3: Respond 401 for invalid signatures
   * - 5.6: Respond HTTP 200 within 5 seconds
   */
  @Post(':provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Validate provider is a known PSP
    if (!this.isSupportedProvider(provider)) {
      this.logger.warn(`Webhook received for unknown provider: ${provider}`);
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: `Unknown webhook provider: ${provider}`,
      });
      return;
    }

    // Extract raw body for signature verification.
    // NestJS rawBody option stores it on req.rawBody when enabled.
    const rawBody = (req as any).rawBody as Buffer;
    if (!rawBody) {
      this.logger.error('Raw body not available for webhook signature verification');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Unable to process webhook: raw body unavailable',
      });
      return;
    }

    const headers = req.headers as Record<string, string>;

    try {
      // Resolve the PSP adapter with credentials for signature verification.
      // For webhooks, we look up connections by provider across all tenants
      // to find the webhook secret needed for verification.
      const adapter = await this.resolveWebhookAdapter(provider as PspProvider);

      // Verify the webhook signature and normalize the event
      const normalizedEvent = adapter.verifyWebhook(rawBody, headers);

      // Respond immediately with 200 (requirement 5.6: within 5 seconds)
      res.status(HttpStatus.OK).json({ received: true });

      // Delegate to WebhookService for dedup and async processing (fire-and-forget)
      this.webhookService.processEvent(normalizedEvent).catch((err) => {
        this.logger.error(
          `Failed to process webhook event ${normalizedEvent.providerEventId}: ${err.message}`,
        );
      });
    } catch (error) {
      if (this.isSignatureError(error)) {
        // Signature verification failures → 401 (requirement 5.3)
        this.logger.warn(
          `Webhook signature verification failed for provider: ${provider}`,
        );
        res.status(HttpStatus.UNAUTHORIZED).json({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid webhook signature',
        });
        return;
      }

      if (error instanceof NotFoundException) {
        this.logger.warn(
          `No PSP connection found for webhook provider: ${provider}`,
        );
        res.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: `No connection configured for provider: ${provider}`,
        });
        return;
      }

      // Unexpected errors — still respond quickly
      this.logger.error(
        `Unexpected error processing webhook for ${provider}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal error processing webhook',
      });
    }
  }

  /**
   * Check if the provider string maps to a supported PSP.
   */
  private isSupportedProvider(provider: string): boolean {
    return Object.values(PspProvider).includes(provider as PspProvider);
  }

  /**
   * Resolve a PSP adapter for webhook verification.
   *
   * For webhook ingress, we look up connections for the given provider to retrieve
   * the webhook secret needed for signature verification. Since PSPs are configured
   * with distinct webhook URLs per provider (not per tenant), we find any verified
   * connection for this provider.
   */
  private async resolveWebhookAdapter(provider: PspProvider): Promise<PspAdapter> {
    const connections = await this.pspConnectionService.findConnectionsByProvider(provider);

    if (!connections || connections.length === 0) {
      throw new NotFoundException(
        `No PSP connection found for provider: ${provider}`,
      );
    }

    // Prefer a verified connection for webhook verification
    const connection = connections.find((c) => c.verified) || connections[0];
    const credentials = await this.pspConnectionService.decryptCredentials(
      connection.tenantId,
      provider,
    );

    return this.createAdapterForVerification(provider, credentials);
  }

  /**
   * Create an adapter instance configured with credentials
   * for webhook signature verification.
   */
  private createAdapterForVerification(
    provider: PspProvider,
    credentials: Record<string, string>,
  ): PspAdapter {
    switch (provider) {
      case PspProvider.STRIPE:
        return StripeAdapter.create({
          secretKey: credentials.secretKey,
          webhookSecret: credentials.webhookSecret,
        });
      case PspProvider.PAYSTACK:
        return PaystackAdapter.create({
          secretKey: credentials.secretKey,
        });
      default:
        throw new NotFoundException(
          `Webhook verification not supported for provider: ${provider}`,
        );
    }
  }

  /**
   * Determine if an error is a signature verification failure.
   * PSP adapters throw specific errors when signatures don't match.
   */
  private isSignatureError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as { message?: string; name?: string };
    const message = err.message?.toLowerCase() || '';
    return (
      message.includes('signature') ||
      message.includes('webhook verification') ||
      message.includes('invalid hash') ||
      err.name === 'SignatureVerificationError'
    );
  }
}
