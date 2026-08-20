export class MetricWithGrowthDto {
  value: number;
  growth: number; // percentage change from prior period
}

export class MetricsResponseDto {
  gmv: MetricWithGrowthDto;
  completedJobs: MetricWithGrowthDto;
  activeProviders: number;
  completionRate: number; // percentage (0-100)
}
