'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

type UserTab = 'customers' | 'drivers' | 'vendors' | 'technicians';

interface UserRecord {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  role: string;
  createdAt: string;
}

interface ProviderRecord {
  id: string;
  name: string;
  phone: string;
  status: string;
  rating: number;
  completedJobs: number;
  capabilities: string[];
  isOnline: boolean;
}

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<UserTab>('customers');
  const [customers, setCustomers] = useState<UserRecord[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchEntitlements();
  }, []);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchEntitlements() {
    try {
      const data = await apiClient<Record<string, boolean>>('/entitlements');
      setEntitlements(data);
    } catch {}
  }

  async function fetchData() {
    setLoading(true);
    try {
      if (activeTab === 'customers') {
        // Would call a user list endpoint in production
        setCustomers([]);
      } else if (activeTab === 'drivers') {
        const res = await apiClient<{ providers: ProviderRecord[] }>('/providers?page=1&limit=50');
        setProviders(res.providers || []);
      } else if (activeTab === 'vendors') {
        try {
          const res = await apiClient<{ restaurants: any[] }>('/food/restaurants');
          setMerchants(res.restaurants || []);
        } catch {
          try {
            const res = await apiClient<{ stores: any[] }>('/groceries/stores');
            setMerchants(res.stores || []);
          } catch { setMerchants([]); }
        }
      } else if (activeTab === 'technicians') {
        setProviders([]);
      }
    } catch {}
    setLoading(false);
  }

  // Determine available tabs based on enabled services
  const availableTabs: { id: UserTab; label: string; icon: string }[] = [
    { id: 'customers', label: 'Customers', icon: '👥' },
  ];
  if (entitlements.rides || entitlements.courier) {
    availableTabs.push({ id: 'drivers', label: 'Drivers', icon: '🚗' });
  }
  if (entitlements.food || entitlements.groceries) {
    availableTabs.push({ id: 'vendors', label: 'Vendors', icon: '🏪' });
  }
  if (entitlements.home_services) {
    availableTabs.push({ id: 'technicians', label: 'Technicians', icon: '🔧' });
  }

  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">Users</h1>
      <p className="mt-2 text-text-secondary">Manage your platform's customers, drivers, vendors, and service providers.</p>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 bg-background-surface rounded-lg p-1 border border-border w-fit">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeTab === tab.id ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Customers Tab */}
      {activeTab === 'customers' && (
        <div className="mt-6">
          <div className="bg-background-surface rounded-card border border-border p-6">
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-background-elevated rounded animate-pulse" />)}</div>
            ) : customers.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl">👥</span>
                <p className="text-text-muted mt-3">No customers registered yet.</p>
                <p className="text-xs text-text-muted mt-1">Customers will appear here once they sign up via your app.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {customers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-background-elevated rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold">
                        {user.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm text-text-primary">{user.name || 'Unnamed'}</p>
                        <p className="text-xs text-text-muted">{user.phone || user.email}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${user.status === 'active' ? 'bg-success-muted text-success' : 'bg-background-elevated text-text-muted'}`}>{user.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drivers Tab */}
      {activeTab === 'drivers' && (
        <div className="mt-6">
          <div className="bg-background-surface rounded-card border border-border p-6">
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-background-elevated rounded animate-pulse" />)}</div>
            ) : providers.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl">🚗</span>
                <p className="text-text-muted mt-3">No drivers registered yet.</p>
                <p className="text-xs text-text-muted mt-1">Drivers will appear once they register and are approved.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-background-elevated rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold">
                        {p.name?.[0]?.toUpperCase() || 'D'}
                      </div>
                      <div>
                        <p className="text-sm text-text-primary">{p.name}</p>
                        <p className="text-xs text-text-muted">{p.phone} · {p.completedJobs} jobs · ⭐ {p.rating}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {(p.capabilities || []).map((cap) => (
                          <span key={cap} className="text-xs px-1.5 py-0.5 rounded bg-background-surface text-text-muted">{cap}</span>
                        ))}
                      </div>
                      <span className={`w-2 h-2 rounded-full ${p.isOnline ? 'bg-success' : 'bg-text-muted'}`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vendors Tab */}
      {activeTab === 'vendors' && (
        <div className="mt-6">
          <div className="bg-background-surface rounded-card border border-border p-6">
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-background-elevated rounded animate-pulse" />)}</div>
            ) : merchants.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl">🏪</span>
                <p className="text-text-muted mt-3">No vendors onboarded yet.</p>
                <p className="text-xs text-text-muted mt-1">Restaurants and stores will appear once they register.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {merchants.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-background-elevated rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center text-accent text-xs font-bold">
                        {m.name?.[0]?.toUpperCase() || 'V'}
                      </div>
                      <div>
                        <p className="text-sm text-text-primary">{m.name}</p>
                        <p className="text-xs text-text-muted">{m.category === 'grocery_store' ? 'Grocery Store' : 'Restaurant'}{m.address ? ` · ${m.address}` : ''}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-success-muted text-success' : 'bg-background-elevated text-text-muted'}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Technicians Tab */}
      {activeTab === 'technicians' && (
        <div className="mt-6">
          <div className="bg-background-surface rounded-card border border-border p-6">
            <div className="text-center py-8">
              <span className="text-4xl">🔧</span>
              <p className="text-text-muted mt-3">No technicians registered yet.</p>
              <p className="text-xs text-text-muted mt-1">Home service providers will appear once they register and are verified.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
