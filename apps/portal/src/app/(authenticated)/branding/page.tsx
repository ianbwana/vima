'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

interface ThemeTokens {
  colors: { primary: string; onPrimary: string; secondary?: string; surface?: string; background?: string };
  typography: { fontFamily: string };
  logos: { appIcon?: string; headerLight?: string };
  copy?: { appName: string; tagline?: string };
  radius?: string;
}

interface ThemeVersion {
  id: string;
  version: number;
  published: boolean;
  tokens: ThemeTokens;
  createdAt: string;
}

interface Domain {
  id: string;
  domain: string;
  type: string;
  verified: boolean;
  sslStatus: string;
}

export default function BrandingPage() {
  const [theme, setTheme] = useState<ThemeVersion | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'theme' | 'domains' | 'builds'>('theme');
  const [saving, setSaving] = useState(false);

  // Theme form state
  const [form, setForm] = useState({
    primary: '#FF6B3D',
    onPrimary: '#FFFFFF',
    background: '#141414',
    surface: '#1E1E1E',
    fontFamily: 'Inter',
    appName: '',
    tagline: '',
    radius: '12px',
  });

  // Domain form
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [themeRes, domainsRes] = await Promise.all([
        apiClient<{ theme: ThemeVersion | null }>('/white-label/theme'),
        apiClient<{ domains: Domain[] }>('/white-label/domains'),
      ]);

      setTheme(themeRes.theme);
      setDomains(domainsRes.domains || []);

      if (themeRes.theme?.tokens) {
        const t = themeRes.theme.tokens;
        setForm({
          primary: t.colors?.primary || '#FF6B3D',
          onPrimary: t.colors?.onPrimary || '#FFFFFF',
          background: t.colors?.background || '#141414',
          surface: t.colors?.surface || '#1E1E1E',
          fontFamily: t.typography?.fontFamily || 'Inter',
          appName: t.copy?.appName || '',
          tagline: t.copy?.tagline || '',
          radius: t.radius || '12px',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branding config');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTheme(publish: boolean) {
    setSaving(true);
    try {
      await apiClient('/white-label/theme', {
        method: 'POST',
        body: {
          tokens: {
            colors: { primary: form.primary, onPrimary: form.onPrimary, background: form.background, surface: form.surface },
            typography: { fontFamily: form.fontFamily },
            copy: { appName: form.appName, tagline: form.tagline },
            radius: form.radius,
          },
          publish,
        },
      });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save theme');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain) return;
    try {
      await apiClient('/white-label/domains', { method: 'POST', body: { domain: newDomain } });
      setNewDomain('');
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add domain');
    }
  }

  async function handleVerifyDomain(domainId: string) {
    try {
      await apiClient(`/white-label/domains/${domainId}/verify`, { method: 'POST' });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Branding</h1>
        <p className="mt-2 text-text-secondary">Customize your app's look and feel.</p>
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-background-surface rounded-card border border-border p-6 animate-pulse">
              <div className="h-5 w-48 bg-background-elevated rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">Branding</h1>
      <p className="mt-2 text-text-secondary">Customize your app's look, custom domain, and app builds.</p>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 bg-background-surface rounded-lg p-1 border border-border w-fit">
        {(['theme', 'domains', 'builds'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab ? 'bg-accent text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab === 'theme' ? 'Theme Editor' : tab === 'domains' ? 'Custom Domains' : 'App Builds'}
          </button>
        ))}
      </div>

      {/* Theme Editor */}
      {activeTab === 'theme' && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor */}
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Theme Tokens</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.primary} onChange={(e) => setForm({ ...form, primary: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <input type="text" value={form.primary} onChange={(e) => setForm({ ...form, primary: e.target.value })} className="flex-1 px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">On Primary</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.onPrimary} onChange={(e) => setForm({ ...form, onPrimary: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <input type="text" value={form.onPrimary} onChange={(e) => setForm({ ...form, onPrimary: e.target.value })} className="flex-1 px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Background</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <input type="text" value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} className="flex-1 px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Surface</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <input type="text" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} className="flex-1 px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">Font Family</label>
              <select value={form.fontFamily} onChange={(e) => setForm({ ...form, fontFamily: e.target.value })} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent">
                <option value="Inter">Inter</option>
                <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                <option value="DM Sans">DM Sans</option>
                <option value="Outfit">Outfit</option>
                <option value="Manrope">Manrope</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">App Name</label>
                <input type="text" value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" placeholder="My Ride App" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Tagline</label>
                <input type="text" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" placeholder="Move with ease" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => handleSaveTheme(false)} disabled={saving} className="px-4 py-2 bg-background-elevated text-text-primary border border-border rounded-lg text-sm font-medium hover:bg-background-surface transition-colors disabled:opacity-50">
                Save Draft
              </button>
              <button onClick={() => handleSaveTheme(true)} disabled={saving} className="px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50">
                Save & Publish
              </button>
            </div>

            {theme && (
              <p className="text-xs text-text-muted">
                Version {theme.version} · {theme.published ? 'Published' : 'Draft'} · Last saved {new Date(theme.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Preview */}
          <div className="bg-background-surface rounded-card border border-border p-6">
            <h2 className="text-lg font-heading text-text-primary mb-4">Preview</h2>
            <div className="rounded-xl overflow-hidden border border-border" style={{ backgroundColor: form.background }}>
              {/* Mock app header */}
              <div className="p-4" style={{ backgroundColor: form.surface }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: form.primary, color: form.onPrimary }}>
                    {form.appName?.[0] || 'A'}
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: form.onPrimary === '#FFFFFF' ? '#fff' : form.onPrimary }}>{form.appName || 'App Name'}</p>
                    <p className="text-xs opacity-60" style={{ color: '#A1A1AA' }}>{form.tagline || 'Your tagline here'}</p>
                  </div>
                </div>
              </div>
              {/* Mock content */}
              <div className="p-4 space-y-3">
                <div className="h-20 rounded-lg" style={{ backgroundColor: form.surface }} />
                <div className="flex gap-2">
                  <div className="flex-1 h-10 rounded-lg" style={{ backgroundColor: form.primary, opacity: 0.8 }} />
                  <div className="flex-1 h-10 rounded-lg" style={{ backgroundColor: form.surface }} />
                </div>
                <div className="h-32 rounded-lg" style={{ backgroundColor: form.surface }} />
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted text-center" style={{ fontFamily: form.fontFamily }}>
              Font: {form.fontFamily}
            </p>
          </div>
        </div>
      )}

      {/* Custom Domains */}
      {activeTab === 'domains' && (
        <div className="mt-6 space-y-6">
          <form onSubmit={handleAddDomain} className="bg-background-surface rounded-card border border-border p-6 flex gap-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="flex-1 px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
              placeholder="app.yourbrand.com"
            />
            <button type="submit" className="px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
              Add Domain
            </button>
          </form>

          <div className="space-y-3">
            {domains.length === 0 ? (
              <div className="bg-background-surface rounded-card border border-border p-6 text-center">
                <p className="text-text-muted">No custom domains configured. Your app is available at your subdomain.</p>
              </div>
            ) : (
              domains.map((d) => (
                <div key={d.id} className="bg-background-surface rounded-card border border-border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">{d.domain}</p>
                    <p className="text-xs text-text-muted">{d.type} · SSL: {d.sslStatus}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${d.verified ? 'bg-success-muted text-success' : 'bg-accent-muted text-accent'}`}>
                      {d.verified ? 'Verified' : 'Pending'}
                    </span>
                    {!d.verified && (
                      <button onClick={() => handleVerifyDomain(d.id)} className="text-xs text-accent hover:text-accent-hover">
                        Verify
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* App Builds */}
      {activeTab === 'builds' && (
        <div className="mt-6">
          <div className="bg-background-surface rounded-card border border-border p-6 text-center">
            <svg className="w-12 h-12 mx-auto text-text-muted mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
            <h3 className="text-sm font-bold text-text-primary">App Factory</h3>
            <p className="mt-1 text-xs text-text-muted">Generate dedicated native apps (iOS + Android) for your brand.</p>
            <p className="mt-1 text-xs text-text-muted">Available on Scale tier. Configure your theme and assets first.</p>
            <div className="mt-4 flex justify-center gap-3">
              <button className="px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors opacity-50" disabled>
                Build iOS App
              </button>
              <button className="px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors opacity-50" disabled>
                Build Android App
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
