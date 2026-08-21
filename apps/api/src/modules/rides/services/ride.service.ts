import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and, desc } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import { FareService } from './fare.service';
import { DispatchService } from './dispatch.service';
import { DriverLocationService } from './driver-location.service';
import { FareSettlementService } from './fare-settlement.service';
import { RequestRideDto, CancelRideDto, RateRideDto } from '../dto/request-ride.dto';
import { TripState } from '../interfaces/ride.interfaces';

/**
 * RideService
 *
 * Orchestrates the complete ride lifecycle:
 * - Request: validates input, calculates estimate, creates trip, starts dispatch
 * - Accept: assigns driver, transitions to accepted
 * - State transitions: arriving → arrived → in_progress → completed
 * - Complete: calculates actual fare, settles payment via ledger
 * - Cancel: handles customer/driver cancellation with cleanup
 * - Rate: records rating for the driver
 */
@Injectable()
export class RideService {
  private readonly logger = new Logger(RideService.name);

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly fareService: FareService,
    private readonly dispatchService: DispatchService,
    private readonly driverLocation: DriverLocationService,
    private readonly fareSettlement: FareSettlementService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Request a new ride.
   * Creates the trip record, calculates estimated fare, and starts dispatch.
   */
  async requestRide(
    tenantId: string,
    customerId: string,
    dto: RequestRideDto,
  ): Promise<TripState> {
    const db = this.tenantDb.getConnection(tenantId);

    // Get fare rule for estimate
    const fareRule = await this.fareService.getDefaultFareRule(tenantId, dto.vehicleClassId);
    if (!fareRule) {
      throw new BadRequestException('No fare rules configured for this vehicle class');
    }

    // Calculate distance and estimated fare
    const distanceKm = this.fareService.calculateDistance(
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
    );
    const durationMin = (distanceKm / 30) * 60; // Estimate at 30km/h
    const estimatedFare = this.fareService.calculateFare(fareRule, distanceKm, durationMin);

    // Create trip record
    const [trip] = await db
      .insert(schema.trips)
      .values({
        customerId,
        vehicleClassId: dto.vehicleClassId,
        status: 'matching',
        pickupLat: String(dto.pickupLat),
        pickupLng: String(dto.pickupLng),
        pickupAddress: dto.pickupAddress,
        dropoffLat: String(dto.dropoffLat),
        dropoffLng: String(dto.dropoffLng),
        dropoffAddress: dto.dropoffAddress,
        estimatedFare: String(estimatedFare),
        estimatedDistanceKm: String(distanceKm),
        estimatedDurationMin: String(durationMin),
        currency: fareRule.currency,
        surgeMultiplier: String(fareRule.surgeMultiplier),
        commissionRate: String(fareRule.commissionRate),
        paymentMethod: dto.paymentMethod || 'wallet',
      })
      .returning();

    // Also create a job record for shared logistics tracking
    const [job] = await db
      .insert(schema.jobs)
      .values({
        type: 'ride',
        status: 'matching',
        customerId,
        pickupLat: String(dto.pickupLat),
        pickupLng: String(dto.pickupLng),
        pickupAddress: dto.pickupAddress,
        dropoffLat: String(dto.dropoffLat),
        dropoffLng: String(dto.dropoffLng),
        dropoffAddress: dto.dropoffAddress,
        estimatedFare: String(estimatedFare),
        currency: fareRule.currency,
      })
      .returning();

    // Link trip to job
    await db
      .update(schema.trips)
      .set({ jobId: job.id })
      .where(eq(schema.trips.id, trip.id));

    // Start dispatch
    await this.dispatchService.startDispatch(
      tenantId,
      trip.id,
      dto.pickupLat,
      dto.pickupLng,
    );

    this.logger.log(
      `Ride requested: trip=${trip.id} customer=${customerId} fare=${estimatedFare} ${fareRule.currency}`,
    );

    return this.toTripState(trip);
  }

