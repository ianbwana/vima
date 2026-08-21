import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../database/control-plane-db.service';
import * as schema from '../../database/schemas/control-plane.schema';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenancyService {
  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    @InjectQueue('provisioning') private readonly provisioningQueue: Queue,
  ) {}

  async createTenant(dto: CreateTenantDto) {
    const db = this.controlPlaneDb.db;

    // Check slug uniqueness
    const existing = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, dto.slug))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(`Tenant slug "${dto.slug}" is already taken`);
    }

    // Insert tenant with 14-day trial
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        name: dto.name,
        slug: dto.slug,
        status: 'pending_verification',
        tier: dto.tier || 'starter',
        enabledModules: dto.enabledModules || [],
        trialEndsAt,
      })
      .returning();

    // Create default subdomain
    await db.insert(schema.tenantDomains).values({
      tenantId: tenant.id,
      domain: `${dto.slug}.vima.app`,
      type: 'subdomain',
      verified: true,
      sslStatus: 'active',
    });

    return tenant;
  }

  async provisionTenant(tenantId: string) {
    const db = this.controlPlaneDb.db;

    // Update status to provisioning
    await db
      .update(schema.tenants)
      .set({ status: 'provisioning', updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId));

    // Queue the provisioning job
    await this.provisioningQueue.add('provision-tenant-db', {
      tenantId,
    });

    return { status: 'provisioning', tenantId };
  }

  async markProvisioned(tenantId: string, databaseName: string) {
    const db = this.controlPlaneDb.db;

    await db
      .update(schema.tenants)
      .set({
        status: 'active',
        databaseName,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenantId));
  }

  async findById(id: string) {
    const db = this.controlPlaneDb.db;
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, id))
      .limit(1);
    return tenant || null;
  }

  async findBySlug(slug: string) {
    const db = this.controlPlaneDb.db;
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);
    return tenant || null;
  }

  async findByDomain(domain: string) {
    const db = this.controlPlaneDb.db;
    const [domainRecord] = await db
      .select()
      .from(schema.tenantDomains)
      .where(eq(schema.tenantDomains.domain, domain))
      .limit(1);

    if (!domainRecord || !domainRecord.verified) return null;

    return this.findById(domainRecord.tenantId);
  }

  async listTenants() {
    const db = this.controlPlaneDb.db;
    return db.select().from(schema.tenants);
  }

  async updateEnabledModules(tenantId: string, modules: string[]) {
    const db = this.controlPlaneDb.db;

    await db
      .update(schema.tenants)
      .set({ enabledModules: modules, updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId));
  }
}
