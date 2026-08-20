'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

interface PspConnection {
  id: string;
  provider: string;
  verified: boolean;
  lastVerifiedAt: string | null;
  createdAt: string;
}

interface Transaction {
  id: string;
  type: string;
  referenceId?: string;
  description?: string;
  entries: Array<{
    id: string;
    amount: string;
    direction: 'debit' | 'credit';
  }>;
  createdAt: string;
}

type TransactionStatus = 'succeeded' | 'failed' | 'pending';

function getTransactionStatus(tx: Transaction): TransactionStatus {
  if (tx.type === 'topup' || tx.type === 'p2p_transfer' || tx.type === 'fare') {
    return 'succeeded';
  }
  if (tx.type === 'refund') {
    return 'succeeded';
  }
  return 'pending';
}

function getTransactionAmount(tx: Transaction): string {
  const creditEntry = tx.entries.find((e) => e.direction === 'credit');
  return creditEntry?.amount ?? tx.entries[0]?.amount ?? '0.00';
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function capitalizeProvider(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export default function PaymentsPage() {
  const [connections, setConnections] = useState<PspConnection[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const conns = await apiClient<PspConnection[]>('/psp-connections');
      setConnections(conns);

      // Fetch transactions only if there's a verified connection
      const verifiedConnection = conns.find((c) => c.verified);
      if (verifiedConnection) {
        const txns = await apiClient<Transaction[]>('/wallet/transactions?limit=10');
        setTransactions(txns);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  }

  const activeConnection = connections.length > 0 ? connections[0] : null;
  const isVerified = activeConnection?.verified ?? false;

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Payments</h1>
        <p className="mt-2 text-text-secondary">Manage your payment provider and view transactions.</p>
        <div className="mt-6 space-y-6">
          {/* Connection status skeleton */}
          <div className="bg-background-surface rounded-card border border-border p-6 animate-pulse">
            <div className="h-5 w-40 bg-background-elevated rounded" />
            <div className="mt-4 h-4 w-64 bg-background-elevated rounded" />
            <div className="mt-2 h-4 w-48 bg-background-elevated rounded" />
          </div>
          {/* Transactions skeleton */}
          <div className="bg-background-surface rounded-card border border-border p-6 animate-pulse">
            <div className="h-5 w-48 bg-background-elevated rounded" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-full bg-background-elevated rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Payments</h1>
        <p className="mt-2 text-text-secondary">Manage your payment provider and view transactions.</p>
        <div className="mt-6 bg-background-surface rounded-card border border-border p-6 text-center">
          <p className="text-text-secondary">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">Payments</h1>
      <p className="mt-2 text-text-secondary">Manage your payment provider and view transactions.</p>

      <div className="mt-6 space-y-6">
        {/* PSP Connection Status Card */}
        {!activeConnection ? (
          <div className="bg-background-surface rounded-card border border-border p-6">
            <h2 className="text-lg font-heading text-text-primary">Payment Provider</h2>
            <p className="mt-2 text-text-secondary">
              No payment provider connected. Connect Stripe or Paystack to start accepting payments.
            </p>
            <a
              href="/payments/setup"
              className="mt-4 inline-block px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Connect Provider
            </a>
          </div>
        ) : (
          <div className="bg-background-surface rounded-card border border-border p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-heading text-text-primary">Payment Provider</h2>
                <div className="mt-3 flex items-center gap-3">
                  {/* Provider icon placeholder */}
                  <div className="w-10 h-10 rounded-lg bg-background-elevated flex items-center justify-center">
                    <span className="text-sm font-bold text-text-secondary">
                      {activeConnection.provider.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-text-primary font-medium">
                      {capitalizeProvider(activeConnection.provider)}
                    </p>
                    <p className="text-sm text-text-secondary">
                      Connected {formatDate(activeConnection.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status badge */}
              <div>
                {isVerified ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-success-muted text-success">
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-accent-muted text-accent">
                    Not Verified
                  </span>
                )}
              </div>
            </div>

            {/* Verification details */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-text-secondary">Last verified: </span>
                  <span className="text-text-primary">
                    {formatDate(activeConnection.lastVerifiedAt)}
                  </span>
                </div>
                {!isVerified && (
                  <button className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover transition-colors">
                    Verify
                  </button>
                )}
                {isVerified && (
                  <button className="px-3 py-1.5 text-text-secondary text-xs font-medium hover:text-text-primary transition-colors">
                    Manage
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent Transactions - only shown when verified */}
        {isVerified && (
          <div className="bg-background-surface rounded-card border border-border p-6">
            <h2 className="text-lg font-heading text-text-primary">Recent Transactions</h2>

            {transactions.length === 0 ? (
              <p className="mt-4 text-text-secondary">No transactions yet</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Date
                      </th>
                      <th className="pb-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Reference
                      </th>
                      <th className="pb-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="pb-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((tx) => {
                      const status = getTransactionStatus(tx);
                      return (
                        <tr key={tx.id}>
                          <td className="py-3 text-sm text-text-secondary">
                            {formatDateTime(tx.createdAt)}
                          </td>
                          <td className="py-3 text-sm text-text-primary">
                            {tx.referenceId ?? tx.type}
                          </td>
                          <td className="py-3 text-sm text-text-primary text-right font-medium">
                            {getTransactionAmount(tx)}
                          </td>
                          <td className="py-3 text-right">
                            <StatusBadge status={status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  const styles: Record<TransactionStatus, string> = {
    succeeded: 'bg-success-muted text-success',
    failed: 'bg-red-500/10 text-red-400',
    pending: 'bg-accent-muted text-accent',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
