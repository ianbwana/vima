import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { RideService } from '../services/ride.service';
import { DriverLocationService } from '../services/driver-location.service';
import { DispatchService } from '../services/dispatch.service';
import { RideEvent, RideClientEvent, JobOffer, TripState } from '../interfaces/ride.interfaces';

/**
 * JWT payload extracted from WebSocket auth.
 */
interface WsUser {
  sub: string;
  tenantId: string;
  role: string;
}

/**
 * RideGateway
 *
 * WebSocket gateway for real-time ride-hailing communication.
 *
 * Handles:
 * - JWT-based authentication on connection
 * - Driver location updates (every 3-5s)
 * - Job offer delivery to drivers
 * - Trip status broadcasts to customers
 * - Driver location streaming to customers during active trips
 *
 * Rooms:
 * - `tenant:{tenantId}:driver:{providerId}` — driver-specific events
 * - `tenant:{tenantId}:trip:{tripId}` — trip participants
 * - `tenant:{tenantId}:customer:{userId}` — customer-specific events
 */
@WebSocketGateway({
  namespace: '/rides',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class RideGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RideGateway.name);

  /** Map of socket ID → authenticated user info */
  private connectedUsers = new Map<string, WsUser & { providerId?: string }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly rideService: RideService,
    private readonly driverLocation: DriverLocationService,
    private readonly dispatchService: DispatchService,
  ) {
    // Wire dispatch callbacks to WebSocket delivery
    this.dispatchService.onOfferDriver = (tenantId, providerId, offer) => {
      this.sendJobOffer(tenantId, providerId, offer);
    };
    this.dispatchService.onTripExpired = (tenantId, tripId) => {
      this.broadcastTripUpdate(tenantId, tripId, { status: 'expired' });
    };
    this.dispatchService.onOfferExpired = (tenantId, providerId, tripId) => {
      this.sendToDriver(tenantId, providerId, RideEvent.JOB_OFFER_EXPIRED, { tripId });
    };
  }

  /**
   * Authenticate on WebSocket connection using JWT from auth query param or header.
   */
  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.query?.token as string) ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token) as WsUser;

      this.connectedUsers.set(socket.id, payload);

      // Join user-specific room
      const { tenantId, sub: userId, role } = payload;
      socket.join(`tenant:${tenantId}:customer:${userId}`);

      // If provider, join driver room
      if (role === 'provider') {
        socket.join(`tenant:${tenantId}:driver:${userId}`);
      }

      this.logger.debug(`WS connected: user=${userId} tenant=${tenantId} role=${role}`);
    } catch (error) {
      this.logger.warn(`WS auth failed: ${error}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const user = this.connectedUsers.get(socket.id);
    if (user) {
      this.connectedUsers.delete(socket.id);
      this.logger.debug(`WS disconnected: user=${user.sub}`);
    }
  }

  /**
   * Driver sends location update.
   * Updates Redis GEO and broadcasts to trip subscribers.
   */
  @SubscribeMessage(RideClientEvent.LOCATION_UPDATE)
  async handleLocationUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { lat: number; lng: number; tripId?: string },
  ): Promise<void> {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    const { tenantId, sub: userId } = user;

    // Update Redis GEO
    await this.driverLocation.updateLocation(tenantId, userId, data.lat, data.lng);

    // If there's an active trip, broadcast location to customer and record track
    if (data.tripId) {
      this.server
        .to(`tenant:${tenantId}:trip:${data.tripId}`)
        .emit(RideEvent.DRIVER_LOCATION, {
          lat: data.lat,
          lng: data.lng,
          timestamp: Date.now(),
        });

      // Record track point
      await this.rideService.recordTrackPoint(tenantId, data.tripId, data.lat, data.lng);
    }
  }

  /**
   * Driver accepts a job offer.
   */
  @SubscribeMessage(RideClientEvent.ACCEPT_JOB)
  async handleAcceptJob(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { tripId: string },
  ): Promise<{ success: boolean; trip?: TripState }> {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return { success: false };

    const { tenantId, sub: providerId } = user;

    const trip = await this.rideService.acceptRide(tenantId, data.tripId, providerId);

    if (trip) {
      // Join trip room
      socket.join(`tenant:${tenantId}:trip:${data.tripId}`);

      // Broadcast trip update to customer
      this.broadcastTripUpdate(tenantId, data.tripId, trip);

      return { success: true, trip };
    }

    return { success: false };
  }

  /**
   * Driver declines a job offer.
   */
  @SubscribeMessage(RideClientEvent.DECLINE_JOB)
  async handleDeclineJob(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { tripId: string },
  ): Promise<void> {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    await this.dispatchService.handleDecline(user.tenantId, data.tripId, user.sub);
  }

  /**
   * Driver marks arrival at pickup.
   */
  @SubscribeMessage(RideClientEvent.ARRIVE)
  async handleArrive(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { tripId: string },
  ): Promise<{ success: boolean; trip?: TripState }> {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return { success: false };

    const trip = await this.rideService.driverArrived(user.tenantId, data.tripId, user.sub);
    this.broadcastTripUpdate(user.tenantId, data.tripId, trip);
    return { success: true, trip };
  }

  /**
   * Driver starts the trip (passenger picked up).
   */
  @SubscribeMessage(RideClientEvent.START_TRIP)
  async handleStartTrip(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { tripId: string },
  ): Promise<{ success: boolean; trip?: TripState }> {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return { success: false };

    const trip = await this.rideService.startTrip(user.tenantId, data.tripId, user.sub);
    this.broadcastTripUpdate(user.tenantId, data.tripId, trip);
    return { success: true, trip };
  }

  /**
   * Driver ends the trip (destination reached).
   */
  @SubscribeMessage(RideClientEvent.END_TRIP)
  async handleEndTrip(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { tripId: string; distanceKm?: number; durationMin?: number },
  ): Promise<{ success: boolean; trip?: TripState }> {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return { success: false };

    const trip = await this.rideService.completeTrip(
      user.tenantId,
      data.tripId,
      user.sub,
      data.distanceKm,
      data.durationMin,
    );
    this.broadcastTripUpdate(user.tenantId, data.tripId, trip);
    return { success: true, trip };
  }

  /**
   * Customer subscribes to a trip's updates.
   */
  @SubscribeMessage(RideClientEvent.SUBSCRIBE_TRIP)
  async handleSubscribeTrip(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { tripId: string },
  ): Promise<void> {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    socket.join(`tenant:${user.tenantId}:trip:${data.tripId}`);
  }

  // --- Outbound methods (called by services) ---

  /**
   * Send a job offer to a specific driver via WebSocket.
   */
  sendJobOffer(tenantId: string, providerId: string, offer: JobOffer): void {
    this.server
      .to(`tenant:${tenantId}:driver:${providerId}`)
      .emit(RideEvent.JOB_OFFER, offer);
  }

  /**
   * Broadcast a trip state update to all trip subscribers.
   */
  broadcastTripUpdate(tenantId: string, tripId: string, data: any): void {
    this.server
      .to(`tenant:${tenantId}:trip:${tripId}`)
      .emit(RideEvent.TRIP_UPDATE, data);
  }

  /**
   * Send an event to a specific driver.
   */
  private sendToDriver(tenantId: string, providerId: string, event: string, data: any): void {
    this.server
      .to(`tenant:${tenantId}:driver:${providerId}`)
      .emit(event, data);
  }
}
