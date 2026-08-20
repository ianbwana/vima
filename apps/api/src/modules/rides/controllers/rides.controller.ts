import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RideService } from '../services/ride.service';
import { FareService } from '../services/fare.service';
import { DriverLocationService } from '../services/driver-location.service';
import { RequestRideDto, FareEstimateDto, CancelRideDto, RateRideDto } from '../dto/request-ride.dto';
import { UpdateLocationDto, ToggleOnlineDto } from '../dto/driver-location.dto';

/**
 * RidesController
 *
 * REST API endpoints for ride-hailing operations.
 * All endpoints require JWT authentication and the 'rides' module entitlement.
 *
 * Customer endpoints: estimate, request, status, cancel, rate
 * Driver endpoints: online toggle, location update
 */
@Controller('rides')
export class RidesController {
  constructor(
    private readonly rideService: RideService,
    private readonly fareService: FareService,
    private readonly driverLocation: DriverLocationService,
  ) {}

  /**
   * Get fare estimates for a route.
   * POST /rides/estimate
   */
  @Post('estimate')
  async getFareEstimate(@Req() req: any, @Body() dto: FareEstimateDto) {
    const { tenantId } = req.user;
    const estimates = await this.fareService.getEstimates(
      tenantId,
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
      dto.vehicleClassId,
    );
    return { estimates };
  }

  /**
   * Request a new ride.
   * POST /rides/request
   */
  @Post('request')
  async requestRide(@Req() req: any, @Body() dto: RequestRideDto) {
    const { tenantId, sub: userId } = req.user;
    const trip = await this.rideService.requestRide(tenantId, userId, dto);
    return { trip };
  }

  /**
   * Get current trip status.
   * GET /rides/trips/:id
   */
  @Get('trips/:id')
  async getTripStatus(@Req() req: any, @Param('id') tripId: string) {
    const { tenantId } = req.user;
    const trip = await this.rideService.getTripState(tenantId, tripId);
    return { trip };
  }

  /**
   * Get active trip for the current user.
   * GET /rides/active
   */
  @Get('active')
  async getActiveTrip(@Req() req: any) {
    const { tenantId, sub: userId } = req.user;
    const trip = await this.rideService.getActiveTrip(tenantId, userId);
    return { trip };
  }

  /**
   * Cancel a ride.
   * POST /rides/trips/:id/cancel
   */
  @Post('trips/:id/cancel')
  async cancelRide(
    @Req() req: any,
    @Param('id') tripId: string,
    @Body() dto: CancelRideDto,
  ) {
    const { tenantId, sub: userId } = req.user;
    await this.rideService.cancelRide(tenantId, tripId, userId, dto);
    return { success: true, message: 'Ride cancelled' };
  }

  /**
   * Rate a completed ride.
   * POST /rides/trips/:id/rate
   */
  @Post('trips/:id/rate')
  async rateRide(
    @Req() req: any,
    @Param('id') tripId: string,
    @Body() dto: RateRideDto,
  ) {
    const { tenantId, sub: userId } = req.user;
    await this.rideService.rateRide(tenantId, tripId, userId, dto);
    return { success: true, message: 'Rating submitted' };
  }

  // --- Driver endpoints ---

  /**
   * Toggle driver online/offline status.
   * POST /rides/driver/online
   */
  @Post('driver/online')
  async toggleOnline(@Req() req: any, @Body() dto: ToggleOnlineDto) {
    const { tenantId, sub: providerId } = req.user;
    await this.driverLocation.setOnlineStatus(tenantId, providerId, dto.online);
    return { success: true, online: dto.online };
  }

  /**
   * Update driver location (REST fallback; prefer WebSocket).
   * POST /rides/driver/location
   */
  @Post('driver/location')
  async updateLocation(@Req() req: any, @Body() dto: UpdateLocationDto) {
    const { tenantId, sub: providerId } = req.user;
    await this.driverLocation.updateLocation(tenantId, providerId, dto.lat, dto.lng);
    return { success: true };
  }
}
