import { Controller, Get, Query, Req } from '@nestjs/common';
import { AnalyticsQueryService } from './services/analytics-query.service';

/**
 * AnalyticsController
 *
 * REST API for querying pre-computed analytics rollups.
 * All queries are tenant-isolated (scoped to the authenticated tenant's DB).
 *
 * Endpoints:
 * - GET /analytics/time-series?metric=gmv&start=2026-07-01&end=2026-07-31
 * - GET /analytics/breakdown?metric=gmv&dimension=module&start=...&end=...
 * - GET /analytics/summary?metric=jobs_completed&days=30
 * - GET /analytics/available — list what metrics exist
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly queryService: AnalyticsQueryService) {}

  @Get('time-series')
  async getTimeSeries(
    @Req() req: any,
    @Query('metric') metric: string,
    @Query('start') startDate: string,
    @Query('end') endDate: string,
    @Query('dimension') dimension?: string,
    @Query('dimensionValue') dimensionValue?: string,
  ) {
    const { tenantId } = req.user;
    const data = await this.queryService.getTimeSeries(
      tenantId, metric, startDate, endDate, dimension, dimensionValue,
    );
    return { data };
  }

  @Get('breakdown')
  async getBreakdown(
    @Req() req: any,
    @Query('metric') metric: string,
    @Query('dimension') dimension: string,
    @Query('start') startDate: string,
    @Query('end') endDate: string,
  ) {
    const { tenantId } = req.user;
    const data = await this.queryService.getBreakdown(tenantId, metric, dimension, startDate, endDate);
    return { data };
  }

  @Get('summary')
  async getSummary(
    @Req() req: any,
    @Query('metric') metric: string,
    @Query('days') days?: string,
    @Query('dimension') dimension?: string,
    @Query('dimensionValue') dimensionValue?: string,
  ) {
    const { tenantId } = req.user;
    const result = await this.queryService.getTotalWithGrowth(
      tenantId, metric, days ? parseInt(days) : 30, dimension, dimensionValue,
    );
    return result;
  }

  @Get('available')
  async getAvailableMetrics(@Req() req: any) {
    const { tenantId } = req.user;
    const metrics = await this.queryService.getAvailableMetrics(tenantId);
    return { metrics };
  }
}
