import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsEventCollector } from './services/analytics-event-collector.service';
import { AnalyticsAggregationProcessor } from './services/analytics-aggregation.processor';

/**
 * AnalyticsModule
 *
 * Full analytics pipeline:
 * 1. AnalyticsEventCollector — listens for domain events, writes to Redis Streams
 * 2. AnalyticsAggregationProcessor — nightly BullMQ job computes daily rollups
 * 3. AnalyticsQueryService — reads rollups for fast dashboard queries
 * 4. AnalyticsController — REST API for frontend consumption
 *
 * The aggregation job runs daily at 02:00 UTC via a BullMQ repeatable schedule.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'analytics-aggregation',
    }),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsQueryService,
    AnalyticsEventCollector,
    AnalyticsAggregationProcessor,
  ],
  exports: [AnalyticsQueryService],
})
export class AnalyticsModule implements OnModuleInit {
  constructor(
    @InjectQueue('analytics-aggregation') private readonly aggregationQueue: Queue,
  ) {}

  /**
   * On module init, register the nightly aggregation job as a repeatable.
   * Runs at 02:00 UTC daily.
   */
  async onModuleInit() {
    // Remove any existing repeatable jobs to prevent duplicates on restart
    const existing = await this.aggregationQueue.getRepeatableJobs();
    for (const job of existing) {
      await this.aggregationQueue.removeRepeatableByKey(job.key);
    }

    // Schedule nightly aggregation at 02:00 UTC
    await this.aggregationQueue.add(
      'nightly-aggregation',
      {}, // No specific tenant — aggregates all
      {
        repeat: {
          pattern: '0 2 * * *', // Cron: 02:00 UTC daily
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
  }
}
