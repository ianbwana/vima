import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { and, ilike, or, sql, desc } from 'drizzle-orm';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { TenantId } from '../tenancy/decorators/tenant.decorator';
import { TenantDbService } from '../../database/tenant-db.service';
import * as schema from '../../database/schemas/tenant.schema';

/**
 * ProvidersController
 *
 * Tenant admin endpoint for listing service providers (drivers, couriers,
 * delivery agents). Joins the tenant `providers` table with `users` for
 * display fields and returns a paginated, searchable list.
 */
@Controller('providers')
@UseGuards(JwtAuthGuard)
export class ProvidersController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('search') search?: string,
  ) {
    const db = this.tenantDb.getConnection(tenantId);

    const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitRaw ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    const searchTerm = search?.trim();
    const whereClause = searchTerm
      ? or(
          ilike(schema.users.name, `%${searchTerm}%`),
          ilike(schema.users.phone, `%${searchTerm}%`),
        )
      : undefined;

    const rows = await db
      .select({
        id: schema.providers.id,
        name: schema.users.name,
        phone: schema.users.phone,
        isOnline: schema.providers.isOnline,
        rating: schema.providers.rating,
        totalJobs: schema.providers.totalJobs,
        capabilities: schema.providers.capabilities,
      })
      .from(schema.providers)
      .innerJoin(schema.users, sql`${schema.providers.userId} = ${schema.users.id}`)
      .where(whereClause)
      .orderBy(desc(schema.providers.totalJobs))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.providers)
      .innerJoin(schema.users, sql`${schema.providers.userId} = ${schema.users.id}`)
      .where(whereClause);

    const providers = rows.map((r) => ({
      id: r.id,
      name: r.name ?? 'Unnamed provider',
      phone: r.phone ?? '',
      status: r.isOnline ? 'online' : 'offline',
      rating: r.rating ? Number(r.rating) : 0,
      completedJobs: r.totalJobs ?? 0,
      capabilities: Array.isArray(r.capabilities) ? r.capabilities : [],
    }));

    return { providers, total: count ?? 0, page, limit };
  }
}
