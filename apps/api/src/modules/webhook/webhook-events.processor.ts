import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WalletService } from '../payments/wallet/wallet.service';
import { NormalizedWebhookEvent } from './interfaces/webhook-event.interface';

/**
 * BullMQ processor for the 'webhook-events' queue.
 *
 * Consumes normalized webhook events published by WebhookService and routes
 * them to the appropriate handler:
 * - payment.succeeded → WalletService.completeTopup()
 * - refund.succeeded → WalletService.refund()
 * - Unknown event types are logged and skipped.
 *
 * Retry configuration: 3 attempts with exponential backoff (1s base delay),
 * configured when jobs are added to the queue in WebhookService.
 * After all retries are exhausted, the failure is logged with structured
 * metadata for ops alerting.
 *
 * Requirements: 5.5
 */
@Processor('webhook-events')
export class WebhookEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookEventsProcessor.name);

  constructor(private readonly walletService: WalletService) {
    super();
  }

  /**
   * Process a single webhook event job from the queue.
   *
   * Routes the event to the correct handler based on event type.
   * Throws on failure so BullMQ handles retries automatically.
   */
  async process(job: Job<NormalizedWebhookEvent>): Promise<void> {
    const event = job.data;

    this.logger.log(
      `Processing webhook event: type=${event.type} provider=${event.provider} eventId=${event.providerEventId} attempt=${job.attemptsMade + 1}`,
    );

    switch (event.type) {
      case 'payment.succeeded':
        await this.handlePaymentSucceeded(event);
        break;

      case 'refund.succeeded':
        await this.handleRefundSucceeded(event);
        break;

      default:
        this.logger.log(
          `Skipping unhandled webhook event type: ${event.type} (provider=${event.provider}, eventId=${event.providerEventId})`,
        );
        break;
    }
  }

  /**
   * Handle payment.succeeded events by completing the wallet top-up.
   *
   * Extracts tenantId and userId from the event metadata (set during
   * payment intent creation) and calls WalletService.completeTopup().
   */
  private async handlePaymentSucceeded(event: NormalizedWebhookEvent): Promise<void> {
    const tenantId = event.metadata?.tenantId;
    const userId = event.metadata?.userId;

    if (!tenantId || !userId) {
      this.logger.error(
        `Missing tenantId or userId in payment.succeeded metadata: eventId=${event.providerEventId}`,
      );
      throw new Error(
        `Missing required metadata (tenantId/userId) for payment.succeeded event: ${event.providerEventId}`,
      );
    }

    await this.walletService.completeTopup({
      tenantId,
      userId,
      amount: event.amount,
      currency: event.currency,
      providerReference: event.providerReference,
    });

    this.logger.log(
      `payment.succeeded processed: user=${userId} tenant=${tenantId} amount=${event.amount} ${event.currency}`,
    );
  }

  /**
   * Handle refund.succeeded events by processing the refund in the wallet.
   *
   * Extracts tenantId and userId from the event metadata and calls
   * WalletService.refund() with the refund details.
   */
  private async handleRefundSucceeded(event: NormalizedWebhookEvent): Promise<void> {
    const tenantId = event.metadata?.tenantId;
    const userId = event.metadata?.userId;

    if (!tenantId || !userId) {
      this.logger.error(
        `Missing tenantId or userId in refund.succeeded metadata: eventId=${event.providerEventId}`,
      );
      throw new Error(
        `Missing required metadata (tenantId/userId) for refund.succeeded event: ${event.providerEventId}`,
      );
    }

    await this.walletService.refund(tenantId, {
      userId,
      paymentId: event.providerReference,
      amount: event.amount,
      currency: event.currency,
      reason: 'Refund via PSP webhook',
    });

    this.logger.log(
      `refund.succeeded processed: user=${userId} tenant=${tenantId} amount=${event.amount} ${event.currency}`,
    );
  }

  /**
   * Called by BullMQ when a job fails all retry attempts.
   * Logs structured failure details for ops alerting.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<NormalizedWebhookEvent>, error: Error): void {
    this.logger.error(
      `Webhook event processing exhausted all retries: ` +
        `type=${job.data.type} provider=${job.data.provider} ` +
        `eventId=${job.data.providerEventId} attempts=${job.attemptsMade} ` +
        `error=${error.message}`,
      error.stack,
    );
  }
}
