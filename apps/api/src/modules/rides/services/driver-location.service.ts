import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { NearbyDriver } from '../interfaces/ride.interfaces';
import { TenantDbService } from '../../../database/tenant-db.service';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../../database/schemas/tenant.schema';

/**
 * DriverLocationService
 *
 * Manages real-time driver location tracking using Redis GEO commands.
 * Each tenant has an isolated GEO set: `drivers:{tenantId}:locations`.
 *
 * Provides:
 * - Location updates (GEOADD) — called every 3-5s by online drivers
 * - Nearby driver search (GEORADIUS) — used by dispatch to find candidates
 * - Driver removal (ZREM) — when driver goes offline
 * - Online/offline toggle with DB persistence
 */
@Injectable()
export class DriverLocationService {
  private readonly logger = new Logger(DriverLocationService.name);

  /** Redis key prefix for driver geo sets */
  private static readonly GEO_KEY_PREFIX = 'drivers:';
  private static readonly GEO_KEY_SUFFIX = ':locations';

  /** Redis key prefix for driver online status with TTL (heartbeat) */
  private static readonly ONLINE_KEY_PREFIX = 'driver:online:';
  private static readonly ONLINE_TTL_SECONDS = 30; // Consider offline if no update in 30s

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tenantDb: TenantDbService,
  ) {}

  /**
   * Get the Redis GEO key for a tenant's driver locations.
   */
  private geoKey(tenantId: string): string {
    return `${DriverLocationService.GEO_KEY_PREFIX}${tenantId}${DriverLocationService.GEO_KEY_SUFFIX}`;
  }

  /**
   * Get the Redis heartbeat key for a specific driver.
   */
  private onlineKey(tenantId: string, providerId: string): string {
    return `${DriverLocationService.ONLINE_KEY_PREFIX}${tenantId}:${providerId}`;
  }

  /**
   * Update a driver's location in Redis GEO and refresh their heartbeat.
   * Called every 3-5 seconds while the driver is online.
   *
   * Also updates the persistent location in the providers table.
   */
  async updateLocation(
    tenantId: string,
    providerId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    const key = this.geoKey(tenantId);

    // GEOADD expects: key, longitude, latitude, member
    await this.redis.geoadd(key, lng, lat, providerId);

    // Refresh heartbeat TTL
    await this.redis.setex(
      this.onlineKey(tenantId, providerId),
      DriverLocationService.ONLINE_TTL_SECONDS,
      '1',
    );

    // Persist to DB (non-blocking, fire and forget for perf)
    this.persistLocation(tenantId, providerId, lat, lng).catch((err) =>
      this.logger.error(`Failed to persist location: ${err.message}`),
    );
  }

  /**
   * Find nearby online drivers within a radius, filtered by capability.
   * Returns drivers sorted by distance (closest first).
   *
   * @param tenantId - Tenant isolation
   * @param lat - Pickup latitude
   * @param lng - Pickup longitude
   * @param radiusKm - Search radius in kilometers
   * @param capability - Required capability (e.g., 'ride')
   * @param excludeIds - Provider IDs to exclude (already offered/declined)
   * @param limit - Max results
   */
  async findNearbyDrivers(
    tenantId: string,
    lat: number,
    lng: number,
    radiusKm: number,
    capability: string = 'ride',
    excludeIds: string[] = [],
    limit: number = 20,
  ): Promise<NearbyDriver[]> {
    const key = this.geoKey(tenantId);

    // GEORADIUS: find members within radius, sorted by distance ascending
    const results = await this.redis.georadius(
      key,
      lng,
      lat,
      radiusKm,
      'km',
      'WITHCOORD',
      'WITHDIST',
      'ASC',
      'COUNT',
      limit * 3, // Fetch extra to account for filtering
    );

    if (!results || results.length === 0) {
      return [];
    }

    // Parse GEORADIUS results: [member, distance, [lng, lat]]
    const candidates: NearbyDriver[] = [];

    for (const result of results as any[]) {
      const providerId = result[0] as string;
      const distanceKm = parseFloat(result[1] as string);
      const [memberLng, memberLat] = result[2] as [string, string];

      // Skip excluded drivers
      if (excludeIds.includes(providerId)) continue;

      candidates.push({
        providerId,
        distanceKm,
        lat: parseFloat(memberLat),
        lng: parseFloat(memberLng),
      });

      if (candidates.length >= limit) break;
    }

    // Filter by capability and online status from DB
    if (candidates.length === 0) return [];

    const db = this.tenantDb.getConnection(tenantId);
    const providerIds = candidates.map((c) => c.providerId);

    // Verify providers are online and have the required capability
    const validProviders = await db
      .select({ id: schema.providers.id })
      .from(schema.providers)
      .where(
        and(
          eq(schema.providers.isOnline, true),
          // Check capability via SQL LIKE since it's a jsonb array
        ),
      );

    const validIds = new Set(
      validProviders
        .filter((p) => providerIds.includes(p.id))
        .map((p) => p.id),
    );

    // Further filter by heartbeat (Redis-based liveness check)
    const filtered: NearbyDriver[] = [];
    for (const candidate of candidates) {
      if (!validIds.has(candidate.providerId)) continue;

      const isAlive = await this.redis.exists(
        this.onlineKey(tenantId, candidate.providerId),
      );
      if (isAlive) {
        filtered.push(candidate);
      }
    }

    return filtered;
  }

  /**
   * Toggle a driver's online/offline status.
   * When going offline, removes them from the GEO set.
   */
  async setOnlineStatus(
    tenantId: string,
    providerId: string,
    online: boolean,
  ): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    await db
      .update(schema.providers)
      .set({ isOnline: online })
      .where(eq(schema.providers.id, providerId));

    if (!online) {
      // Remove from GEO set and delete heartbeat
      await this.redis.zrem(this.geoKey(tenantId), providerId);
      await this.redis.del(this.onlineKey(tenantId, providerId));
      this.logger.log(`Driver offline: ${providerId}`);
    } else {
      this.logger.log(`Driver online: ${providerId}`);
    }
  }

  /**
   * Remove a driver from the location GEO set (e.g., when they accept a job).
   */
  async removeFromPool(tenantId: string, providerId: string): Promise<void> {
    await this.redis.zrem(this.geoKey(tenantId), providerId);
  }

  /**
   * Get a driver's current position from Redis GEO.
   * Returns null if the driver is not in the GEO set.
   */
  async getDriverPosition(
    tenantId: string,
    providerId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const positions = await this.redis.geopos(
      this.geoKey(tenantId),
      providerId,
    );

    if (!positions || !positions[0]) return null;

    const [lng, lat] = positions[0] as [string, string];
    return { lat: parseFloat(lat), lng: parseFloat(lng) };
  }

  /**
   * Persist driver location to the providers table.
   * Non-critical — called fire-and-forget for performance.
   */
  private async persistLocation(
    tenantId: string,
    providerId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);

    await db
      .update(schema.providers)
      .set({
        lastLocationLat: String(lat),
        lastLocationLng: String(lng),
        lastLocationAt: new Date(),
      })
      .where(eq(schema.providers.id, providerId));
  }
}
