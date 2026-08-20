'use client';

interface MetricCardProps {
  label: string;
  value: string | number;
  growth?: number;
  prefix?: string;
  suffix?: string;
}

export function MetricCard({ label, value, growth, prefix, suffix }: MetricCardProps) {
  const isPositive = growth !== undefined && growth > 0;
  const isNegative = growth !== undefined && growth < 0;

  return (
    <div className="rounded-card border border-border bg-background-surface p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-2 text-2xl font-metric text-text-primary">
        {prefix}
        {value}
        {suffix}
      </p>
      {growth !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          {isPositive && (
            <svg
              className="h-4 w-4 text-success"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          )}
          {isNegative && (
            <svg
              className="h-4 w-4 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
            </svg>
          )}
          <span
            className={`text-sm ${
              isPositive ? 'text-success' : isNegative ? 'text-red-400' : 'text-text-secondary'
            }`}
          >
            {isPositive ? '+' : ''}
            {growth.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
