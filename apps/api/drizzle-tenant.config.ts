import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/database/schemas/tenant.schema.ts',
  out: './drizzle/tenant-generated',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgresql://vima:vimadev@localhost:5432/vima_tenant_6c210504-c56b-467c-8cdc-e7b9d8961100',
  },
});
