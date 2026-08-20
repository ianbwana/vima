'use client';

import { useMetrics } from '../../../hooks/use-metrics';
import { MetricSkeletonGrid } from '../../../components/dashboard/metric-skeleton';
import { ChartSkeleton } from '../../../components/dashboard/chart-skeleton';
import { ErrorState } from '../../../components/dashboard/error-state';

export default function OverviewPage() {
  const { data, isLoading, error, refetch } = useMetrics();

  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">Overview</h1>
      <p className="mt-2 text-text-secondary">Key business metrics at a glance.</p>

      <div className="mt-6 space-y-6">
        {isLoading && (
          <>
            <MetricSkeletonGrid />
            <ChartSkeleton />
          </>
        )}

        {error && !isLoading && (
          <ErrorState message={error} onRetry={refetch} />
        )}

        {data && !isLoading && !error && (
          <p className="text-text-secondary">Dashboard metrics loaded.</p>
        )}
      </div>
    </div>
  );
}
