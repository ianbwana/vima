'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api-client';

export interface Provider {
  id: string;
  name: string;
  phone: string;
  status: 'online' | 'offline';
  rating: number;
  completedJobs: number;
  capabilities: string[];
}

export interface ProvidersResponse {
  providers: Provider[];
  total: number;
  page: number;
  limit: number;
}

interface UseProvidersOptions {
  page: number;
  limit: number;
  search: string;
}

interface UseProvidersResult {
  data: ProvidersResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useProviders({ page, limit, search }: UseProvidersOptions): UseProvidersResult {
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    async function fetchProviders() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        if (search) {
          params.set('search', search);
        }

        const result = await apiClient<ProvidersResponse>(
          `/providers?${params.toString()}`,
        );
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load providers');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchProviders();

    return () => {
      cancelled = true;
    };
  }, [page, limit, search, fetchKey]);

  return { data, isLoading, error, refetch };
}
