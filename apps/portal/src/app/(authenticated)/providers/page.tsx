'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useProviders, type Provider } from '../../../hooks/use-providers';

const PAGE_LIMIT = 20;
const DEBOUNCE_MS = 300;

function StatusBadge({ status }: { status: Provider['status'] }) {
  const isOnline = status === 'online';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-text-muted'}`}
        aria-hidden="true"
      />
      <span className={isOnline ? 'text-success' : 'text-text-muted'}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </span>
  );
}

function CapabilityBreakdown({ providers }: { providers: Provider[] }) {
  const counts = providers.reduce(
    (acc, p) => {
      for (const cap of p.capabilities) {
        acc[cap] = (acc[cap] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const labels: Record<string, string> = {
    ride: 'Ride',
    delivery: 'Delivery',
    parcel: 'Parcel',
  };

  const keys = ['ride', 'delivery', 'parcel'];
  const parts = keys
    .filter((key) => counts[key])
    .map((key) => `${counts[key]} ${labels[key] || key}`);

  if (parts.length === 0) return null;

  return (
    <p className="text-sm text-text-secondary">
      {parts.join(', ')}
    </p>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
        />
      </svg>
      <input
        type="text"
        placeholder="Search by name or phone..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2 bg-background-elevated border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        aria-label="Search providers"
      />
    </div>
  );
}

function PaginationControls({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-text-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous page"
      >
        Previous
      </button>
      <span className="text-sm text-text-secondary">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-text-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
}

function ProvidersTableSkeleton() {
  return (
    <div className="bg-background-surface rounded-card border border-border overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
            <div className="h-4 w-32 bg-background-elevated rounded" />
            <div className="h-4 w-16 bg-background-elevated rounded" />
            <div className="h-4 w-12 bg-background-elevated rounded" />
            <div className="h-4 w-16 bg-background-elevated rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1); // Reset to page 1 on new search
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useProviders({
    page,
    limit: PAGE_LIMIT,
    search: debouncedSearch,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_LIMIT)) : 1;
  const activeCount = data
    ? data.providers.filter((p) => p.status === 'online').length
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-heading text-text-primary">Providers</h1>
        {data && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-muted text-success">
            {activeCount} active
          </span>
        )}
      </div>
      <p className="mt-2 text-text-secondary">
        Manage and monitor your service providers.
      </p>

      {/* Capability breakdown */}
      {data && (
        <div className="mt-3">
          <CapabilityBreakdown providers={data.providers} />
        </div>
      )}

      {/* Search */}
      <div className="mt-6 max-w-sm">
        <SearchInput value={searchInput} onChange={setSearchInput} />
      </div>

      {/* Content */}
      <div className="mt-6">
        {isLoading && <ProvidersTableSkeleton />}

        {error && !isLoading && (
          <div className="bg-background-surface rounded-card border border-border p-6 text-center">
            <p className="text-text-secondary">{error}</p>
            <button
              onClick={refetch}
              className="mt-4 px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {data && !isLoading && !error && (
          <>
            {data.providers.length === 0 ? (
              <div className="bg-background-surface rounded-card border border-border p-6 text-center">
                <p className="text-text-secondary">
                  {debouncedSearch
                    ? 'No providers match your search.'
                    : 'No providers found.'}
                </p>
              </div>
            ) : (
              <div className="bg-background-surface rounded-card border border-border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-border text-xs font-medium text-text-muted uppercase tracking-wide">
                  <span>Name</span>
                  <span>Status</span>
                  <span>Rating</span>
                  <span className="text-right">Completed Jobs</span>
                </div>

                {/* Table rows */}
                <div className="divide-y divide-border">
                  {data.providers.map((provider, index) => (
                    <div
                      key={provider.id}
                      className={`grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-4 items-center text-sm transition-colors hover:bg-background-elevated ${
                        index % 2 === 1 ? 'bg-background/50' : ''
                      }`}
                    >
                      <Link
                        href={`/providers/${provider.id}`}
                        className="text-text-primary font-medium hover:text-accent transition-colors"
                      >
                        {provider.name}
                      </Link>
                      <StatusBadge status={provider.status} />
                      <span className="text-text-secondary">
                        {provider.rating.toFixed(1)}
                      </span>
                      <span className="text-text-secondary text-right">
                        {provider.completedJobs.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagination */}
            {data.total > PAGE_LIMIT && (
              <PaginationControls
                page={page}
                totalPages={totalPages}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
