import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../database/control-plane-db.service';
import * as schema from '../../database/schemas/control-plane.schema';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { tenantDbName, runTenantMigrations } from './tenant-provisioning.util';

@Injectable()
export class TenancyService {
  private readonly logger = new Logger(TenancyService.name);

  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly config: ConfigService,
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

    // Provision the tenant database synchronously so the caller can immediately
    // register the admin user. Without this the self-service signup flow would
    // fail at POST /auth/register (no tenant DB / tables exist yet).
    await this.provisionDatabase(tenant.id);

    return tenant;
  }

  /**
   * Create the tenant's dedicated Postgres database (if missing) and run the
   * tenant schema migrations. Idempotent. Marks the tenant active on success.
   */
  async provisionDatabase(tenantId: string): Promise<string> {
    const dbName = tenantDbName(tenantId);
    const adminPool = new Pool({
      connectionString: this.config.getOrThrow<string>('CONTROL_PLANE_DATABASE_URL'),
    });

    try {
      const client = await adminPool.connect();
      try {
        const result = await client.query(
          `SELECT 1 FROM pg_database WHERE datname = $1`,
          [dbName],
        );
        if (result.rows.length === 0) {
          await client.query(`CREATE DATABASE "${dbName}"`);
          this.logger.log(`Database "${dbName}" created`);
        }
      } finally {
        client.release();
      }

      const baseUrl = this.config.getOrThrow<string>('TENANT_DATABASE_BASE_URL');
      const url = new URL(baseUrl);
      url.pathname = `/${dbName}`;
      const tenantPool = new Pool({ connectionString: url.toString() });
      try {
        await runTenantMigrations(tenantPool);
      } finally {
        await tenantPool.end();
      }

      await this.markProvisioned(tenantId, dbName);
      this.logger.log(`Tenant ${tenantId} provisioned (${dbName})`);
      return dbName;
    } finally {
      await adminPool.end();
    }
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
