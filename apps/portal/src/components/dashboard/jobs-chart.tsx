'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiClient } from '../../lib/api-client';

interface JobsByModuleEntry {
  date: string;
  module: string;
  count: number;
}

interface JobsByModuleResponse {
  data: JobsByModuleEntry[];
}

const MODULE_COLORS: Record<string, string> = {
  ride: '#6366F1',
  delivery_leg: '#8B5CF6',
  parcel: '#A78BFA',
};

const ACCENT_COLOR = '#FF6B3D';

function getModuleLabel(module: string): string {
  switch (module) {
    case 'ride':
      return 'Ride';
    case 'delivery_leg':
      return 'Delivery';
    case 'parcel':
      return 'Parcel';
    default:
      return module.charAt(0).toUpperCase() + module.slice(1).replace(/_/g, ' ');
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function JobsChart() {
  const [data, setData] = useState<JobsByModuleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<JobsByModuleResponse>('/dashboard/jobs-by-module');
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Determine top-performing module (highest total count)
  const { topModule, modules, dates, maxDayTotal, moduleColors } = useMemo(() => {
    const moduleTotals: Record<string, number> = {};
    const dateSet = new Set<string>();
    const moduleSet = new Set<string>();

    for (const entry of data) {
      moduleTotals[entry.module] = (moduleTotals[entry.module] || 0) + entry.count;
      dateSet.add(entry.date);
      moduleSet.add(entry.module);
    }

    // Find top module
    let topMod = '';
    let topCount = 0;
    for (const [mod, total] of Object.entries(moduleTotals)) {
      if (total > topCount) {
        topCount = total;
        topMod = mod;
      }
    }

    // Calculate max daily total for scaling
    const dates = Array.from(dateSet).sort();
    const modules = Array.from(moduleSet);
    let maxTotal = 0;
    for (const date of dates) {
      let dayTotal = 0;
      for (const entry of data) {
        if (entry.date === date) {
          dayTotal += entry.count;
        }
      }
      if (dayTotal > maxTotal) maxTotal = dayTotal;
    }

    // Assign colors: top module gets accent, others get muted colors
    const muted = Object.values(MODULE_COLORS);
    let mutedIdx = 0;
    const colors: Record<string, string> = {};
    for (const mod of modules) {
      if (mod === topMod) {
        colors[mod] = ACCENT_COLOR;
      } else {
        colors[mod] = muted[mutedIdx % muted.length];
        mutedIdx++;
      }
    }

    return {
      topModule: topMod,
      modules,
      dates,
      maxDayTotal: maxTotal || 1,
      moduleColors: colors,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-card border border-border bg-background-surface p-6">
        <div className="mb-4 h-5 w-48 animate-pulse rounded bg-background-elevated" />
        <div className="flex h-48 items-end gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1">
              <div
                className="animate-pulse rounded-t bg-background-elevated"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-border bg-background-surface p-6">
        <h3 className="text-lg font-heading text-text-primary">Jobs by Module</h3>
        <div className="mt-4 flex flex-col items-center justify-center py-8">
          <p className="text-text-secondary">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-card border border-border bg-background-surface p-6">
        <h3 className="text-lg font-heading text-text-primary">Jobs by Module</h3>
        <div className="mt-4 flex items-center justify-center py-8">
          <p className="text-text-muted">No job data available for the last 7 days.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-background-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-heading text-text-primary">Jobs by Module</h3>
        <span className="text-sm text-text-muted">Last 7 days</span>
      </div>

      {/* Bar Chart */}
      <div className="flex h-48 items-end gap-2">
        {dates.map((date) => {
          const dayEntries = data.filter((entry) => entry.date === date);
          const dayTotal = dayEntries.reduce((sum, e) => sum + e.count, 0);
          const barHeightPercent = (dayTotal / maxDayTotal) * 100;

          return (
            <div key={date} className="flex flex-1 flex-col items-center">
              {/* Stacked bar */}
              <div
                className="relative flex w-full flex-col justify-end overflow-hidden rounded-t"
                style={{ height: `${barHeightPercent}%`, minHeight: dayTotal > 0 ? '4px' : '0' }}
              >
                {modules.map((mod) => {
                  const entry = dayEntries.find((e) => e.module === mod);
                  const count = entry?.count || 0;
                  if (count === 0) return null;
                  const segmentPercent = (count / dayTotal) * 100;

                  return (
                    <div
                      key={mod}
                      className="w-full transition-all"
                      style={{
                        height: `${segmentPercent}%`,
                        backgroundColor: moduleColors[mod] || '#71717A',
                        minHeight: '2px',
                      }}
                      title={`${getModuleLabel(mod)}: ${count} jobs on ${formatDate(date)}`}
                    />
                  );
                })}
              </div>

              {/* Date label */}
              <span className="mt-2 text-xs text-text-muted">{formatDateShort(date)}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4">
        {modules.map((mod) => (
          <div key={mod} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: moduleColors[mod] || '#71717A' }}
            />
            <span className="text-sm text-text-secondary">
              {getModuleLabel(mod)}
              {mod === topModule && (
                <span className="ml-1 text-xs text-accent">(top)</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