  /**
   * Handle driver accepting a ride offer.
   * Transitions trip to 'accepted' and assigns the driver.
   */
  async acceptRide(
    tenantId: string,
    tripId: string,
    providerId: string,
  ): Promise<TripState | null> {
    const accepted = await this.dispatchService.handleAccept(tenantId, tripId, providerId);
    if (!accepted) return null;

    const db = this.tenantDb.getConnection(tenantId);

    // Update trip with driver assignment
    const [trip] = await db
      .update(schema.trips)
      .set({
        providerId,
        status: 'accepted',
        acceptedAt: new Date(),
      })
      .where(eq(schema.trips.id, tripId))
      .returning();

    // Update the linked job as well
    if (trip.jobId) {
      await db
        .update(schema.jobs)
        .set({ status: 'accepted', providerId, acceptedAt: new Date() })
        .where(eq(schema.jobs.id, trip.jobId));
    }

    // Remove driver from available pool
    await this.driverLocation.removeFromPool(tenantId, providerId);

    // Emit event for notifications
    this.eventEmitter.emit('ride.driver_assigned', {
      tenantId,
      tripId,
      customerId: trip.customerId,
      providerId,
    });

    this.logger.log(`Ride accepted: trip=${tripId} driver=${providerId}`);

    return this.getTripState(tenantId, tripId);
  }

  /**
   * Transition trip to 'arrived' (driver at pickup).
   */
  async driverArrived(tenantId: string, tripId: string, providerId: string): Promise<TripState> {
    const db = this.tenantDb.getConnection(tenantId);

    const [trip] = await db
      .update(schema.trips)
      .set({ status: 'arrived', arrivedAt: new Date() })
      .where(and(eq(schema.trips.id, tripId), eq(schema.trips.providerId, providerId)))
      .returning();

    if (!trip) throw new NotFoundException('Trip not found');

    this.eventEmitter.emit('ride.arrived', { tenantId, tripId, customerId: trip.customerId });

    return this.toTripState(trip);
  }

  /**
   * Start the trip (passenger picked up).
   */
  async startTrip(tenantId: string, tripId: string, providerId: string): Promise<TripState> {
    const db = this.tenantDb.getConnection(tenantId);

    const [trip] = await db
      .update(schema.trips)
      .set({ status: 'in_progress', startedAt: new Date() })
      .where(and(eq(schema.trips.id, tripId), eq(schema.trips.providerId, providerId)))
      .returning();

    if (!trip) throw new NotFoundException('Trip not found');

    // Update job status
    if (trip.jobId) {
      await db.update(schema.jobs).set({ status: 'in_progress' }).where(eq(schema.jobs.id, trip.jobId));
    }

    return this.toTripState(trip);
  }

  /**
   * Complete the trip (destination reached).
   * Calculates actual fare and settles payment.
   */
  async completeTrip(
    tenantId: string,
    tripId: string,
    providerId: string,
    actualDistanceKm?: number,
    actualDurationMin?: number,
  ): Promise<TripState> {
    const db = this.tenantDb.getConnection(tenantId);

    // Get trip to compute actual fare
    const [existingTrip] = await db
      .select()
      .from(schema.trips)
      .where(and(eq(schema.trips.id, tripId), eq(schema.trips.providerId, providerId)))
      .limit(1);

    if (!existingTrip) throw new NotFoundException('Trip not found');

    // Calculate actual fare (use actual distance if available, else use estimate)
    const distance = actualDistanceKm ?? parseFloat(existingTrip.estimatedDistanceKm || '0');
    const duration = actualDurationMin ?? parseFloat(existingTrip.estimatedDurationMin || '0');

    const fareRule = await this.fareService.getDefaultFareRule(tenantId, existingTrip.vehicleClassId);
    const actualFare = fareRule
      ? this.fareService.calculateFare(fareRule, distance, duration)
      : parseFloat(existingTrip.estimatedFare || '0');

    // Update trip as completed
    const [trip] = await db
      .update(schema.trips)
      .set({
        status: 'completed',
        completedAt: new Date(),
        actualFare: String(actualFare),
        actualDistanceKm: String(distance),
        actualDurationMin: String(duration),
      })
      .where(eq(schema.trips.id, tripId))
      .returning();

    // Update job
    if (trip.jobId) {
      await db
        .update(schema.jobs)
        .set({ status: 'completed', completedAt: new Date(), actualFare: String(actualFare) })
        .where(eq(schema.jobs.id, trip.jobId));
    }

    // Settle fare via ledger
    const commissionRate = parseFloat(trip.commissionRate || '0.20');
    await this.fareSettlement.settle(tenantId, {
      tripId,
      customerId: trip.customerId,
      providerId,
      totalFare: actualFare,
      commissionRate,
      currency: trip.currency,
    });

    // Update provider stats
    await db
      .update(schema.providers)
      .set({ totalJobs: (existingTrip as any).totalJobs + 1 })
      .where(eq(schema.providers.id, providerId))
      .catch(() => {}); // Non-critical

    // Emit completion event
    this.eventEmitter.emit('ride.completed', {
      tenantId,
      tripId,
      customerId: trip.customerId,
      providerId,
      fare: actualFare,
      currency: trip.currency,
    });

    this.logger.log(`Ride completed: trip=${tripId} fare=${actualFare} ${trip.currency}`);

    return this.toTripState(trip);
  }

