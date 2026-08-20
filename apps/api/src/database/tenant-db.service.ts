import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as tenantSchema from './schemas/tenant.schema';

/**
 * Manages connections to tenant databases.
 * Each tenant has its own Postgres database.
 * Connections are pooled and cached per tenant.
 */
@Injectable()
export class TenantDbService implements OnModuleDestroy {
  private pools = new Map<string, Pool>();
  private connections = new Map<string, NodePgDatabase<typeof tenantSchema>>();

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy() {
    const closePromises = Array.from(this.pools.values()).map((pool) => pool.end());
    await Promise.all(closePromises);
  }

  /**
   * Get a Drizzle instance for a specific tenant database.
   * Creates the connection pool on first access, then caches it.
   */
  getConnection(tenantId: string): NodePgDatabase<typeof tenantSchema> {
    const cached = this.connections.get(tenantId);
    if (cached) return cached;

    const pool = this.createPool(tenantId);
    this.pools.set(tenantId, pool);

    const db = drizzle(pool, { schema: tenantSchema });
    this.connections.set(tenantId, db);

    return db;
  }

  private createPool(tenantId: string): Pool {
    const baseUrl = this.config.getOrThrow<string>('TENANT_DATABASE_BASE_URL');
    // Convention: tenant DB name is `vima_tenant_{tenantId}`
    const dbName = `vima_tenant_${tenantId}`;
    const url = new URL(baseUrl);
    url.pathname = `/${dbName}`;

    return new Pool({
      connectionString: url.toString(),
      max: 10, // per-tenant pool cap
      idleTimeoutMillis: 30000,
    });
  }

  /**
   * Remove a cached connection (e.g., on tenant offboarding).
   */
  async removeConnection(tenantId: string) {
    const pool = this.pools.get(tenantId);
    if (pool) {
      await pool.end();
      this.pools.delete(tenantId);
      this.connections.delete(tenantId);
    }
  }
}
