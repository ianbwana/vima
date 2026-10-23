import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as schema from '../database/schemas/control-plane.schema';

/**
 * Seed (or reset) a platform admin in the control-plane database.
 *
 * Usage (from apps/api, after `npm run build`):
 *   PLATFORM_ADMIN_EMAIL=admin@vima.app PLATFORM_ADMIN_PASSWORD=... \
 *     npm run seed:platform-admin
 *
 * Idempotent: re-running with an existing email resets its password and
 * reactivates the account.
 */

// Must match PlatformAdminAuthService.BCRYPT_ROUNDS
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const databaseUrl = process.env.CONTROL_PLANE_DATABASE_URL;
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!databaseUrl || !email || !password) {
    throw new Error(
      'CONTROL_PLANE_DATABASE_URL, PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required',
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`PLATFORM_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [admin] = await db
      .insert(schema.platformAdmins)
      .values({ email, passwordHash, status: 'active' })
      .onConflictDoUpdate({
        target: schema.platformAdmins.email,
        set: { passwordHash, status: 'active' },
      })
      .returning({ id: schema.platformAdmins.id, email: schema.platformAdmins.email });

    console.log(`Platform admin ready: ${admin.email} (${admin.id})`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Failed to seed platform admin: ${err.message}`);
  process.exit(1);
});
