/**
 * Skeleton loading state for metric cards.
 * Displays 4 pulsing placeholders matching MetricCard dimensions.
 */
export function MetricSkeleton() {
  return (
    <div className="rounded-card bg-background-surface border border-border p-5">
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-20 rounded bg-background-elevated" />
        <div className="h-8 w-28 rounded bg-background-elevated" />
        <div className="h-3 w-16 rounded bg-background-elevated" />
      </div>
    </div>
  );
}

/**
 * Grid of 4 metric skeletons matching the dashboard layout.
 */
export function MetricSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <MetricSkeleton key={i} />
      ))}
    </div>
  );
}
