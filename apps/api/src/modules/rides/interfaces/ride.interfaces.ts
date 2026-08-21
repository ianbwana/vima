/**
 * Core interfaces for the ride-hailing module.
 */

/** Fare estimate result for a ride */
export interface FareEstimateResult {
  vehicleClassId: string;
  vehicleClassName: string;
  estimatedFare: string;
  currency: string;
  distanceKm: number;
  durationMin: number;
  surgeMultiplier: string;
}

/** Nearby driver found via Redis GEO */
export interface NearbyDriver {
  providerId: string;
  distanceKm: number;
  lat: number;
  lng: number;
}

/** Job offer sent to a driver */
export interface JobOffer {
  tripId: string;
  customerId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  vehicleClassName: string;
  estimatedFare: string;
  currency: string;
  distanceKm: number;
  expiresAt: number; // unix timestamp ms
}

/** Trip state for client consumption */
export interface TripState {
  id: string;
  status: string;
  customerId: string;
  providerId?: string;
  vehicleClassId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  estimatedFare?: string;
  actualFare?: string;
  currency: string;
  driverName?: string;
  driverPhone?: string;
  driverRating?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  vehicleColor?: string;
  driverLat?: number;
  driverLng?: number;
  requestedAt: string;
  acceptedAt?: string;
  arrivedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Settlement breakdown for a completed trip */
export interface FareSettlement {
  totalFare: string;
  commission: string;
  providerEarnings: string;
  currency: string;
}

/** WebSocket events emitted by the server */
export enum RideEvent {
  DRIVER_LOCATION = 'driver:location',
  TRIP_UPDATE = 'trip:update',
  JOB_OFFER = 'job:offer',
  JOB_OFFER_EXPIRED = 'job:offer:expired',
  TRIP_CANCELLED = 'trip:cancelled',
}

/** WebSocket events received from clients */
export enum RideClientEvent {
  LOCATION_UPDATE = 'location:update',
  ACCEPT_JOB = 'job:accept',
  DECLINE_JOB = 'job:decline',
  ARRIVE = 'trip:arrive',
  START_TRIP = 'trip:start',
  END_TRIP = 'trip:end',
  SUBSCRIBE_TRIP = 'trip:subscribe',
}
