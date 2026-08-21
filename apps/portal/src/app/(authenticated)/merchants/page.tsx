'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

interface Merchant {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  category: string | null;
  commissionRate: string;
  status: string;
  createdAt: string;
}

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'restaurant', address: '', commissionRate: 0.15 });

  useEffect(() => {
    fetchMerchants();
  }, []);

  async function fetchMerchants() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<{ restaurants: Merchant[] }>('/food/restaurants');
      setMerchants(res.restaurants || []);
    } catch (err) {
      // Try groceries endpoint as fallback
      try {
        const res = await apiClient<{ stores: Merchant[] }>('/groceries/stores');
        setMerchants(res.stores || []);
      } catch {
        setError(err instanceof Error ? err.message : 'Failed to load merchants');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiClient('/food/merchant/catalogs', {
        method: 'POST',
        body: { merchantId: 'new', name: form.name },
      });
      setShowForm(false);
      fetchMerchants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create merchant');
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Merchants</h1>
        <p className="mt-2 text-text-secondary">Manage restaurants and grocery stores on your platform.</p>
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-background-surface rounded-card border border-border p-6 animate-pulse">
              <div className="h-5 w-48 bg-background-elevated rounded" />
              <div className="mt-3 h-4 w-32 bg-background-elevated rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Merchants</h1>
        <p className="mt-2 text-text-secondary">Manage restaurants and grocery stores on your platform.</p>
        <div className="mt-6 bg-background-surface rounded-card border border-border p-6 text-center">
          <p className="text-text-secondary">{error}</p>
          <button
            onClick={fetchMerchants}
            className="mt-4 px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading text-text-primary">Merchants</h1>
          <p className="mt-2 text-text-secondary">Manage restaurants and grocery stores on your platform.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-background-surface rounded-card border border-border p-5">
          <p className="text-sm text-text-muted">Total Merchants</p>
          <p className="mt-1 text-2xl font-metric text-text-primary">{merchants.length}</p>
        </div>
        <div className="bg-background-surface rounded-card border border-border p-5">
          <p className="text-sm text-text-muted">Restaurants</p>
          <p className="mt-1 text-2xl font-metric text-text-primary">
            {merchants.filter((m) => m.category === 'restaurant').length}
          </p>
        </div>
        <div className="bg-background-surface rounded-card border border-border p-5">
          <p className="text-sm text-text-muted">Grocery Stores</p>
          <p className="mt-1 text-2xl font-metric text-text-primary">
            {merchants.filter((m) => m.category === 'grocery_store').length}
          </p>
        </div>
      </div>

      {/* Merchants List */}
      <div className="mt-6 space-y-3">
        {merchants.length === 0 ? (
          <div className="bg-background-surface rounded-card border border-border p-8 text-center">
            <p className="text-text-muted">No merchants onboarded yet.</p>
            <p className="mt-1 text-sm text-text-muted">Merchants can self-register or be invited by an admin.</p>
          </div>
        ) : (
          merchants.map((merchant) => (
            <div
              key={merchant.id}
              className="bg-background-surface rounded-card border border-border p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-background-elevated flex items-center justify-center text-text-secondary">
                  {merchant.category === 'grocery_store' ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">{merchant.name}</p>
                  <p className="text-xs text-text-muted">
                    {merchant.category === 'grocery_store' ? 'Grocery Store' : 'Restaurant'}
                    {merchant.address ? ` · ${merchant.address}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-text-muted">
                  {(parseFloat(merchant.commissionRate) * 100).toFixed(0)}% commission
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    merchant.status === 'active'
                      ? 'bg-success-muted text-success'
                      : merchant.status === 'pending'
                        ? 'bg-accent-muted text-accent'
                        : 'bg-background-elevated text-text-muted'
                  }`}
                >
                  {merchant.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
