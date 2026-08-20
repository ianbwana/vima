'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';

interface MetricWithGrowth {
  value: number;
  growth: number;
}

export interface DashboardMetrics {
  gmv: MetricWithGrowth;
  completedJobs: MetricWithGrowth;
  activeProviders: number;
  completionRate: number;
}

interface UseMetricsResult {
  data: DashboardMetrics | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMetrics(): UseMetricsResult {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchMetrics() {
      setIsLoading(true);
      setError(null);

      try {
        const metrics = await apiClient<DashboardMetrics>('/dashboard/metrics');
        if (!cancelled) {
          setData(metrics);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metrics');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchMetrics();

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  return { data, isLoading, error, refetch };
}
