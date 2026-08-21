'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  tier: string;
  enabledModules: string[];
  createdAt: string;
}

export default function PlatformAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [viewMode, setViewMode] = useState<'admin' | 'tenant' | 'customer'>('admin');

  useEffect(() => {
    fetchTenants();
  }, []);

  async function fetchTenants() {
    setLoading(true);
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const data = await res.json();
        setTenants(Array.isArray(data) ? data : data.tenants || []);
      }
    } catch {}
    setLoading(false);
  }

  // Platform admin view — all tenants
  if (viewMode === 'admin' && !selectedTenant) {
    const stats = {
      total: tenants.length,
      active: tenants.filter((t) => t.status === 'active').length,
      starter: tenants.filter((t) => t.tier === 'starter').length,
      growth: tenants.filter((t) => t.tier === 'growth').length,
      scale: tenants.filter((t) => t.tier === 'scale').length,
    };

    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Platform Administration</h1>
        <p className="mt-2 text-text-secondary">Manage all tenants, their users, and platform operations.</p>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Active', value: stats.active, color: 'text-success' },
            { label: 'Starter', value: stats.starter },
            { label: 'Growth', value: stats.growth, color: 'text-accent' },
            { label: 'Scale', value: stats.scale, color: 'text-accent' },
          ].map((s) => (
            <div key={s.label} className="bg-background-surface rounded-card border border-border p-4">
              <p className="text-xs text-text-muted">{s.label}</p>
              <p className={`text-xl font-heading mt-1 ${s.color || 'text-text-primary'}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tenant List */}
        <div className="mt-6 bg-background-surface rounded-card border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-heading text-text-primary">All Tenants</h2>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-background-elevated rounded animate-pulse" />)}</div>
          ) : tenants.length === 0 ? (
            <div className="p-8 text-center text-text-muted">No tenants yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {tenants.map((tenant) => (
                <div key={tenant.id} className="px-5 py-4 flex items-center justify-between hover:bg-background-elevated transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center text-accent text-sm font-bold">
                      {tenant.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{tenant.name}</p>
                      <p className="text-xs text-text-muted">{tenant.slug}.vima.app · {(tenant.enabledModules || []).length} modules</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tenant.status === 'active' ? 'bg-success-muted text-success' : 'bg-background-elevated text-text-muted'}`}>{tenant.status}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-background-elevated text-text-muted">{tenant.tier}</span>
                    <button
                      onClick={() => { setSelectedTenant(tenant); setViewMode('tenant'); }}
                      className="ml-2 px-3 py-1 text-xs bg-accent text-text-primary rounded-md hover:bg-accent-hover transition-colors"
                    >
                      View as Tenant
                    </button>
                    <button
                      onClick={() => { setSelectedTenant(tenant); setViewMode('customer'); }}
                      className="px-3 py-1 text-xs bg-background-elevated text-text-secondary border border-border rounded-md hover:text-text-primary transition-colors"
                    >
                      View as Customer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // "View as Tenant" — shows the tenant's dashboard perspective
  if (viewMode === 'tenant' && selectedTenant) {
    return (
      <div>
        <button onClick={() => { setSelectedTenant(null); setViewMode('admin'); }} className="text-accent text-sm hover:underline mb-4 inline-block">
          ← Back to Platform Admin
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="px-3 py-1 bg-accent-muted text-accent text-xs rounded-full font-medium">Viewing as Tenant</div>
          <h1 className="text-xl font-heading text-text-primary">{selectedTenant.name}</h1>
        </div>

        {/* Tenant dashboard view */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-background-surface rounded-card border border-border p-5">
            <p className="text-xs text-text-muted">Plan</p>
            <p className="text-lg font-heading text-accent capitalize mt-1">{selectedTenant.tier}</p>
          </div>
          <div className="bg-background-surface rounded-card border border-border p-5">
            <p className="text-xs text-text-muted">Active Services</p>
            <p className="text-lg font-heading text-text-primary mt-1">{(selectedTenant.enabledModules || []).length}</p>
          </div>
          <div className="bg-background-surface rounded-card border border-border p-5">
            <p className="text-xs text-text-muted">Status</p>
            <p className="text-lg font-heading text-success capitalize mt-1">{selectedTenant.status}</p>
          </div>
        </div>

        {/* Enabled services */}
        <div className="bg-background-surface rounded-card border border-border p-6 mb-6">
          <h2 className="text-lg font-heading text-text-primary mb-4">Enabled Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(selectedTenant.enabledModules || []).map((mod) => (
              <div key={mod} className="flex items-center gap-3 p-3 bg-background-elevated rounded-lg">
                <span className="text-xl">{{ rides: '🚗', food: '🍔', groceries: '🛒', courier: '📦', home_services: '🔧' }[mod] || '📋'}</span>
                <p className="text-sm text-text-primary capitalize">{mod.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Users section */}
        <div className="bg-background-surface rounded-card border border-border p-6">
          <h2 className="text-lg font-heading text-text-primary mb-4">Tenant Users</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Customers', icon: '👥', desc: 'End users of the platform' },
              ...(selectedTenant.enabledModules || []).includes('rides') || (selectedTenant.enabledModules || []).includes('courier')
                ? [{ label: 'Drivers', icon: '🚗', desc: 'Ride & delivery providers' }] : [],
              ...(selectedTenant.enabledModules || []).includes('food') || (selectedTenant.enabledModules || []).includes('groceries')
                ? [{ label: 'Vendors', icon: '🏪', desc: 'Restaurants & stores' }] : [],
              ...(selectedTenant.enabledModules || []).includes('home_services')
                ? [{ label: 'Technicians', icon: '🔧', desc: 'Service providers' }] : [],
            ].map((item) => (
              <div key={item.label} className="p-4 bg-background-elevated rounded-lg border border-border text-center">
                <span className="text-2xl">{item.icon}</span>
                <p className="text-sm font-medium text-text-primary mt-2">{item.label}</p>
                <p className="text-xs text-text-muted mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // "View as Customer" — shows what the tenant's customers see
  if (viewMode === 'customer' && selectedTenant) {
    return (
      <div>
        <button onClick={() => { setSelectedTenant(null); setViewMode('admin'); }} className="text-accent text-sm hover:underline mb-4 inline-block">
          ← Back to Platform Admin
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="px-3 py-1 bg-success-muted text-success text-xs rounded-full font-medium">Viewing as Customer</div>
          <h1 className="text-xl font-heading text-text-primary">{selectedTenant.name}</h1>
        </div>

        <p className="text-sm text-text-secondary mb-6">This is what a customer of {selectedTenant.name} would see in their app.</p>

        {/* Customer-facing services */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(selectedTenant.enabledModules || []).map((mod) => {
            const moduleInfo: Record<string, { name: string; icon: string; desc: string; actions: string[] }> = {
              rides: { name: 'Ride Hailing', icon: '🚗', desc: 'Book a ride anywhere in the city', actions: ['Request Ride', 'Track Driver', 'Rate Trip'] },
              food: { name: 'Food Delivery', icon: '🍔', desc: 'Order from local restaurants', actions: ['Browse Menus', 'Place Order', 'Track Delivery'] },
              groceries: { name: 'Groceries', icon: '🛒', desc: 'Shop groceries delivered to your door', actions: ['Browse Store', 'Add to Cart', 'Schedule Delivery'] },
              courier: { name: 'Send Package', icon: '📦', desc: 'Send parcels across the city', actions: ['Get Quote', 'Send Parcel', 'Track Package'] },
              home_services: { name: 'Home Services', icon: '🔧', desc: 'Book trusted professionals', actions: ['Browse Services', 'Book Slot', 'Get Quotes'] },
            };
            const info = moduleInfo[mod];
            if (!info) return null;
            return (
              <div key={mod} className="bg-background-surface rounded-card border border-border p-5 hover:border-accent/50 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{info.icon}</span>
                  <h3 className="text-sm font-heading text-text-primary">{info.name}</h3>
                </div>
                <p className="text-xs text-text-muted mb-4">{info.desc}</p>
                <div className="space-y-2">
                  {info.actions.map((action) => (
                    <div key={action} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="w-1 h-1 rounded-full bg-accent" />
                      {action}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
