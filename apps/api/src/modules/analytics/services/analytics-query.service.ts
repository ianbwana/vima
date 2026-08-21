import { Injectable, Logger } from '@nestjs/common';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';

/**
 * Metric time series data point.
 */
export interface MetricDataPoint {
  date: string;
  value: number;
}

/**
 * Dimensional breakdown for a metric.
 */
export interface MetricBreakdown {
  dimensionValue: string;
  value: number;
}

/**
 * AnalyticsQueryService
 *
 * Reads pre-computed daily rollups from `analytics_daily` for fast
 * dashboard queries. All queries are scoped to a single tenant's DB.
 *
 * Provides:
 * - Time series for a metric over a date range
 * - Breakdown by dimension (module, payment_method, zone)
 * - Aggregated totals over a period
 * - Comparison with prior period for growth calculation
 */
@Injectable()
export class AnalyticsQueryService {
  private readonly logger = new Logger(AnalyticsQueryService.name);

  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Get a time series for a metric over a date range.
   * Returns daily values sorted by date ascending.
   */
  async getTimeSeries(
    tenantId: string,
    metric: string,
    startDate: string,
    endDate: string,
    dimension?: string,
    dimensionValue?: string,
  ): Promise<MetricDataPoint[]> {
    const db = this.tenantDb.getConnection(tenantId);

    let conditions = and(
      eq(schema.analyticsDaily.metric, metric),
      gte(schema.analyticsDaily.date, startDate),
      lte(schema.analyticsDaily.date, endDate),
    );

    if (dimension && dimensionValue) {
      conditions = and(
        conditions,
        eq(schema.analyticsDaily.dimension, dimension),
        eq(schema.analyticsDaily.dimensionValue, dimensionValue),
      );
    }

    const results = await db
      .select({
        date: schema.analyticsDaily.date,
        value: schema.analyticsDaily.value,
      })
      .from(schema.analyticsDaily)
      .where(conditions!)
      .orderBy(schema.analyticsDaily.date);

    return results.map((r) => ({ date: r.date, value: parseFloat(r.value) }));
  }

  /**
   * Get a breakdown of a metric by dimension for a date range.
   * Aggregates values across the date range per dimension_value.
   */
  async getBreakdown(
    tenantId: string,
    metric: string,
    dimension: string,
    startDate: string,
    endDate: string,
  ): Promise<MetricBreakdown[]> {
    const db = this.tenantDb.getConnection(tenantId);

    const results = await db
      .select({
        dimensionValue: schema.analyticsDaily.dimensionValue,
        total: sql<string>`SUM(${schema.analyticsDaily.value}::numeric)`,
      })
      .from(schema.analyticsDaily)
      .where(and(
        eq(schema.analyticsDaily.metric, metric),
        eq(schema.analyticsDaily.dimension, dimension),
        gte(schema.analyticsDaily.date, startDate),
        lte(schema.analyticsDaily.date, endDate),
      ))
      .groupBy(schema.analyticsDaily.dimensionValue)
      .orderBy(sql`SUM(${schema.analyticsDaily.value}::numeric) DESC`);

    return results.map((r) => ({
      dimensionValue: r.dimensionValue,
      value: parseFloat(r.total),
    }));
  }

  /**
   * Get total value for a metric over a date range.
   */
  async getTotal(
    tenantId: string,
    metric: string,
    startDate: string,
    endDate: string,
    dimension?: string,
    dimensionValue?: string,
  ): Promise<number> {
    const db = this.tenantDb.getConnection(tenantId);

    let conditions = and(
      eq(schema.analyticsDaily.metric, metric),
      gte(schema.analyticsDaily.date, startDate),
      lte(schema.analyticsDaily.date, endDate),
    );

    if (dimension && dimensionValue) {
      conditions = and(
        conditions,
        eq(schema.analyticsDaily.dimension, dimension),
        eq(schema.analyticsDaily.dimensionValue, dimensionValue),
      );
    }

    const [result] = await db
      .select({ total: sql<string>`COALESCE(SUM(${schema.analyticsDaily.value}::numeric), 0)` })
      .from(schema.analyticsDaily)
      .where(conditions!);

    return parseFloat(result.total);
  }

  /**
   * Get total with growth comparison to prior period.
   * Useful for dashboard cards showing "GMV +12.5%".
   */
  async getTotalWithGrowth(
    tenantId: string,
    metric: string,
    days: number = 30,
    dimension?: string,
    dimensionValue?: string,
  ): Promise<{ value: number; growth: number }> {
    const now = new Date();
    const currentEnd = now.toISOString().split('T')[0];
    const currentStart = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0];
    const priorEnd = currentStart;
    const priorStart = new Date(now.getTime() - days * 2 * 86400000).toISOString().split('T')[0];

    const [current, prior] = await Promise.all([
      this.getTotal(tenantId, metric, currentStart, currentEnd, dimension, dimensionValue),
      this.getTotal(tenantId, metric, priorStart, priorEnd, dimension, dimensionValue),
    ]);

    const growth = prior === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - prior) / prior) * 10000) / 100;

    return { value: current, growth };
  }

  /**
   * Get all available metrics and their latest dates.
   * Useful for understanding what data is available.
   */
  async getAvailableMetrics(tenantId: string): Promise<Array<{ metric: string; latestDate: string }>> {
    const db = this.tenantDb.getConnection(tenantId);

    const results = await db
      .select({
        metric: schema.analyticsDaily.metric,
        latestDate: sql<string>`MAX(${schema.analyticsDaily.date})`,
      })
      .from(schema.analyticsDaily)
      .groupBy(schema.analyticsDaily.metric);

    return results.map((r) => ({ metric: r.metric, latestDate: r.latestDate }));
  }
}
