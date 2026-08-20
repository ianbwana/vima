import { Injectable } from '@nestjs/common';
import { sql, eq, and, gte, lt, ne } from 'drizzle-orm';
import { TenantDbService } from '@/database/tenant-db.service';
import * as schema from '@/database/schemas/tenant.schema';
import { MetricsResponseDto } from './dto/metrics-response.dto';
import { JobsByModuleResponseDto } from './dto/jobs-by-module-response.dto';

@Injectable()
export class MetricsService {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Computes dashboard metrics for the authenticated tenant.
   * All queries are scoped to the tenant's database.
   */
  async getMetrics(tenantId: string): Promise<MetricsResponseDto> {
    const db = this.tenantDb.getConnection(tenantId);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Execute all queries in parallel for performance
    const [gmvCurrent, gmvPrior, jobsCurrent, jobsPrior, activeProviders, completionStats] =
      await Promise.all([
        // GMV current 30 days
        this.getGmv(db, thirtyDaysAgo, now),
        // GMV prior 30 days
        this.getGmv(db, sixtyDaysAgo, thirtyDaysAgo),
        // Completed jobs current 30 days
        this.getCompletedJobs(db, thirtyDaysAgo, now),
        // Completed jobs prior 30 days
        this.getCompletedJobs(db, sixtyDaysAgo, thirtyDaysAgo),
        // Active providers (currently online)
        this.getActiveProviders(db),
        // Completion rate for current 30 days
        this.getCompletionStats(db, thirtyDaysAgo, now),
      ]);

    return {
      gmv: {
        value: gmvCurrent,
        growth: this.computeGrowth(gmvCurrent, gmvPrior),
      },
      completedJobs: {
        value: jobsCurrent,
        growth: this.computeGrowth(jobsCurrent, jobsPrior),
      },
      activeProviders,
      completionRate: completionStats.total > 0
        ? Math.round((completionStats.completed / completionStats.total) * 10000) / 100
        : 0,
    };
  }

  /**
   * Returns daily job counts grouped by module type for the last 7 days.
   * All queries are scoped to the tenant's database.
   */
  async getJobsByModule(tenantId: string): Promise<JobsByModuleResponseDto> {
    const db = this.tenantDb.getConnection(tenantId);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const results = await db
      .select({
        date: sql<string>`DATE(${schema.jobs.createdAt})::text`,
        module: schema.jobs.type,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.jobs)
      .where(gte(schema.jobs.createdAt, sevenDaysAgo))
      .groupBy(sql`DATE(${schema.jobs.createdAt})`, schema.jobs.type)
      .orderBy(sql`DATE(${schema.jobs.createdAt})`);

    return {
      data: results.map((row) => ({
        date: row.date,
        module: row.module,
        count: row.count,
      })),
    };
  }

  /**
   * SUM(actual_fare) FROM jobs WHERE status='completed' AND completed_at within the window.
   */
  private async getGmv(
    db: ReturnType<TenantDbService['getConnection']>,
    from: Date,
    to: Date,
  ): Promise<number> {
    const [result] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.jobs.actualFare}::numeric), 0)`,
      })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, 'completed'),
          gte(schema.jobs.completedAt, from),
          lt(schema.jobs.completedAt, to),
        ),
      );

    return parseFloat(result.total);
  }

  /**
   * COUNT(*) FROM jobs WHERE status='completed' AND completed_at within the window.
   */
  private async getCompletedJobs(
    db: ReturnType<TenantDbService['getConnection']>,
    from: Date,
    to: Date,
  ): Promise<number> {
    const [result] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, 'completed'),
          gte(schema.jobs.completedAt, from),
          lt(schema.jobs.completedAt, to),
        ),
      );

    return result.count;
  }

  /**
   * COUNT(*) FROM providers WHERE is_online = true.
   */
  private async getActiveProviders(
    db: ReturnType<TenantDbService['getConnection']>,
  ): Promise<number> {
    const [result] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.providers)
      .where(eq(schema.providers.isOnline, true));

    return result.count;
  }

  /**
   * Get completed and total non-expired jobs for completion rate calculation.
   * Completion rate = completed / (total - expired) for the 30d window.
   */
  private async getCompletionStats(
    db: ReturnType<TenantDbService['getConnection']>,
    from: Date,
    to: Date,
  ): Promise<{ completed: number; total: number }> {
    const [result] = await db
      .select({
        completed: sql<number>`COUNT(*) FILTER (WHERE ${schema.jobs.status} = 'completed')::int`,
        total: sql<number>`COUNT(*) FILTER (WHERE ${schema.jobs.status} != 'expired')::int`,
      })
      .from(schema.jobs)
      .where(
        and(
          gte(schema.jobs.createdAt, from),
          lt(schema.jobs.createdAt, to),
          ne(schema.jobs.status, 'expired'),
        ),
      );

    return {
      completed: result.completed,
      total: result.total,
    };
  }

  /**
   * Computes percentage growth between current and prior period values.
   * Returns 0 if the prior period value is 0.
   */
  private computeGrowth(current: number, prior: number): number {
    if (prior === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - prior) / prior) * 10000) / 100;
  }
}
