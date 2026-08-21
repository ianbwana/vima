import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import * as cpSchema from '../../../database/schemas/control-plane.schema';

interface AggregationJobData {
  /** If provided, aggregate only for this tenant. Otherwise all active tenants. */
  tenantId?: string;
  /** Date to aggregate (YYYY-MM-DD). Defaults to yesterday. */
  date?: string;
}

/**
 * AnalyticsAggregationProcessor
 *
 * Nightly BullMQ job that computes daily rollup metrics for each tenant
 * and writes them to the `analytics_daily` table.
 *
 * Metrics computed:
 * - orders_completed (per module)
 * - orders_placed (per module)
 * - orders_cancelled (per module)
 * - gmv (per module — sum of actual_fare for completed jobs)
 * - active_providers (total online at any point in the day)
 * - active_customers (unique customers with completed orders)
 * - avg_trip_duration (per module)
 * - completion_rate (per module)
 *
 * The metrics are stored with a `dimension` (e.g., 'module') and `dimension_value`
 * (e.g., 'rides', 'food') to support multi-dimensional queries.
 *
 * Schedule: runs at 02:00 UTC daily (configured via repeatable job).
 */
@Processor('analytics-aggregation', { concurrency: 3 })
export class AnalyticsAggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsAggregationProcessor.name);

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {
    super();
  }

  async process(job: Job<AggregationJobData>): Promise<void> {
    const { tenantId, date } = job.data;

    // Determine the date to aggregate
    const targetDate = date || this.getYesterday();
    this.logger.log(`Starting analytics aggregation for date=${targetDate}`);

    // Get tenants to process
    const tenantIds = tenantId ? [tenantId] : await this.getActiveTenants();

    let successCount = 0;
    let failureCount = 0;

    for (const tid of tenantIds) {
      try {
        await this.aggregateForTenant(tid, targetDate);
        successCount++;
      } catch (error) {
        failureCount++;
        this.logger.error(
          `Analytics aggregation failed for tenant=${tid} date=${targetDate}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Analytics aggregation complete: ${successCount} succeeded, ${failureCount} failed, date=${targetDate}`,
    );
  }

  /**
   * Compute and store all metrics for a single tenant for a given date.
   */
  private async aggregateForTenant(tenantId: string, date: string): Promise<void> {
    const db = this.tenantDb.getConnection(tenantId);
    const dateStart = new Date(`${date}T00:00:00.000Z`);
    const dateEnd = new Date(`${date}T23:59:59.999Z`);

    const metrics: Array<{ metric: string; dimension: string; dimensionValue: string; value: number }> = [];

    // --- Jobs/Trips metrics per module ---
    const jobModules = ['ride', 'delivery_leg', 'parcel'];

    for (const module of jobModules) {
      // Completed jobs
      const [completed] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.jobs)
        .where(and(
          eq(schema.jobs.type, module as any),
          eq(schema.jobs.status, 'completed'),
          gte(schema.jobs.completedAt, dateStart),
          lt(schema.jobs.completedAt, dateEnd),
        ));
      metrics.push({ metric: 'jobs_completed', dimension: 'module', dimensionValue: module, value: completed.count });

      // Cancelled jobs
      const [cancelled] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.jobs)
        .where(and(
          eq(schema.jobs.type, module as any),
          eq(schema.jobs.status, 'cancelled'),
          gte(schema.jobs.createdAt, dateStart),
          lt(schema.jobs.createdAt, dateEnd),
        ));
      metrics.push({ metric: 'jobs_cancelled', dimension: 'module', dimensionValue: module, value: cancelled.count });

      // GMV (sum of actual_fare for completed jobs)
      const [gmv] = await db
        .select({ total: sql<string>`COALESCE(SUM(${schema.jobs.actualFare}::numeric), 0)` })
        .from(schema.jobs)
        .where(and(
          eq(schema.jobs.type, module as any),
          eq(schema.jobs.status, 'completed'),
          gte(schema.jobs.completedAt, dateStart),
          lt(schema.jobs.completedAt, dateEnd),
        ));
      metrics.push({ metric: 'gmv', dimension: 'module', dimensionValue: module, value: parseFloat(gmv.total) });
    }

    // --- Order metrics (food + groceries) ---
    const [ordersDelivered] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.orders)
      .where(and(
        eq(schema.orders.status, 'delivered'),
        gte(schema.orders.deliveredAt, dateStart),
        lt(schema.orders.deliveredAt, dateEnd),
      ));
    metrics.push({ metric: 'orders_completed', dimension: 'total', dimensionValue: 'all', value: ordersDelivered.count });

    const [ordersGmv] = await db
      .select({ total: sql<string>`COALESCE(SUM(${schema.orders.total}::numeric), 0)` })
      .from(schema.orders)
      .where(and(
        eq(schema.orders.status, 'delivered'),
        gte(schema.orders.deliveredAt, dateStart),
        lt(schema.orders.deliveredAt, dateEnd),
      ));
    metrics.push({ metric: 'gmv', dimension: 'module', dimensionValue: 'orders', value: parseFloat(ordersGmv.total) });

    // --- Active providers (any who were online during the day) ---
    const [activeProviders] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.providers)
      .where(eq(schema.providers.isOnline, true));
    metrics.push({ metric: 'active_providers', dimension: 'total', dimensionValue: 'all', value: activeProviders.count });

    // --- Active customers (unique with completed jobs/orders on this day) ---
    const [activeCustomers] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${schema.jobs.customerId})::int` })
      .from(schema.jobs)
      .where(and(
        eq(schema.jobs.status, 'completed'),
        gte(schema.jobs.completedAt, dateStart),
        lt(schema.jobs.completedAt, dateEnd),
      ));
    metrics.push({ metric: 'active_customers', dimension: 'total', dimensionValue: 'all', value: activeCustomers.count });

    // --- Write metrics to analytics_daily (upsert via delete + insert) ---
    // Delete existing entries for this date to enable re-runs
    await db.delete(schema.analyticsDaily).where(eq(schema.analyticsDaily.date, date));

    // Insert all computed metrics
    const nonZeroMetrics = metrics.filter((m) => m.value > 0);
    if (nonZeroMetrics.length > 0) {
      await db.insert(schema.analyticsDaily).values(
        nonZeroMetrics.map((m) => ({
          date,
          metric: m.metric,
          dimension: m.dimension,
          dimensionValue: m.dimensionValue,
          value: String(m.value),
        })),
      );
    }

    this.logger.debug(`Aggregated ${nonZeroMetrics.length} metrics for tenant=${tenantId} date=${date}`);
  }

  /**
   * Get all active tenants from the control plane DB.
   */
  private async getActiveTenants(): Promise<string[]> {
    const db = this.controlPlaneDb.db;
    const tenants = await db
      .select({ id: cpSchema.tenants.id })
      .from(cpSchema.tenants)
      .where(eq(cpSchema.tenants.status, 'active'));
    return tenants.map((t) => t.id);
  }

  private getYesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
}
