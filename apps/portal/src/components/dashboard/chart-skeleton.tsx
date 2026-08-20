/**
 * Skeleton loading state for the jobs-by-module bar chart.
 * Displays pulsing bars matching the chart area dimensions.
 */
export function ChartSkeleton() {
  return (
    <div className="rounded-card bg-background-surface border border-border p-5">
      <div className="animate-pulse space-y-4">
        {/* Chart title placeholder */}
        <div className="h-4 w-40 rounded bg-background-elevated" />

        {/* Bar chart placeholder */}
        <div className="flex items-end gap-3 h-48 pt-4">
          <div className="flex-1 h-[60%] rounded bg-background-elevated" />
          <div className="flex-1 h-[80%] rounded bg-background-elevated" />
          <div className="flex-1 h-[45%] rounded bg-background-elevated" />
          <div className="flex-1 h-[90%] rounded bg-background-elevated" />
          <div className="flex-1 h-[55%] rounded bg-background-elevated" />
          <div className="flex-1 h-[70%] rounded bg-background-elevated" />
          <div className="flex-1 h-[40%] rounded bg-background-elevated" />
        </div>

        {/* X-axis label placeholders */}
        <div className="flex gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 h-3 rounded bg-background-elevated" />
          ))}
        </div>
      </div>
    </div>
  );
}
