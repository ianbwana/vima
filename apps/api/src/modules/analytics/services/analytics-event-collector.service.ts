import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../database/redis.module';

/**
 * Analytics event payload stored in Redis Stream.
 */
export interface AnalyticsEvent {
  tenantId: string;
  eventType: string;
  module: string;
  timestamp: string;
  data: Record<string, string>;
}

/**
 * AnalyticsEventCollector
 *
 * Listens for domain events across all modules and writes them to
 * tenant-isolated Redis Streams for later aggregation.
 *
 * Stream key: `analytics:{tenantId}:events`
 *
 * Events captured:
 * - ride.completed → rides GMV, trip count
 * - order.delivered → food/groceries GMV, order count
 * - parcel.delivered → courier GMV
 * - booking.completed → home services GMV
 * - payment.succeeded → payment method breakdown
 *
 * Redis Streams provide:
 * - Ordered event log with automatic IDs
 * - Consumer group support for the aggregation worker
 * - Automatic trimming after processing (MAXLEN)
 */
@Injectable()
export class AnalyticsEventCollector {
  private readonly logger = new Logger(AnalyticsEventCollector.name);

  /** Max stream length before auto-trimming (keep ~7 days of events) */
  private static readonly MAX_STREAM_LEN = 100000;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Write an analytics event to the tenant's Redis Stream.
   */
  private async emit(tenantId: string, eventType: string, module: string, data: Record<string, string>) {
    const streamKey = `analytics:${tenantId}:events`;

    await this.redis.xadd(
      streamKey,
      'MAXLEN',
      '~',
      String(AnalyticsEventCollector.MAX_STREAM_LEN),
      '*', // auto-generate ID
      'eventType', eventType,
      'module', module,
      'timestamp', new Date().toISOString(),
      ...Object.entries(data).flat(),
    );
  }

  // --- Ride events ---

  @OnEvent('ride.completed')
  async onRideCompleted(event: { tenantId: string; tripId: string; fare: number; currency: string; providerId: string }) {
    await this.emit(event.tenantId, 'trip_completed', 'rides', {
      tripId: event.tripId,
      fare: String(event.fare),
      currency: event.currency,
      providerId: event.providerId,
    });
  }

  @OnEvent('ride.cancelled')
  async onRideCancelled(event: { tenantId: string; tripId: string }) {
    await this.emit(event.tenantId, 'trip_cancelled', 'rides', { tripId: event.tripId });
  }

  // --- Order events (food + groceries) ---

  @OnEvent('order.delivered')
  async onOrderDelivered(event: { tenantId: string; orderId: string }) {
    await this.emit(event.tenantId, 'order_delivered', 'food', { orderId: event.orderId });
  }

  @OnEvent('order.placed')
  async onOrderPlaced(event: { tenantId: string; orderId: string; merchantId: string; customerId: string }) {
    await this.emit(event.tenantId, 'order_placed', 'food', {
      orderId: event.orderId,
      merchantId: event.merchantId,
    });
  }

  @OnEvent('order.cancelled')
  async onOrderCancelled(event: { tenantId: string; orderId: string }) {
    await this.emit(event.tenantId, 'order_cancelled', 'food', { orderId: event.orderId });
  }

  // --- Parcel events ---

  @OnEvent('parcel.delivered')
  async onParcelDelivered(event: { tenantId: string; parcelId: string; providerId: string }) {
    await this.emit(event.tenantId, 'parcel_delivered', 'courier', {
      parcelId: event.parcelId,
      providerId: event.providerId,
    });
  }

  // --- Booking events (home services) ---

  @OnEvent('booking.completed')
  async onBookingCompleted(event: { tenantId: string; bookingId: string; providerId: string }) {
    await this.emit(event.tenantId, 'booking_completed', 'home_services', {
      bookingId: event.bookingId,
      providerId: event.providerId,
    });
  }

  // --- Payment events ---

  @OnEvent('payment.succeeded')
  async onPaymentSucceeded(event: { tenantId: string; userId: string; amount: number; currency: string }) {
    await this.emit(event.tenantId, 'payment_succeeded', 'payments', {
      userId: event.userId,
      amount: String(event.amount),
      currency: event.currency,
    });
  }
}
