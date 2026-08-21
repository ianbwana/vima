import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CourierService } from '../services/courier.service';
import { SendParcelDto, ConfirmPickupDto, ConfirmDeliveryDto } from '../dto/courier.dto';

/**
 * CourierController
 *
 * Endpoints for courier/parcel delivery.
 * Customer: send, track, list parcels.
 * Provider: accept, pickup, deliver with proof.
 * Gated behind @RequireModule('courier').
 */
@Controller('courier')
export class CourierController {
  constructor(private readonly courierService: CourierService) {}

  /**
   * Get fee estimate for a parcel delivery.
   * POST /courier/estimate
   */
  @Post('estimate')
  async estimate(@Body() body: { packageCategory: string; pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number }) {
    const result = this.courierService.estimateFee(
      body.packageCategory, body.pickupLat, body.pickupLng, body.dropoffLat, body.dropoffLng,
    );
    return { estimate: result };
  }

  /**
   * Send a parcel.
   * POST /courier/send
   */
  @Post('send')
  async sendParcel(@Req() req: any, @Body() dto: SendParcelDto) {
    const { tenantId, sub: userId } = req.user;
    const parcel = await this.courierService.sendParcel(tenantId, userId, dto);
    return { parcel };
  }

  /**
   * Get parcel details.
   * GET /courier/parcels/:id
   */
  @Get('parcels/:id')
  async getParcel(@Req() req: any, @Param('id') parcelId: string) {
    const { tenantId } = req.user;
    const parcel = await this.courierService.getParcel(tenantId, parcelId);
    return { parcel };
  }

  /**
   * List sender's parcels.
   * GET /courier/parcels
   */
  @Get('parcels')
  async listParcels(@Req() req: any) {
    const { tenantId, sub: userId } = req.user;
    const parcels = await this.courierService.listSenderParcels(tenantId, userId);
    return { parcels };
  }

  // --- Provider endpoints ---

  /**
   * Accept a parcel delivery offer.
   * POST /courier/accept/:id
   */
  @Post('accept/:id')
  async acceptParcel(@Req() req: any, @Param('id') parcelId: string) {
    const { tenantId, sub: providerId } = req.user;
    const parcel = await this.courierService.acceptParcel(tenantId, parcelId, providerId);
    return { success: !!parcel, parcel };
  }

  /**
   * Confirm parcel pickup.
   * POST /courier/pickup
   */
  @Post('pickup')
  async confirmPickup(@Req() req: any, @Body() dto: ConfirmPickupDto) {
    const { tenantId, sub: providerId } = req.user;
    const parcel = await this.courierService.confirmPickup(tenantId, dto.parcelId, providerId);
    return { parcel };
  }

  /**
   * Confirm delivery with proof.
   * POST /courier/deliver
   */
  @Post('deliver')
  async confirmDelivery(@Req() req: any, @Body() dto: ConfirmDeliveryDto) {
    const { tenantId, sub: providerId } = req.user;
    const parcel = await this.courierService.confirmDelivery(tenantId, dto, providerId);
    return { parcel };
  }
}
