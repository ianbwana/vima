'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiClient } from '../../../../lib/api-client';

interface ProviderDocument {
  type: string;
  status: 'verified' | 'pending' | 'rejected';
  uploadedAt: string;
}

interface ProviderEarnings {
  total: string;
  thisMonth: string;
  currency: string;
}

interface ProviderDetail {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: 'online' | 'offline';
  rating: number;
  completedJobs: number;
  capabilities: string[];
  createdAt: string;
  documents?: ProviderDocument[];
  earnings?: ProviderEarnings;
}

function StatusBadge({ status }: { status: 'online' | 'offline' }) {
  const isOnline = status === 'online';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isOnline ? 'bg-success-muted text-success' : 'bg-background-elevated text-text-muted'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-text-muted'}`}
        aria-hidden="true"
      />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}

function DocumentStatusBadge({ status }: { status: ProviderDocument['status'] }) {
  const styles: Record<ProviderDocument['status'], string> = {
    verified: 'bg-success-muted text-success',
    pending: 'bg-accent-muted text-accent',
    rejected: 'bg-red-500/10 text-red-400',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function ProfileCardSkeleton() {
  return (
    <div className="bg-background-surface rounded-card border border-border p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-background-elevated" />
        <div className="space-y-2">
          <div className="h-5 w-40 bg-background-elevated rounded" />
          <div className="h-4 w-24 bg-background-elevated rounded" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-16 bg-background-elevated rounded" />
            <div className="h-4 w-28 bg-background-elevated rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentsCardSkeleton() {
  return (
    <div className="bg-background-surface rounded-card border border-border p-6 animate-pulse">
      <div className="h-5 w-24 bg-background-elevated rounded mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-32 bg-background-elevated rounded" />
            <div className="h-4 w-16 bg-background-elevated rounded" />
            <div className="h-4 w-24 bg-background-elevated rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EarningsCardSkeleton() {
  return (
    <div className="bg-background-surface rounded-card border border-border p-6 animate-pulse">
      <div className="h-5 w-32 bg-background-elevated rounded mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="h-3 w-20 bg-background-elevated rounded" />
          <div className="h-6 w-28 bg-background-elevated rounded" />
        </div>
        <div className="space-y-1">
          <div className="h-3 w-20 bg-background-elevated rounded" />
          <div className="h-6 w-28 bg-background-elevated rounded" />
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ provider }: { provider: ProviderDetail }) {
  return (
    <div className="bg-background-surface rounded-card border border-border p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent-muted flex items-center justify-center">
            <span className="text-accent text-lg font-heading">
              {provider.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-heading text-text-primary">{provider.name}</h2>
            <p className="text-sm text-text-secondary">{provider.phone}</p>
          </div>
        </div>
        <StatusBadge status={provider.status} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4">
        {provider.email && (
          <div>
            <p className="text-xs text-text-muted">Email</p>
            <p className="text-sm text-text-primary">{provider.email}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-text-muted">Rating</p>
          <p className="text-sm text-text-primary">{provider.rating.toFixed(1)} / 5.0</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Completed Jobs</p>
          <p className="text-sm text-text-primary">{provider.completedJobs.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Capabilities</p>
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {provider.capabilities.map((cap) => (
              <span
                key={cap}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-background-elevated text-text-secondary capitalize"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-text-muted">Joined</p>
          <p className="text-sm text-text-primary">
            {new Date(provider.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function DocumentsCard({ documents }: { documents?: ProviderDocument[] }) {
  if (!documents || documents.length === 0) {
    return (
      <div className="bg-background-surface rounded-card border border-border p-6">
        <h3 className="text-base font-heading text-text-primary mb-4">Documents</h3>
        <p className="text-sm text-text-secondary">No documents uploaded.</p>
      </div>
    );
  }

  return (
    <div className="bg-background-surface rounded-card border border-border p-6">
      <h3 className="text-base font-heading text-text-primary mb-4">Documents</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wide">
              <th className="text-left py-2 font-medium">Type</th>
              <th className="text-left py-2 font-medium">Status</th>
              <th className="text-right py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {documents.map((doc, index) => (
              <tr key={index}>
                <td className="py-3 text-text-primary capitalize">{doc.type}</td>
                <td className="py-3">
                  <DocumentStatusBadge status={doc.status} />
                </td>
                <td className="py-3 text-text-secondary text-right">
                  {new Date(doc.uploadedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EarningsCard({ earnings }: { earnings?: ProviderEarnings }) {
  if (!earnings) {
    return (
      <div className="bg-background-surface rounded-card border border-border p-6">
        <h3 className="text-base font-heading text-text-primary mb-4">Earnings Summary</h3>
        <p className="text-sm text-text-secondary">No earnings data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-background-surface rounded-card border border-border p-6">
      <h3 className="text-base font-heading text-text-primary mb-4">Earnings Summary</h3>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-text-muted">Total Earnings</p>
          <p className="text-xl font-metric text-text-primary">
            {earnings.currency} {earnings.total}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">This Month</p>
          <p className="text-xl font-metric text-text-primary">
            {earnings.currency} {earnings.thisMonth}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ProviderDetailPage() {
  const params = useParams<{ id: string }>();
  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProvider() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await apiClient<ProviderDetail>(`/providers/${params.id}`);
        if (!cancelled) {
          setProvider(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load provider details');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchProvider();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/providers"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
          />
        </svg>
        Back to Providers
      </Link>

      {/* Content */}
      <div className="mt-6 space-y-6">
        {isLoading && (
          <>
            <ProfileCardSkeleton />
            <DocumentsCardSkeleton />
            <EarningsCardSkeleton />
          </>
        )}

        {error && !isLoading && (
          <div className="bg-background-surface rounded-card border border-border p-6 text-center">
            <p className="text-text-secondary">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {provider && !isLoading && !error && (
          <>
            <ProfileCard provider={provider} />
            <DocumentsCard documents={provider.documents} />
            <EarningsCard earnings={provider.earnings} />
          </>
        )}
      </div>
    </div>
  );
}
