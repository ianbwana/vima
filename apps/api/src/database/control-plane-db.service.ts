import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as controlPlaneSchema from './schemas/control-plane.schema';

@Injectable()
export class ControlPlaneDbService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private _db: NodePgDatabase<typeof controlPlaneSchema>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.getOrThrow<string>('CONTROL_PLANE_DATABASE_URL'),
      max: 20,
      idleTimeoutMillis: 30000,
    });

    this._db = drizzle(this.pool, { schema: controlPlaneSchema });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  get db() {
    return this._db;
  }
}
