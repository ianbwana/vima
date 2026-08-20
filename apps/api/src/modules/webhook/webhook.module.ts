import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsModule } from '../payments/payments.module';
import { WebhookIngressController } from './webhook-ingress.controller';
import { WebhookService } from './webhook.service';
import { WebhookEventsProcessor } from './webhook-events.processor';

/**
 * Webhook Module
 *
 * Isolated module for PSP event ingestion. Handles incoming webhook requests
 * from payment service providers, verifies signatures, deduplicates events,
 * and publishes them to the internal event queue for async processing.
 *
 * Imports PaymentsModule to access PspConnectionService for credential
 * resolution during webhook signature verification, and WalletService
 * for completing top-ups and refunds triggered by webhook events.
 *
 * Registers the 'webhook-events' BullMQ queue for async event processing
 * and the WebhookEventsProcessor consumer that routes events to handlers.
 */
@Module({
  imports: [
    PaymentsModule,
    BullModule.registerQueue({
      name: 'webhook-events',
    }),
  ],
  controllers: [WebhookIngressController],
  providers: [WebhookService, WebhookEventsProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}
