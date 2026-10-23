import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { TenancyService } from './tenancy.service';
import { tenantDbName, runTenantMigrations } from './tenant-provisioning.util';

interface ProvisionJobData {
  tenantId: string;
}

/**
 * BullMQ processor that creates a new Postgres database for a tenant
 * from a versioned template and runs initial migrations.
 */
@Processor('provisioning')
export class ProvisioningProcessor extends WorkerHost {
  private readonly logger = new Logger(ProvisioningProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tenancyService: TenancyService,
  ) {
    super();
  }

  async process(job: Job<ProvisionJobData>) {
    const { tenantId } = job.data;
    const dbName = tenantDbName(tenantId);

    this.logger.log(`Provisioning database "${dbName}" for tenant ${tenantId}`);

    const adminPool = new Pool({
      connectionString: this.config.getOrThrow<string>('CONTROL_PLANE_DATABASE_URL'),
    });

    try {
      // Create the tenant database
      const client = await adminPool.connect();
      try {
        // Check if database already exists
        const result = await client.query(
          `SELECT 1 FROM pg_database WHERE datname = $1`,
          [dbName],
        );

        if (result.rows.length === 0) {
          // CREATE DATABASE cannot run inside a transaction
          await client.query(`CREATE DATABASE "${dbName}"`);
          this.logger.log(`Database "${dbName}" created`);
        } else {
          this.logger.log(`Database "${dbName}" already exists, skipping creation`);
        }
      } finally {
        client.release();
      }

      // Connect to the new tenant database and run migrations
      const tenantPool = new Pool({
        connectionString: this.buildTenantConnectionString(dbName),
      });

      try {
        await runTenantMigrations(tenantPool);
        this.logger.log(`Migrations completed for "${dbName}"`);
      } finally {
        await tenantPool.end();
      }

      // Mark tenant as provisioned
      await this.tenancyService.markProvisioned(tenantId, dbName);
      this.logger.log(`Tenant ${tenantId} provisioned successfully`);
    } catch (error) {
      this.logger.error(`Failed to provision tenant ${tenantId}`, error);
      throw error;
    } finally {
      await adminPool.end();
    }
  }

  private buildTenantConnectionString(dbName: string): string {
    const baseUrl = this.config.getOrThrow<string>('TENANT_DATABASE_BASE_URL');
    const url = new URL(baseUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  }
}
