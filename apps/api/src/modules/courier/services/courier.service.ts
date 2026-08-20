import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import { SendParcelDto, ConfirmDeliveryDto } from '../dto/courier.dto';
import { DispatchService } from '../../rides/services/dispatch.service';
import { DriverLocationService } from '../../rides/services/driver-location.service';

/**
 * Pricing rules per package category (base + per-km).
 * In production, this would be configurable per tenant/zone.
 */
const PACKAGE_PRICING: Record<string, { base: number; perKm: number; maxKg: number }> = {
  document: { base: 3.00, perKm: 0.80, maxKg: 1 },
  small: { base: 5.00, perKm: 1.00, maxKg: 5 },
  medium: { base: 8.00, perKm: 1.50, maxKg: 15 },
  large: { base: 12.00, perKm: 2.00, maxKg: 30 },
};

/**
 * CourierService
 *
 * Manages the parcel delivery lifecycle:
 * - Send: estimate fee, create parcel, dispatch to courier
 * - Pickup: courier confirms collection at sender
 * - Deliver: proof of delivery (photo + OTP), COD collection
 * - Settlement: via ledger (debit sender, credit courier + tenant)
 *
 * Reuses the same DispatchService as ride-hailing (job type: 'parcel').
 */
@Injectable()
export class CourierService {
  private readonly logger = new Logger(CourierService.name);

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dispatchService: DispatchService,
    private readonly driverLocation: DriverLocationService,
  ) {}

  /**
   * Estimate delivery fee based on package category and distance.
   */
  estimateFee(
    packageCategory: string,
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
  ): { fee: number; currency: string } {
    const pricing = PACKAGE_PRICING[packageCategory];
    if (!pricing) throw new BadRequestException('Invalid package category');

    const distanceKm = this.calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const fee = Math.round((pricing.base + distanceKm * pricing.perKm) * 100) / 100;

    return { fee, currency: 'USD' };
  }

  /**
   * Create a parcel delivery request and initiate dispatch.
   */
  async sendParcel(tenantId: string, senderId: string, dto: SendParcelDto) {
    const db = this.tenantDb.getConnection(tenantId);

    // Estimate fee
    const { fee } = this.estimateFee(
      dto.packageCategory,
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
    );

    // Create job record (shared logistics)
    const [job] = await db
      .insert(schema.jobs)
      .values({
        type: 'parcel',
        status: 'matching',
        customerId: senderId,
        pickupLat: String(dto.pickupLat),
        pickupLng: String(dto.pickupLng),
        pickupAddress: dto.pickupAddress,
        dropoffLat: String(dto.dropoffLat),
        dropoffLng: String(dto.dropoffLng),
        dropoffAddress: dto.dropoffAddress,
        estimatedFare: String(fee),
        currency: 'USD',
      })
      .returning();

    // Create parcel record
    const [parcel] = await db
      .insert(schema.parcels)
      .values({
        jobId: job.id,
        senderId,
        recipientName: dto.recipientName,
        recipientPhone: dto.recipientPhone,
        packageCategory: dto.packageCategory,
        weightKg: dto.weightKg ? String(dto.weightKg) : null,
        description: dto.description,
        specialInstructions: dto.specialInstructions,
        pickupAddress: dto.pickupAddress,
        pickupLat: String(dto.pickupLat),
        pickupLng: String(dto.pickupLng),
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: String(dto.dropoffLat),
        dropoffLng: String(dto.dropoffLng),
        estimatedFee: String(fee),
        codAmount: dto.codAmount ? String(dto.codAmount) : null,
        status: 'pending',
      })
      .returning();

    // Start dispatch (reuses ride-hailing dispatch with 'parcel' capability filter)
    await this.dispatchService.startDispatch(tenantId, parcel.id, dto.pickupLat, dto.pickupLng);

    this.logger.log(`Parcel created: ${parcel.id} fee=${fee} category=${dto.packageCategory}`);
    return parcel;
  }

  /**
   * Courier confirms parcel pickup at sender location.
   */
  async confirmPickup(tenantId: string, parcelId: string, providerId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const [parcel] = await db
      .update(schema.parcels)
      .set({
        status: 'picked_up',
        providerId,
        pickedUpAt: new Date(),
      })
      .where(eq(schema.parcels.id, parcelId))
      .returning();

    if (!parcel) throw new NotFoundException('Parcel not found');

    // Update job status
    if (parcel.jobId) {
      await db.update(schema.jobs).set({ status: 'in_progress', providerId }).where(eq(schema.jobs.id, parcel.jobId));
    }

    this.eventEmitter.emit('parcel.picked_up', { tenantId, parcelId, senderId: parcel.senderId });
    this.logger.log(`Parcel picked up: ${parcelId} by provider=${providerId}`);
    return parcel;
  }

  /**
   * Courier confirms delivery with proof (photo + OTP) and COD collection.
   */
  async confirmDelivery(tenantId: string, dto: ConfirmDeliveryDto, providerId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const updateData: Record<string, any> = {
      status: 'delivered',
      deliveredAt: new Date(),
    };

    if (dto.proofPhotoUrl) updateData.proofPhotoUrl = dto.proofPhotoUrl;
    if (dto.recipientOtp) updateData.proofOtpVerified = true;
    if (dto.codCollected) updateData.codCollected = true;

    const [parcel] = await db
      .update(schema.parcels)
      .set(updateData)
      .where(and(eq(schema.parcels.id, dto.parcelId), eq(schema.parcels.providerId, providerId)))
      .returning();

    if (!parcel) throw new NotFoundException('Parcel not found or not assigned to you');

    // Update job status
    if (parcel.jobId) {
      await db.update(schema.jobs).set({ status: 'completed', completedAt: new Date() }).where(eq(schema.jobs.id, parcel.jobId));
    }

    this.eventEmitter.emit('parcel.delivered', {
      tenantId,
      parcelId: parcel.id,
      senderId: parcel.senderId,
      providerId,
      codCollected: parcel.codCollected,
      codAmount: parcel.codAmount,
    });

    this.logger.log(`Parcel delivered: ${dto.parcelId} proof=${!!dto.proofPhotoUrl} otp=${!!dto.recipientOtp}`);
    return parcel;
  }

  /**
   * Courier accepts a parcel dispatch offer.
   */
  async acceptParcel(tenantId: string, parcelId: string, providerId: string) {
    const accepted = await this.dispatchService.handleAccept(tenantId, parcelId, providerId);
    if (!accepted) return null;

    const db = this.tenantDb.getConnection(tenantId);
    const [parcel] = await db
      .update(schema.parcels)
      .set({ providerId })
      .where(eq(schema.parcels.id, parcelId))
      .returning();

    // Update job
    if (parcel?.jobId) {
      await db.update(schema.jobs).set({ status: 'accepted', providerId, acceptedAt: new Date() }).where(eq(schema.jobs.id, parcel.jobId));
    }

    await this.driverLocation.removeFromPool(tenantId, providerId);
    this.logger.log(`Parcel accepted: ${parcelId} by ${providerId}`);
    return parcel;
  }

  /**
   * Get parcel details.
   */
  async getParcel(tenantId: string, parcelId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [parcel] = await db
      .select()
      .from(schema.parcels)
      .where(eq(schema.parcels.id, parcelId))
      .limit(1);
    if (!parcel) throw new NotFoundException('Parcel not found');
    return parcel;
  }

  /**
   * List parcels for a sender.
   */
  async listSenderParcels(tenantId: string, senderId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db.select().from(schema.parcels).where(eq(schema.parcels.senderId, senderId));
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