  /**
   * Cancel a ride.
   */
  async cancelRide(
    tenantId: string,
    tripId: string,
    cancelledBy: string,
    dto: CancelRideDto,
  ): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    await db
      .update(schema.trips)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy,
        cancellationReason: dto.reason,
      })
      .where(eq(schema.trips.id, tripId));

    // Cancel dispatch if still in progress
    await this.dispatchService.cancelDispatch(tripId);

    // Emit cancellation event
    this.eventEmitter.emit('ride.cancelled', { tenantId, tripId, cancelledBy });

    this.logger.log(`Ride cancelled: trip=${tripId} by=${cancelledBy}`);
  }

  /**
   * Rate a completed ride.
   */
  async rateRide(
    tenantId: string,
    tripId: string,
    fromUserId: string,
    dto: RateRideDto,
  ): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    // Get the trip to find the driver
    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.id, tripId))
      .limit(1);

    if (!trip || !trip.providerId) {
      throw new NotFoundException('Completed trip not found');
    }

    if (!trip.jobId) {
      throw new BadRequestException('Trip has no associated job');
    }

    // Get the provider's user ID
    const [provider] = await db
      .select({ userId: schema.providers.userId })
      .from(schema.providers)
      .where(eq(schema.providers.id, trip.providerId))
      .limit(1);

    if (!provider) throw new NotFoundException('Provider not found');

    // Insert rating
    await db.insert(schema.ratings).values({
      jobId: trip.jobId,
      fromUserId,
      toUserId: provider.userId,
      score: dto.score,
      comment: dto.comment,
    });

    // Update provider's average rating (simple moving average)
    // In production, compute from all ratings — this is a simplified version
    await db
      .update(schema.providers)
      .set({
        rating: String(dto.score), // Simplified; real impl would compute avg
      })
      .where(eq(schema.providers.id, trip.providerId));

    this.logger.log(`Ride rated: trip=${tripId} score=${dto.score}`);
  }

  /**
   * Get current trip state for a user (customer or driver).
   */
  async getTripState(tenantId: string, tripId: string): Promise<TripState | null> {
    const db = this.tenantDb.getConnection(tenantId);

    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.id, tripId))
      .limit(1);

    if (!trip) return null;

    // If driver assigned, get driver details
    let driverDetails: any = null;
    let vehicleDetails: any = null;

    if (trip.providerId) {
      const [provider] = await db
        .select({
          userId: schema.providers.id,
          rating: schema.providers.rating,
        })
        .from(schema.providers)
        .where(eq(schema.providers.id, trip.providerId))
        .limit(1);

      if (provider) {
        const [user] = await db
          .select({ name: schema.users.name, phone: schema.users.phone })
          .from(schema.users)
          .innerJoin(schema.providers, eq(schema.providers.userId, schema.users.id))
          .where(eq(schema.providers.id, trip.providerId))
          .limit(1);

        driverDetails = { ...user, rating: provider.rating };

        const [vehicle] = await db
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.providerId, trip.providerId))
          .limit(1);

        vehicleDetails = vehicle;
      }
    }

    return {
      id: trip.id,
      status: trip.status,
      customerId: trip.customerId,
      providerId: trip.providerId || undefined,
      vehicleClassId: trip.vehicleClassId,
      pickupLat: parseFloat(trip.pickupLat),
      pickupLng: parseFloat(trip.pickupLng),
      pickupAddress: trip.pickupAddress || undefined,
      dropoffLat: parseFloat(trip.dropoffLat),
      dropoffLng: parseFloat(trip.dropoffLng),
      dropoffAddress: trip.dropoffAddress || undefined,
      estimatedFare: trip.estimatedFare || undefined,
      actualFare: trip.actualFare || undefined,
      currency: trip.currency,
      driverName: driverDetails?.name,
      driverPhone: driverDetails?.phone,
      driverRating: driverDetails?.rating,
      vehicleMake: vehicleDetails?.make,
      vehicleModel: vehicleDetails?.model,
      vehiclePlate: vehicleDetails?.plate,
      vehicleColor: vehicleDetails?.color,
      requestedAt: trip.requestedAt.toISOString(),
      acceptedAt: trip.acceptedAt?.toISOString(),
      arrivedAt: trip.arrivedAt?.toISOString(),
      startedAt: trip.startedAt?.toISOString(),
      completedAt: trip.completedAt?.toISOString(),
    };
  }

  /**
   * Get active trip for a customer (not completed/cancelled/expired).
   */
  async getActiveTrip(tenantId: string, customerId: string): Promise<TripState | null> {
    const db = this.tenantDb.getConnection(tenantId);

    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(
        and(
          eq(schema.trips.customerId, customerId),
          // Active statuses
        ),
      )
      .orderBy(desc(schema.trips.requestedAt))
      .limit(1);

    if (!trip || ['completed', 'cancelled', 'expired'].includes(trip.status)) {
      return null;
    }

    return this.getTripState(tenantId, trip.id);
  }

  /**
   * Record a track point for an active trip.
   */
  async recordTrackPoint(
    tenantId: string,
    tripId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);
    await db.insert(schema.tripTracks).values({ tripId, lat: String(lat), lng: String(lng) });
  }

  /**
   * Handle trip expiry from dispatch (no driver found).
   */
  async expireTrip(tenantId: string, tripId: string): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    await db
      .update(schema.trips)
      .set({ status: 'expired' })
      .where(eq(schema.trips.id, tripId));

    this.eventEmitter.emit('ride.expired', { tenantId, tripId });
    this.logger.log(`Ride expired: trip=${tripId}`);
  }

  private toTripState(trip: any): TripState {
    return {
      id: trip.id,
      status: trip.status,
      customerId: trip.customerId,
      providerId: trip.providerId || undefined,
      vehicleClassId: trip.vehicleClassId,
      pickupLat: parseFloat(trip.pickupLat),
      pickupLng: parseFloat(trip.pickupLng),
      pickupAddress: trip.pickupAddress || undefined,
      dropoffLat: parseFloat(trip.dropoffLat),
      dropoffLng: parseFloat(trip.dropoffLng),
      dropoffAddress: trip.dropoffAddress || undefined,
      estimatedFare: trip.estimatedFare || undefined,
      actualFare: trip.actualFare || undefined,
      currency: trip.currency,
      requestedAt: trip.requestedAt?.toISOString?.() || new Date().toISOString(),
      acceptedAt: trip.acceptedAt?.toISOString?.(),
      arrivedAt: trip.arrivedAt?.toISOString?.(),
      startedAt: trip.startedAt?.toISOString?.(),
      completedAt: trip.completedAt?.toISOString?.(),
    };
  }
}
