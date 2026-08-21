import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and, desc } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import { CreateBookingDto, SubmitQuoteDto } from '../dto/home-services.dto';

/**
 * HomeServicesService
 *
 * Manages scheduled home service bookings with a broadcast matching model.
 * Unlike ride-hailing (nearest-first sequential), home services broadcasts
 * to all qualified, available providers in the zone.
 *
 * Flows:
 * - Fixed/Hourly: customer books → broadcast → provider accepts → confirmed
 * - Quote: customer requests → broadcast → providers submit quotes → customer selects
 */
@Injectable()
export class HomeServicesService {
  private readonly logger = new Logger(HomeServicesService.name);

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // --- Categories ---

  async listCategories(tenantId: string, parentId?: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const all = await db
      .select()
      .from(schema.serviceCategories)
      .where(eq(schema.serviceCategories.active, true))
      .orderBy(schema.serviceCategories.sortOrder);

    if (parentId) return all.filter((c) => c.parentId === parentId);
    return all.filter((c) => !c.parentId); // Top-level only
  }

  async getCategoryPriceCards(tenantId: string, categoryId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db
      .select()
      .from(schema.servicePriceCards)
      .where(eq(schema.servicePriceCards.categoryId, categoryId));
  }

  // --- Bookings ---

  /**
   * Create a booking (for fixed/hourly) or a quote request (for quote type).
   * Broadcasts to qualified providers in the zone.
   */
  async createBooking(tenantId: string, customerId: string, dto: CreateBookingDto) {
    const db = this.tenantDb.getConnection(tenantId);

    // Get price card to determine type and price
    let quotedPrice: number | null = null;
    let priceCardType: string = 'fixed';

    if (dto.priceCardId) {
      const [card] = await db
        .select()
        .from(schema.servicePriceCards)
        .where(eq(schema.servicePriceCards.id, dto.priceCardId))
        .limit(1);

      if (card) {
        priceCardType = card.type;
        if (card.type === 'fixed' && card.price) {
          quotedPrice = parseFloat(card.price);
        } else if (card.type === 'hourly' && card.price && dto.durationHours) {
          quotedPrice = parseFloat(card.price) * dto.durationHours;
        }
      }
    }

    const [booking] = await db
      .insert(schema.bookings)
      .values({
        customerId,
        categoryId: dto.categoryId,
        priceCardId: dto.priceCardId,
        scheduledDate: dto.scheduledDate,
        scheduledTime: dto.scheduledTime,
        durationHours: dto.durationHours ? String(dto.durationHours) : null,
        address: dto.address,
        locationLat: dto.locationLat ? String(dto.locationLat) : null,
        locationLng: dto.locationLng ? String(dto.locationLng) : null,
        quotedPrice: quotedPrice ? String(quotedPrice) : null,
        currency: dto.currency ?? 'USD',
        status: priceCardType === 'quote' ? 'pending' : 'pending',
        notes: dto.notes,
      })
      .returning();

    // Broadcast to qualified providers
    await this.broadcastToProviders(tenantId, booking.id, dto.categoryId);

    this.eventEmitter.emit('booking.created', { tenantId, bookingId: booking.id, customerId });
    this.logger.log(`Booking created: ${booking.id} type=${priceCardType} price=${quotedPrice}`);

    return booking;
  }

