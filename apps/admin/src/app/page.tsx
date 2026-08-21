'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  tier: string;
  enabledModules: string[];
  createdAt: string;
}

export default function AdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, starter: 0, growth: 0, scale: 0 });

  useEffect(() => {
    fetchTenants();
  }, []);

  async function fetchTenants() {
    setLoading(true);
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.tenants || [];
        setTenants(list);
        setStats({
          total: list.length,
          active: list.filter((t: Tenant) => t.status === 'active').length,
          starter: list.filter((t: Tenant) => t.tier === 'starter').length,
          growth: list.filter((t: Tenant) => t.tier === 'growth').length,
          scale: list.filter((t: Tenant) => t.tier === 'scale').length,
        });
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heading text-text-primary">Vima Platform Admin</h1>
          <p className="mt-1 text-text-secondary">Manage tenants, subscriptions, and platform operations.</p>
        </div>
        <Link
          href="/signup"
          className="px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          + New Tenant
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total Tenants', value: stats.total, color: 'text-text-primary' },
          { label: 'Active', value: stats.active, color: 'text-success' },
          { label: 'Starter', value: stats.starter, color: 'text-text-secondary' },
          { label: 'Growth', value: stats.growth, color: 'text-warning' },
          { label: 'Scale', value: stats.scale, color: 'text-accent' },
        ].map((stat) => (
          <div key={stat.label} className="bg-background-surface rounded-card border border-border p-4">
            <p className="text-xs text-text-muted">{stat.label}</p>
            <p className={`text-2xl font-heading mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tenant List */}
      <div className="bg-background-surface rounded-card border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-heading text-text-primary">All Tenants</h2>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-background-elevated rounded animate-pulse" />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-text-muted">No tenants yet.</p>
            <Link href="/signup" className="text-accent text-sm hover:underline mt-2 inline-block">Create your first tenant</Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tenants.map((tenant) => (
              <Link
                key={tenant.id}
                href={`/tenants/${tenant.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-background-elevated transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center text-accent text-sm font-bold">
                    {tenant.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{tenant.name}</p>
                    <p className="text-xs text-text-muted">{tenant.slug}.vima.app</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      tenant.tier === 'scale' ? 'bg-accent-muted text-accent' :
                      tenant.tier === 'growth' ? 'bg-warning-muted text-warning' :
                      'bg-background-elevated text-text-muted'
                    }`}>
                      {tenant.tier}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    tenant.status === 'active' ? 'bg-success-muted text-success' :
                    'bg-background-elevated text-text-muted'
                  }`}>
                    {tenant.status}
                  </span>
                  <span className="text-xs text-text-muted">{(tenant.enabledModules || []).length} modules</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
