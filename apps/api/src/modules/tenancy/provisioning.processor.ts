import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { TenancyService } from './tenancy.service';

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
    const dbName = `vima_tenant_${tenantId.replace(/-/g, '_')}`;

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
        await this.runMigrations(tenantPool);
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

  private async runMigrations(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
      // Run the tenant schema migrations
      // In production, this would use Drizzle migrations from a versioned template.
      // For now, we create the core tables directly.
      await client.query(`
        -- Enums
        DO $$ BEGIN
          CREATE TYPE user_status AS ENUM ('active', 'inactive', 'banned');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        DO $$ BEGIN
          CREATE TYPE auth_type AS ENUM ('otp', 'password');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        DO $$ BEGIN
          CREATE TYPE user_role AS ENUM ('customer', 'provider', 'merchant', 'owner', 'admin', 'ops', 'finance', 'support');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        DO $$ BEGIN
          CREATE TYPE ledger_direction AS ENUM ('debit', 'credit');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        DO $$ BEGIN
          CREATE TYPE ledger_account_type AS ENUM ('customer_wallet', 'provider_wallet', 'merchant_wallet', 'tenant_revenue', 'platform_fees', 'psp_clearing', 'cash_in_transit');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        DO $$ BEGIN
          CREATE TYPE job_status AS ENUM ('created', 'matching', 'offered', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled', 'expired');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        DO $$ BEGIN
          CREATE TYPE job_type AS ENUM ('ride', 'delivery_leg', 'parcel');
        EXCEPTION WHEN duplicate_object THEN null; END $$;

        -- Users
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          phone VARCHAR(50),
          email VARCHAR(255),
          name VARCHAR(255),
          avatar_url TEXT,
          status user_status NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Auth
        CREATE TABLE IF NOT EXISTS user_auth (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id),
          type auth_type NOT NULL,
          credential_hash TEXT NOT NULL,
          verified_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Sessions
        CREATE TABLE IF NOT EXISTS user_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id),
          device_id VARCHAR(255),
          refresh_token_hash TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          last_active_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Roles
        CREATE TABLE IF NOT EXISTS user_roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id),
          role user_role NOT NULL,
          granted_by UUID,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- OTP
        CREATE TABLE IF NOT EXISTS otp_attempts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          phone VARCHAR(50) NOT NULL,
          otp_hash TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          verified BOOLEAN NOT NULL DEFAULT false,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Providers
        CREATE TABLE IF NOT EXISTS providers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id),
          is_online BOOLEAN NOT NULL DEFAULT false,
          last_location_lat DECIMAL(10, 7),
          last_location_lng DECIMAL(10, 7),
          last_location_at TIMESTAMP,
          capabilities JSONB DEFAULT '[]',
          rating DECIMAL(3, 2) DEFAULT 5.00,
          total_jobs INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Vehicles
        CREATE TABLE IF NOT EXISTS vehicles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider_id UUID NOT NULL REFERENCES providers(id),
          vehicle_class_id UUID,
          make VARCHAR(100),
          model VARCHAR(100),
          year INTEGER,
          plate VARCHAR(20) NOT NULL,
          color VARCHAR(50),
          verified BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Documents
        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id),
          type VARCHAR(100) NOT NULL,
          file_url TEXT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          reviewed_by UUID,
          reviewed_at TIMESTAMP,
          expires_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Ledger
        CREATE TABLE IF NOT EXISTS ledger_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id),
          type ledger_account_type NOT NULL,
          currency VARCHAR(3) NOT NULL DEFAULT 'USD',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ledger_transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(100) NOT NULL,
          reference_id UUID,
          description TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ledger_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
          account_id UUID NOT NULL REFERENCES ledger_accounts(id),
          amount DECIMAL(15, 2) NOT NULL,
          direction ledger_direction NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Zones
        CREATE TABLE IF NOT EXISTS zones (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          boundary JSONB NOT NULL,
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Jobs
        CREATE TABLE IF NOT EXISTS jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type job_type NOT NULL,
          status job_status NOT NULL DEFAULT 'created',
          customer_id UUID REFERENCES users(id),
          provider_id UUID REFERENCES providers(id),
          zone_id UUID REFERENCES zones(id),
          pickup_lat DECIMAL(10, 7),
          pickup_lng DECIMAL(10, 7),
          pickup_address TEXT,
          dropoff_lat DECIMAL(10, 7),
          dropoff_lng DECIMAL(10, 7),
          dropoff_address TEXT,
          estimated_fare DECIMAL(10, 2),
          actual_fare DECIMAL(10, 2),
          currency VARCHAR(3) DEFAULT 'USD',
          metadata JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          accepted_at TIMESTAMP,
          completed_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS job_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id UUID NOT NULL REFERENCES jobs(id),
          status job_status NOT NULL,
          actor_id UUID,
          metadata JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Ratings
        CREATE TABLE IF NOT EXISTS ratings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id UUID NOT NULL REFERENCES jobs(id),
          from_user_id UUID NOT NULL REFERENCES users(id),
          to_user_id UUID NOT NULL REFERENCES users(id),
          score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
          comment TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_user_auth_user_id ON user_auth(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_providers_user_id ON providers(user_id);
        CREATE INDEX IF NOT EXISTS idx_providers_online ON providers(is_online) WHERE is_online = true;
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
        CREATE INDEX IF NOT EXISTS idx_jobs_provider ON jobs(provider_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
      `);
    } finally {
      client.release();
    }
  }
}