  /**
   * Provider accepts a booking (for fixed/hourly types).
   */
  async acceptBooking(tenantId: string, bookingId: string, providerId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const [booking] = await db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.status, 'pending')))
      .limit(1);

    if (!booking) throw new NotFoundException('Booking not found or already assigned');

    const [updated] = await db
      .update(schema.bookings)
      .set({ providerId, status: 'confirmed', confirmedAt: new Date() })
      .where(eq(schema.bookings.id, bookingId))
      .returning();

    this.eventEmitter.emit('booking.confirmed', {
      tenantId,
      bookingId,
      customerId: booking.customerId,
      providerId,
    });

    this.logger.log(`Booking accepted: ${bookingId} by provider=${providerId}`);
    return updated;
  }

  /**
   * Provider submits a quote for a quote-type booking.
   */
  async submitQuote(tenantId: string, providerId: string, dto: SubmitQuoteDto) {
    const db = this.tenantDb.getConnection(tenantId);

    const [quote] = await db
      .insert(schema.bookingQuotes)
      .values({
        bookingId: dto.bookingId,
        providerId,
        price: String(dto.price),
        description: dto.description,
        validUntil: dto.validUntilDays ? new Date(Date.now() + dto.validUntilDays * 86400000) : null,
        status: 'pending',
      })
      .returning();

    this.eventEmitter.emit('booking.quote_submitted', {
      tenantId,
      bookingId: dto.bookingId,
      quoteId: quote.id,
      providerId,
    });

    this.logger.log(`Quote submitted: ${quote.id} for booking=${dto.bookingId} price=${dto.price}`);
    return quote;
  }

  /**
   * Customer accepts a quote, confirming the booking.
   */
  async acceptQuote(tenantId: string, quoteId: string, customerId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const [quote] = await db
      .select()
      .from(schema.bookingQuotes)
      .where(eq(schema.bookingQuotes.id, quoteId))
      .limit(1);

    if (!quote) throw new NotFoundException('Quote not found');

    // Update quote status
    await db
      .update(schema.bookingQuotes)
      .set({ status: 'accepted' })
      .where(eq(schema.bookingQuotes.id, quoteId));

    // Reject all other quotes for this booking
    await db
      .update(schema.bookingQuotes)
      .set({ status: 'rejected' })
      .where(and(eq(schema.bookingQuotes.bookingId, quote.bookingId), eq(schema.bookingQuotes.status, 'pending')));

    // Update booking with provider and quoted price
    const [booking] = await db
      .update(schema.bookings)
      .set({
        providerId: quote.providerId,
        quotedPrice: quote.price,
        status: 'confirmed',
        confirmedAt: new Date(),
      })
      .where(eq(schema.bookings.id, quote.bookingId))
      .returning();

    this.logger.log(`Quote accepted: ${quoteId} booking=${quote.bookingId} provider=${quote.providerId}`);
    return booking;
  }

  // --- Job lifecycle ---

  async markEnRoute(tenantId: string, bookingId: string, providerId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [booking] = await db
      .update(schema.bookings)
      .set({ status: 'provider_en_route' })
      .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.providerId, providerId)))
      .returning();
    if (!booking) throw new NotFoundException('Booking not found');
    this.eventEmitter.emit('booking.provider_en_route', { tenantId, bookingId, customerId: booking.customerId });
    return booking;
  }

  async startJob(tenantId: string, bookingId: string, providerId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [booking] = await db
      .update(schema.bookings)
      .set({ status: 'in_progress' })
      .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.providerId, providerId)))
      .returning();
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async completeJob(tenantId: string, bookingId: string, providerId: string, photos?: string[]) {
    const db = this.tenantDb.getConnection(tenantId);

    const [booking] = await db
      .update(schema.bookings)
      .set({
        status: 'completed',
        completedAt: new Date(),
        finalPrice: undefined, // Use quotedPrice as final by default
        completionPhotos: photos || [],
      })
      .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.providerId, providerId)))
      .returning();

    if (!booking) throw new NotFoundException('Booking not found');

    this.eventEmitter.emit('booking.completed', { tenantId, bookingId, customerId: booking.customerId, providerId });
    this.logger.log(`Booking completed: ${bookingId}`);
    return booking;
  }

  async cancelBooking(tenantId: string, bookingId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [booking] = await db
      .update(schema.bookings)
      .set({ status: 'cancelled' })
      .where(eq(schema.bookings.id, bookingId))
      .returning();
    return booking;
  }

  // --- Queries ---

  async getBooking(tenantId: string, bookingId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1);
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async getBookingQuotes(tenantId: string, bookingId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db.select().from(schema.bookingQuotes).where(eq(schema.bookingQuotes.bookingId, bookingId));
  }

  async listCustomerBookings(tenantId: string, customerId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db.select().from(schema.bookings).where(eq(schema.bookings.customerId, customerId)).orderBy(desc(schema.bookings.createdAt));
  }

  async listProviderBookings(tenantId: string, providerId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db.select().from(schema.bookings).where(eq(schema.bookings.providerId, providerId)).orderBy(desc(schema.bookings.createdAt));
  }

  // --- Internal ---

  /**
   * Broadcast a booking to all qualified, available providers in the zone.
   * (Simplified: emits an event; in production, would query by qualification + availability)
   */
  private async broadcastToProviders(tenantId: string, bookingId: string, categoryId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    // Find providers qualified for this category
    const qualified = await db
      .select({ providerId: schema.providerQualifications.providerId })
      .from(schema.providerQualifications)
      .where(and(
        eq(schema.providerQualifications.categoryId, categoryId),
        eq(schema.providerQualifications.verified, true),
      ));

    // Emit broadcast event for each qualified provider
    for (const q of qualified) {
      this.eventEmitter.emit('booking.broadcast', {
        tenantId,
        bookingId,
        providerId: q.providerId,
        categoryId,
      });
    }

    this.logger.log(`Booking ${bookingId} broadcast to ${qualified.length} providers`);
  }
}
