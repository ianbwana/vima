import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { DriverLocationService } from './driver-location.service';
import { NearbyDriver, JobOffer } from '../interfaces/ride.interfaces';

/**
 * Dispatch configuration constants.
 */
const DISPATCH_CONFIG = {
  /** Time (ms) a driver has to accept/decline an offer */
  OFFER_TIMEOUT_MS: 20_000,
  /** Initial search radius in km */
  INITIAL_RADIUS_KM: 3,
  /** Radius increment on each expansion */
  RADIUS_INCREMENT_KM: 2,
  /** Maximum search radius */
  MAX_RADIUS_KM: 15,
  /** Max number of sequential offers before expiring the ride */
  MAX_OFFERS: 10,
  /** Redis key TTL for dispatch state (1 hour) */
  STATE_TTL_SECONDS: 3600,
};

/**
 * Internal state for an active dispatch cycle.
 */
export interface DispatchState {
  tripId: string;
  tenantId: string;
  pickupLat: number;
  pickupLng: number;
  currentRadius: number;
  offeredTo: string[]; // provider IDs already offered
  currentOffer?: string; // current provider being offered
  offerExpiresAt?: number; // unix timestamp ms
  attempts: number;
  status: 'searching' | 'offered' | 'accepted' | 'expired';
}

