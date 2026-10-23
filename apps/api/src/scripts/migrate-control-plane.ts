import * as path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/**
 * Apply control-plane migrations from drizzle/control-plane.
 *
 * Usage (from apps/api, after `npm run build`):
 *   CONTROL_PLANE_DATABASE_URL=... npm run db:migrate
 *
 * Uses drizzle-orm's runtime migrator rather than drizzle-kit, so it works in
 * the production image where dev dependencies are not installed. Applied
 * migrations are tracked in drizzle.__drizzle_migrations.
 */

// dist/scripts -> apps/api/drizzle/control-plane
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle/control-plane');

async function main() {
  const databaseUrl = process.env.CONTROL_PLANE_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('CONTROL_PLANE_DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('Control-plane migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Failed to apply control-plane migrations: ${err.message}`);
  process.exit(1);
});
