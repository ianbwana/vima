'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const MODULES = [
  { key: 'rides', name: 'Ride Hailing', description: 'On-demand passenger transport', icon: '🚗' },
  { key: 'food', name: 'Food Delivery', description: 'Restaurant food delivery', icon: '🍔' },
  { key: 'groceries', name: 'Groceries', description: 'Grocery shopping & delivery', icon: '🛒' },
  { key: 'courier', name: 'Courier', description: 'Package delivery services', icon: '📦' },
  { key: 'home_services', name: 'Home Services', description: 'Home maintenance & repair', icon: '🔧' },
];

const TIERS = [
  { value: 'starter', name: 'Starter', price: '$99/mo', description: 'Branded PWA, subdomain only', features: ['Branded PWA', 'Up to 2 modules', 'Subdomain'] },
  { value: 'growth', name: 'Growth', price: '$299/mo', description: 'Custom domain, all modules', features: ['Custom domain', 'All modules', 'Priority support'] },
  { value: 'scale', name: 'Scale', price: '$799/mo', description: 'Native apps, white-label', features: ['Native iOS & Android apps', 'White-label branding', 'App Factory', 'Dedicated provider app'] },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'info' | 'tier' | 'modules' | 'confirm'>('info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    adminPassword: '',
    tier: 'starter',
    enabledModules: [] as string[],
  });

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      // 1. Create tenant
      const tenantRes = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          tier: form.tier,
          enabledModules: form.enabledModules,
        }),
      });

      if (!tenantRes.ok) {
        const body = await tenantRes.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to create tenant');
      }

      const tenant = await tenantRes.json();

      // 2. Register admin user for the tenant (would call tenant-scoped auth/register)
      // For now, tenant is created and admin can be set up in the tenant portal

      router.push(`/tenants/${tenant.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/" className="text-accent text-sm hover:underline mb-6 inline-block">← Back to Dashboard</Link>

      <h1 className="text-2xl font-heading text-text-primary">Create New Tenant</h1>
      <p className="mt-2 text-text-secondary">Set up a new tenant with their business details, plan, and services.</p>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {/* Step 1: Business Info */}
      {step === 'info' && (
        <div className="mt-6 bg-background-surface rounded-card border border-border p-6 space-y-5">
          <h2 className="text-lg font-heading text-text-primary">Business Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Company Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: generateSlug(e.target.value) })}
                className="w-full px-3 py-2.5 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                placeholder="Acme Transport"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Subdomain (URL slug)</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="flex-1 px-3 py-2.5 bg-background-elevated border border-border rounded-l-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                  placeholder="acme-transport"
                />
                <span className="px-3 py-2.5 bg-background-elevated border border-l-0 border-border rounded-r-lg text-text-muted text-sm">.vima.app</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Admin Email</label>
              <input
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                className="w-full px-3 py-2.5 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                placeholder="admin@acme.com"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Admin Password</label>
              <input
                type="password"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                className="w-full px-3 py-2.5 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                placeholder="Choose a strong password"
              />
            </div>
          </div>
          <button
            onClick={() => setStep('tier')}
            disabled={!form.name || !form.slug}
            className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            Continue — Choose Plan
          </button>
        </div>
      )}

      {/* Step 2: Select Tier */}
      {step === 'tier' && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-heading text-text-primary">Choose a Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TIERS.map((tier) => (
              <button
                key={tier.value}
                onClick={() => setForm({ ...form, tier: tier.value })}
                className={`p-5 rounded-card border text-left transition-all ${
                  form.tier === tier.value
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-background-surface hover:border-accent/50'
                }`}
              >
                <p className="text-sm font-heading text-text-primary">{tier.name}</p>
                <p className="text-lg font-heading text-accent mt-1">{tier.price}</p>
                <p className="text-xs text-text-muted mt-2">{tier.description}</p>
                <ul className="mt-3 space-y-1">
                  {tier.features.map((f) => (
                    <li key={f} className="text-xs text-text-secondary flex items-center gap-1.5">
                      <span className="text-success">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('info')} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Back</button>
            <button onClick={() => setStep('modules')} className="flex-1 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
              Continue — Select Services
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Select Modules */}
      {step === 'modules' && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-heading text-text-primary">Select Services</h2>
          <p className="text-sm text-text-muted">Choose which services to enable for this tenant.</p>
          <div className="space-y-3">
            {MODULES.map((mod) => (
              <label
                key={mod.key}
                className={`flex items-center gap-4 p-4 rounded-card border cursor-pointer transition-all ${
                  form.enabledModules.includes(mod.key)
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-background-surface hover:border-accent/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.enabledModules.includes(mod.key)}
                  onChange={(e) => {
                    setForm({
                      ...form,
                      enabledModules: e.target.checked
                        ? [...form.enabledModules, mod.key]
                        : form.enabledModules.filter((m) => m !== mod.key),
                    });
                  }}
                  className="rounded"
                />
                <span className="text-2xl">{mod.icon}</span>
                <div>
                  <p className="text-sm font-medium text-text-primary">{mod.name}</p>
                  <p className="text-xs text-text-muted">{mod.description}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('tier')} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Back</button>
            <button
              onClick={() => setStep('confirm')}
              disabled={form.enabledModules.length === 0}
              className="flex-1 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              Continue — Review
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 'confirm' && (
        <div className="mt-6 bg-background-surface rounded-card border border-border p-6 space-y-5">
          <h2 className="text-lg font-heading text-text-primary">Review & Create</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-text-muted">Company</span>
              <span className="text-text-primary font-medium">{form.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-text-muted">Subdomain</span>
              <span className="text-text-primary">{form.slug}.vima.app</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-text-muted">Plan</span>
              <span className="text-accent font-medium capitalize">{form.tier}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-text-muted">Admin Email</span>
              <span className="text-text-primary">{form.adminEmail}</span>
            </div>
            <div className="py-2">
              <span className="text-text-muted">Services</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.enabledModules.map((mod) => (
                  <span key={mod} className="text-xs px-2 py-1 rounded-full bg-accent-muted text-accent capitalize">
                    {mod.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('modules')} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Back</button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
