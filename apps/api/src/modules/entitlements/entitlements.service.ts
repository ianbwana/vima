import { Injectable, ForbiddenException } from '@nestjs/common';
import { ControlPlaneDbService } from '../../database/control-plane-db.service';
import * as schema from '../../database/schemas/control-plane.schema';
import { eq } from 'drizzle-orm';

export interface TenantEntitlements {
  rides: boolean;
  food: boolean;
  groceries: boolean;
  courier: boolean;
  home_services: boolean;
  tier: string;
}

/**
 * Manages module entitlements per tenant.
 * In production, results would be cached in Redis with short TTL.
 * For MVP, we query the control plane directly.
 */
@Injectable()
export class EntitlementsService {
  // In-memory cache for MVP (replace with Redis in production)
  private cache = new Map<string, { data: TenantEntitlements; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(private readonly controlPlaneDb: ControlPlaneDbService) {}

  async getEntitlements(tenantId: string): Promise<TenantEntitlements> {
    // Check cache
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Fetch from control plane
    const db = this.controlPlaneDb.db;
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    const modules = (tenant.enabledModules as string[]) || [];
    const entitlements: TenantEntitlements = {
      rides: modules.includes('rides'),
      food: modules.includes('food'),
      groceries: modules.includes('groceries'),
      courier: modules.includes('courier'),
      home_services: modules.includes('home_services'),
      tier: tenant.tier,
    };

    // Cache
    this.cache.set(tenantId, {
      data: entitlements,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return entitlements;
  }

  async checkModuleAccess(tenantId: string, module: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(tenantId);
    return (entitlements as any)[module] === true;
  }

  async requireModuleAccess(tenantId: string, module: string): Promise<void> {
    const hasAccess = await this.checkModuleAccess(tenantId, module);
    if (!hasAccess) {
      throw new ForbiddenException(
        `Module "${module}" is not enabled for this tenant. Please upgrade your subscription.`,
      );
    }
  }

  invalidateCache(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
