'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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

const ALL_MODULES = ['rides', 'food', 'groceries', 'courier', 'home_services'];

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTenant();
  }, [tenantId]);

  async function fetchTenant() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setTenant(data);
      }
    } catch {}
    setLoading(false);
  }

  async function toggleModule(module: string, enable: boolean) {
    if (!tenant) return;
    setSaving(true);
    try {
      const newModules = enable
        ? [...(tenant.enabledModules || []), module]
        : (tenant.enabledModules || []).filter((m) => m !== module);

      const res = await fetch(`/api/entitlements/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({ modules: newModules }),
      });

      if (res.ok) {
        setTenant({ ...tenant, enabledModules: newModules });
      }
    } catch {}
    setSaving(false);
  }

  async function updateStatus(status: string) {
    if (!tenant) return;
    setSaving(true);
    try {
      // In production: call a dedicated status endpoint
      // For now, just update local state
      setTenant({ ...tenant, status });
    } catch {}
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-background-surface rounded-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 text-center">
        <p className="text-text-muted">Tenant not found.</p>
        <Link href="/" className="text-accent text-sm hover:underline mt-2 inline-block">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Link href="/" className="text-accent text-sm hover:underline mb-6 inline-block">← All Tenants</Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent-muted flex items-center justify-center text-accent text-xl font-bold">
            {tenant.name[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-heading text-text-primary">{tenant.name}</h1>
            <p className="text-sm text-text-muted">{tenant.slug}.vima.app · Created {new Date(tenant.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            tenant.status === 'active' ? 'bg-success-muted text-success' :
            tenant.status === 'suspended' ? 'bg-red-500/10 text-red-400' :
            'bg-warning-muted text-warning'
          }`}>
            {tenant.status}
          </span>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            tenant.tier === 'scale' ? 'bg-accent-muted text-accent' :
            tenant.tier === 'growth' ? 'bg-warning-muted text-warning' :
            'bg-background-elevated text-text-muted'
          }`}>
            {tenant.tier} tier
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => updateStatus('active')}
          disabled={tenant.status === 'active' || saving}
          className="p-4 bg-background-surface rounded-card border border-border text-left hover:border-success/50 transition-colors disabled:opacity-50"
        >
          <p className="text-sm font-medium text-success">Activate</p>
          <p className="text-xs text-text-muted mt-1">Set tenant to active status</p>
        </button>
        <button
          onClick={() => updateStatus('suspended')}
          disabled={tenant.status === 'suspended' || saving}
          className="p-4 bg-background-surface rounded-card border border-border text-left hover:border-red-500/50 transition-colors disabled:opacity-50"
        >
          <p className="text-sm font-medium text-red-400">Suspend</p>
          <p className="text-xs text-text-muted mt-1">Temporarily suspend access</p>
        </button>
        <a
          href={`http://localhost:3000`}
          target="_blank"
          rel="noreferrer"
          className="p-4 bg-background-surface rounded-card border border-border text-left hover:border-accent/50 transition-colors"
        >
          <p className="text-sm font-medium text-accent">Open Portal</p>
          <p className="text-xs text-text-muted mt-1">Go to tenant's admin portal</p>
        </a>
      </div>

      {/* Services/Modules */}
      <div className="bg-background-surface rounded-card border border-border p-6">
        <h2 className="text-lg font-heading text-text-primary mb-4">Enabled Services</h2>
        <p className="text-sm text-text-muted mb-5">Toggle services for this tenant. Changes take effect immediately.</p>

        <div className="space-y-3">
          {ALL_MODULES.map((mod) => {
            const enabled = (tenant.enabledModules || []).includes(mod);
            return (
              <div key={mod} className="flex items-center justify-between p-4 bg-background-elevated rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {{ rides: '🚗', food: '🍔', groceries: '🛒', courier: '📦', home_services: '🔧' }[mod]}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-text-primary capitalize">{mod.replace('_', ' ')}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleModule(mod, !enabled)}
                  disabled={saving}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    enabled ? 'bg-accent' : 'bg-background-surface border border-border'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tenant Info */}
      <div className="mt-6 bg-background-surface rounded-card border border-border p-6">
        <h2 className="text-lg font-heading text-text-primary mb-4">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-text-muted">Tenant ID</p>
            <p className="text-text-primary font-mono text-xs mt-1">{tenant.id}</p>
          </div>
          <div>
            <p className="text-text-muted">Slug</p>
            <p className="text-text-primary mt-1">{tenant.slug}</p>
          </div>
          <div>
            <p className="text-text-muted">Database</p>
            <p className="text-text-primary font-mono text-xs mt-1">vima_tenant_{tenant.id}</p>
          </div>
          <div>
            <p className="text-text-muted">Created</p>
            <p className="text-text-primary mt-1">{new Date(tenant.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
