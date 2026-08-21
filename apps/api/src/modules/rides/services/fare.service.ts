import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import { FareEstimateResult } from '../interfaces/ride.interfaces';

/**
 * Fare rule data resolved from the database.
 */
export interface FareRuleData {
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  surgeMultiplier: number;
  currency: string;
  commissionRate: number;
}

/**
 * FareService
 *
 * Calculates ride fares based on zone-specific fare rules.
 * Supports both estimates (before trip) and actual fare (after trip).
 *
 * Formula:
 *   fare = max(baseFare + (distanceKm * perKmRate) + (durationMin * perMinRate), minimumFare) * surgeMultiplier
 */
@Injectable()
export class FareService {
  private readonly logger = new Logger(FareService.name);

  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Get fare estimates for all active vehicle classes in the resolved zone.
   * Returns an estimate per vehicle class.
   */
  async getEstimates(
    tenantId: string,
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    vehicleClassId?: string,
  ): Promise<FareEstimateResult[]> {
    const distanceKm = this.calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    // Estimate duration: average speed 30 km/h in urban areas
    const durationMin = (distanceKm / 30) * 60;

    const db = this.tenantDb.getConnection(tenantId);

    // Get all active fare rules (optionally filtered by vehicle class)
    let fareRulesQuery = db
      .select({
        fareRuleId: schema.fareRules.id,
        baseFare: schema.fareRules.baseFare,
        perKm: schema.fareRules.perKm,
        perMinute: schema.fareRules.perMinute,
        minimumFare: schema.fareRules.minimumFare,
        surgeMultiplier: schema.fareRules.surgeMultiplier,
        currency: schema.fareRules.currency,
        vehicleClassId: schema.fareRules.vehicleClassId,
        vehicleClassName: schema.vehicleClasses.name,
      })
      .from(schema.fareRules)
      .innerJoin(
        schema.vehicleClasses,
        eq(schema.fareRules.vehicleClassId, schema.vehicleClasses.id),
      )
      .where(eq(schema.vehicleClasses.active, true));

    const fareRules = await fareRulesQuery;

    // Filter by specific vehicle class if provided
    const filtered = vehicleClassId
      ? fareRules.filter((r) => r.vehicleClassId === vehicleClassId)
      : fareRules;

    if (filtered.length === 0) {
      return [];
    }

    // Calculate fare for each vehicle class
    return filtered.map((rule) => {
      const fare = this.calculateFare(
        {
          baseFare: parseFloat(rule.baseFare),
          perKm: parseFloat(rule.perKm),
          perMinute: parseFloat(rule.perMinute),
          minimumFare: parseFloat(rule.minimumFare),
          surgeMultiplier: parseFloat(rule.surgeMultiplier),
          currency: rule.currency,
          commissionRate: 0, // Not needed for estimate
        },
        distanceKm,
        durationMin,
      );

      return {
        vehicleClassId: rule.vehicleClassId,
        vehicleClassName: rule.vehicleClassName,
        estimatedFare: fare.toFixed(2),
        currency: rule.currency,
        distanceKm: Math.round(distanceKm * 100) / 100,
        durationMin: Math.round(durationMin),
        surgeMultiplier: rule.surgeMultiplier,
      };
    });
  }

  /**
   * Get the fare rule for a specific zone and vehicle class.
   * Used when creating a trip to lock in the fare parameters.
   */
  async getFareRule(
    tenantId: string,
    zoneId: string,
    vehicleClassId: string,
  ): Promise<FareRuleData | null> {
    const db = this.tenantDb.getConnection(tenantId);

    const [rule] = await db
      .select()
      .from(schema.fareRules)
      .where(
        and(
          eq(schema.fareRules.zoneId, zoneId),
          eq(schema.fareRules.vehicleClassId, vehicleClassId),
        ),
      )
      .limit(1);

    if (!rule) return null;

    return {
      baseFare: parseFloat(rule.baseFare),
      perKm: parseFloat(rule.perKm),
      perMinute: parseFloat(rule.perMinute),
      minimumFare: parseFloat(rule.minimumFare),
      surgeMultiplier: parseFloat(rule.surgeMultiplier),
      currency: rule.currency,
      commissionRate: parseFloat(rule.commissionRate),
    };
  }

  /**
   * Get the first fare rule available for a vehicle class (any zone).
   * Used as fallback when zone is not yet determined.
   */
  async getDefaultFareRule(
    tenantId: string,
    vehicleClassId: string,
  ): Promise<FareRuleData | null> {
    const db = this.tenantDb.getConnection(tenantId);

    const [rule] = await db
      .select()
      .from(schema.fareRules)
      .where(eq(schema.fareRules.vehicleClassId, vehicleClassId))
      .limit(1);

    if (!rule) return null;

    return {
      baseFare: parseFloat(rule.baseFare),
      perKm: parseFloat(rule.perKm),
      perMinute: parseFloat(rule.perMinute),
      minimumFare: parseFloat(rule.minimumFare),
      surgeMultiplier: parseFloat(rule.surgeMultiplier),
      currency: rule.currency,
      commissionRate: parseFloat(rule.commissionRate),
    };
  }

  /**
   * Calculate fare from rule parameters and trip metrics.
   *
   * Formula: max(baseFare + (distance * perKm) + (duration * perMinute), minimumFare) * surge
   */
  calculateFare(rule: FareRuleData, distanceKm: number, durationMin: number): number {
    const raw = rule.baseFare + (distanceKm * rule.perKm) + (durationMin * rule.perMinute);
    const withMinimum = Math.max(raw, rule.minimumFare);
    return Math.round(withMinimum * rule.surgeMultiplier * 100) / 100;
  }

  /**
   * Calculate the Haversine distance between two coordinates in km.
   * Used for fare estimates when an external distance API isn't available.
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
