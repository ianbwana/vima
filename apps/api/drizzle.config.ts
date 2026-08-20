import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schemas/control-plane.schema.ts',
  out: './drizzle/control-plane',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CONTROL_PLANE_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vima_control_plane',
  },
});