/**
 * DispatchService
 *
 * Manages the driver matching and offer sequencing for ride requests.
 * 
 * Flow:
 * 1. Find nearby drivers (Redis GEO via DriverLocationService)
 * 2. Offer to closest driver with a 20-second timeout
 * 3. On decline/timeout: offer to next driver
 * 4. On no candidates: widen radius and retry
 * 5. After exhausting all options: expire the ride
 *
 * Dispatch state is stored in Redis for crash recovery.
 * The actual offer delivery happens via WebSocket (RideGateway calls this service).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  /** Active dispatch timers (in-memory, lost on restart — Redis state survives) */
  private offerTimers = new Map<string, NodeJS.Timeout>();

  /** Callback invoked when an offer needs to be sent to a driver */
  onOfferDriver?: (tenantId: string, providerId: string, offer: JobOffer) => void;
  /** Callback invoked when a trip expires (no driver found) */
  onTripExpired?: (tenantId: string, tripId: string) => void;
  /** Callback invoked when offer times out for a driver */
  onOfferExpired?: (tenantId: string, providerId: string, tripId: string) => void;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly driverLocation: DriverLocationService,
  ) {}

  /**
   * Start the dispatch process for a new trip.
   * Finds nearby drivers and initiates the offer sequence.
   *
   * @returns The initial dispatch state
   */
  async startDispatch(
    tenantId: string,
    tripId: string,
    pickupLat: number,
    pickupLng: number,
  ): Promise<DispatchState> {
    const state: DispatchState = {
      tripId,
      tenantId,
      pickupLat,
      pickupLng,
      currentRadius: DISPATCH_CONFIG.INITIAL_RADIUS_KM,
      offeredTo: [],
      attempts: 0,
      status: 'searching',
    };

    await this.saveState(state);
    await this.findAndOffer(state);

    return state;
  }

  /**
   * Handle a driver accepting the offer.
   * Clears the timeout and updates state.
   *
   * @returns true if acceptance was valid (offer was still active)
   */
  async handleAccept(tenantId: string, tripId: string, providerId: string): Promise<boolean> {
    const state = await this.getState(tripId);
    if (!state) return false;

    if (state.currentOffer !== providerId || state.status !== 'offered') {
      return false; // Offer expired or was for someone else
    }

    // Clear timeout
    this.clearOfferTimer(tripId);

    // Update state
    state.status = 'accepted';
    state.currentOffer = undefined;
    state.offerExpiresAt = undefined;
    await this.saveState(state);

    this.logger.log(`Dispatch accepted: trip=${tripId} driver=${providerId}`);
    return true;
  }

  /**
   * Handle a driver declining the offer.
   * Moves to the next candidate.
   */
  async handleDecline(tenantId: string, tripId: string, providerId: string): Promise<void> {
    const state = await this.getState(tripId);
    if (!state || state.currentOffer !== providerId) return;

    this.clearOfferTimer(tripId);
    state.currentOffer = undefined;
    state.offerExpiresAt = undefined;

    await this.findAndOffer(state);
  }

  /**
   * Cancel an active dispatch (e.g., customer cancelled ride).
   */
  async cancelDispatch(tripId: string): Promise<void> {
    this.clearOfferTimer(tripId);
    await this.redis.del(this.stateKey(tripId));
    this.logger.log(`Dispatch cancelled: trip=${tripId}`);
  }

  /**
   * Find the next available driver and send them an offer.
   * Widens radius or expires the trip if no candidates found.
   */
  private async findAndOffer(state: DispatchState): Promise<void> {
    const { tenantId, tripId, pickupLat, pickupLng } = state;

    // Find nearby drivers, excluding those already offered
    const nearby = await this.driverLocation.findNearbyDrivers(
      tenantId,
      pickupLat,
      pickupLng,
      state.currentRadius,
      'ride',
      state.offeredTo,
      5,
    );

    if (nearby.length > 0) {
      // Offer to closest driver
      const candidate = nearby[0];
      await this.offerToDriver(state, candidate);
    } else if (state.currentRadius < DISPATCH_CONFIG.MAX_RADIUS_KM) {
      // Widen radius and retry
      state.currentRadius += DISPATCH_CONFIG.RADIUS_INCREMENT_KM;
      this.logger.log(
        `Widening search radius to ${state.currentRadius}km for trip=${tripId}`,
      );
      await this.saveState(state);
      await this.findAndOffer(state);
    } else {
      // Exhausted all options — expire
      state.status = 'expired';
      await this.saveState(state);
      this.logger.log(`Dispatch expired: trip=${tripId} (no drivers found)`);
      this.onTripExpired?.(tenantId, tripId);
    }
  }

  /**
   * Send an offer to a specific driver and start the timeout.
   */
  private async offerToDriver(state: DispatchState, driver: NearbyDriver): Promise<void> {
    const { tenantId, tripId } = state;

    state.currentOffer = driver.providerId;
    state.offeredTo.push(driver.providerId);
    state.offerExpiresAt = Date.now() + DISPATCH_CONFIG.OFFER_TIMEOUT_MS;
    state.status = 'offered';
    state.attempts++;

    await this.saveState(state);

    // Build offer payload
    const offer: JobOffer = {
      tripId,
      customerId: '', // filled by caller
      pickupLat: state.pickupLat,
      pickupLng: state.pickupLng,
      dropoffLat: 0, // filled by caller
      dropoffLng: 0,
      vehicleClassName: '',
      estimatedFare: '',
      currency: '',
      distanceKm: driver.distanceKm,
      expiresAt: state.offerExpiresAt,
    };

    // Notify via callback (RideGateway will send via WebSocket)
    this.onOfferDriver?.(tenantId, driver.providerId, offer);

    // Start timeout timer
    const timer = setTimeout(() => {
      this.handleOfferTimeout(state);
    }, DISPATCH_CONFIG.OFFER_TIMEOUT_MS);

    this.offerTimers.set(tripId, timer);

    this.logger.log(
      `Offer sent: trip=${tripId} driver=${driver.providerId} distance=${driver.distanceKm.toFixed(1)}km`,
    );
  }

  /**
   * Handle an offer timeout (driver didn't respond in time).
   */
  private async handleOfferTimeout(state: DispatchState): Promise<void> {
    const { tenantId, tripId, currentOffer } = state;

    this.logger.log(`Offer timed out: trip=${tripId} driver=${currentOffer}`);
    this.onOfferExpired?.(tenantId, currentOffer || '', tripId);

    // Check if we've exceeded max attempts
    if (state.attempts >= DISPATCH_CONFIG.MAX_OFFERS) {
      state.status = 'expired';
      await this.saveState(state);
      this.onTripExpired?.(tenantId, tripId);
      return;
    }

    state.currentOffer = undefined;
    state.offerExpiresAt = undefined;

    // Find next driver
    await this.findAndOffer(state);
  }

  /**
   * Get dispatch state from Redis.
   */
  async getState(tripId: string): Promise<DispatchState | null> {
    const data = await this.redis.get(this.stateKey(tripId));
    if (!data) return null;
    return JSON.parse(data) as DispatchState;
  }

  /**
   * Save dispatch state to Redis.
   */
  private async saveState(state: DispatchState): Promise<void> {
    await this.redis.setex(
      this.stateKey(state.tripId),
      DISPATCH_CONFIG.STATE_TTL_SECONDS,
      JSON.stringify(state),
    );
  }

  private stateKey(tripId: string): string {
    return `dispatch:${tripId}`;
  }

  private clearOfferTimer(tripId: string): void {
    const timer = this.offerTimers.get(tripId);
    if (timer) {
      clearTimeout(timer);
      this.offerTimers.delete(tripId);
    }
  }
}
