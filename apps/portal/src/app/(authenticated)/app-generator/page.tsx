'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

type WizardStep = 'identity' | 'features' | 'design' | 'assets' | 'sounds' | 'demo' | 'store-customer' | 'store-provider' | 'review';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'features', label: 'Features' },
  { id: 'design', label: 'Design' },
  { id: 'assets', label: 'Assets' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'demo', label: 'Try It' },
  { id: 'store-customer', label: 'Store (Customer)' },
  { id: 'store-provider', label: 'Store (Provider)' },
  { id: 'review', label: 'Review & Build' },
];

export default function AppGeneratorPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('identity');
  const [loading, setLoading] = useState(false);
  const [builds, setBuilds] = useState<any[]>([]);
  const [demoSessions, setDemoSessions] = useState<any[]>([]);

  // Form state
  const [identity, setIdentity] = useState({
    customerAppName: '',
    providerAppName: '',
    bundleIdMode: 'default',
    developerAccountMode: 'platform_managed',
    deepLinkDomain: '',
    providerEnabled: true,
  });

  const [features, setFeatures] = useState({
    enabledModules: ['rides'],
    layoutPreset: 'default',
    locales: ['en'],
    flags: {} as Record<string, boolean>,
  });

  useEffect(() => {
    fetchBuilds();
    fetchDemos();
  }, []);

  async function fetchBuilds() {
    try {
      const res = await apiClient<{ builds: any[] }>('/app-generator/customer/builds');
      setBuilds(res.builds || []);
    } catch {}
  }

  async function fetchDemos() {
    try {
      const res = await apiClient<{ sessions: any[] }>('/app-generator/demo');
      setDemoSessions(res.sessions || []);
    } catch {}
  }

  async function handleTriggerBuild(surface: 'customer' | 'provider') {
    setLoading(true);
    try {
      await apiClient(`/app-generator/${surface}/builds`, { method: 'POST', body: { surface } });
      fetchBuilds();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Build failed');
    } finally {
      setLoading(false);
    }
  }

  async function handlePublishDemo() {
    setLoading(true);
    try {
      const surfaces: string[] = ['customer'];
      if (identity.providerEnabled) surfaces.push('provider');
      await apiClient('/app-generator/demo', {
        method: 'POST',
        body: { surfaces, paired: identity.providerEnabled },
      });
      fetchDemos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Demo publish failed');
    } finally {
      setLoading(false);
    }
  }

  const currentStepIdx = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">App Generator</h1>
      <p className="mt-2 text-text-secondary">Generate native iOS and Android apps for your brand.</p>

      {/* Step indicator */}
      <div className="mt-6 flex gap-1 overflow-x-auto pb-2">
        {STEPS.map((step, idx) => (
          <button
            key={step.id}
            onClick={() => setCurrentStep(step.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              currentStep === step.id
                ? 'bg-accent text-text-primary'
                : idx < currentStepIdx
                  ? 'bg-success-muted text-success'
                  : 'bg-background-surface text-text-muted border border-border'
            }`}
          >
            {idx + 1}. {step.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="mt-6">
        {currentStep === 'identity' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Identity & Surfaces</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Customer App Name</label>
                <input type="text" value={identity.customerAppName} onChange={(e) => setIdentity({ ...identity, customerAppName: e.target.value })} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" placeholder="My Ride App" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Provider App Name</label>
                <input type="text" value={identity.providerAppName} onChange={(e) => setIdentity({ ...identity, providerAppName: e.target.value })} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" placeholder="My Ride Driver" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Deep Link Domain</label>
                <input type="text" value={identity.deepLinkDomain} onChange={(e) => setIdentity({ ...identity, deepLinkDomain: e.target.value })} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" placeholder="app.yourbrand.com" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Developer Account</label>
                <select value={identity.developerAccountMode} onChange={(e) => setIdentity({ ...identity, developerAccountMode: e.target.value })} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent">
                  <option value="platform_managed">Platform Managed</option>
                  <option value="tenant_owned">Own Developer Account (Recommended)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={identity.providerEnabled} onChange={(e) => setIdentity({ ...identity, providerEnabled: e.target.checked })} className="rounded" />
              <span className="text-sm text-text-primary">Generate Provider (Driver) App</span>
            </div>
          </div>
        )}

        {currentStep === 'features' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Features & Modules</h2>
            <p className="text-sm text-text-muted">Select which modules to include (based on your subscription).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {['rides', 'food', 'groceries', 'courier', 'home_services'].map((mod) => (
                <label key={mod} className="flex items-center gap-3 p-3 bg-background-elevated rounded-lg border border-border cursor-pointer">
                  <input type="checkbox" checked={features.enabledModules.includes(mod)} onChange={(e) => {
                    setFeatures({
                      ...features,
                      enabledModules: e.target.checked
                        ? [...features.enabledModules, mod]
                        : features.enabledModules.filter((m) => m !== mod),
                    });
                  }} className="rounded" />
                  <span className="text-sm text-text-primary capitalize">{mod.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
            {identity.providerEnabled && (
              <div className="mt-4 p-3 bg-background-elevated rounded-lg border border-border">
                <p className="text-xs text-text-muted mb-2">Derived Provider Job Types:</p>
                <div className="flex gap-2 flex-wrap">
                  {features.enabledModules.map((mod) => {
                    const jobType = { rides: 'Trips', food: 'Deliveries', groceries: 'Deliveries', courier: 'Parcels', home_services: 'Jobs' }[mod];
                    return jobType ? <span key={mod} className="text-xs px-2 py-1 rounded-full bg-accent-muted text-accent">{jobType}</span> : null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 'design' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Design</h2>
            <p className="text-sm text-text-muted">Your existing theme tokens will be applied to both apps. Review them here.</p>
            <div className="p-4 bg-background-elevated rounded-lg border border-border">
              <p className="text-sm text-text-secondary">Theme inherited from your Branding settings. Go to the Branding page to modify colors, fonts, and other design tokens.</p>
            </div>
          </div>
        )}

        {currentStep === 'assets' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Assets</h2>
            <p className="text-sm text-text-muted">Upload your app icon, splash screen, and onboarding images.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['App Icon (1024x1024)', 'Splash Screen', 'Notification Icon'].map((label) => (
                <div key={label} className="p-4 bg-background-elevated rounded-lg border border-border border-dashed text-center">
                  <svg className="w-8 h-8 mx-auto text-text-muted mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-xs text-text-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'sounds' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Sounds</h2>
            <p className="text-sm text-text-muted">Choose notification sounds for each event.</p>
            <div className="space-y-3">
              {[
                { event: 'Order Status', surface: 'Customer' },
                { event: 'Driver Arrived', surface: 'Customer' },
                { event: 'Payment Success', surface: 'Customer' },
                { event: 'Job Offer Ringtone', surface: 'Provider', required: true },
                { event: 'Job Cancelled', surface: 'Provider' },
                { event: 'Payout Confirmed', surface: 'Provider' },
              ].map((item) => (
                <div key={item.event} className="flex items-center justify-between p-3 bg-background-elevated rounded-lg border border-border">
                  <div>
                    <p className="text-sm text-text-primary">{item.event}</p>
                    <p className="text-xs text-text-muted">{item.surface} app{item.required ? ' (required)' : ''}</p>
                  </div>
                  <select className="px-3 py-1.5 bg-background-surface border border-border rounded-lg text-text-primary text-xs">
                    <option>Library: Default</option>
                    <option>Library: Chime A</option>
                    <option>Library: Alert B</option>
                    <option>Custom Upload...</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'demo' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Try It</h2>
            <p className="text-sm text-text-muted">Publish a demo to preview your apps on real devices before building.</p>
            <button onClick={handlePublishDemo} disabled={loading} className="px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50">
              {loading ? 'Publishing...' : 'Publish Demo'}
            </button>
            {demoSessions.length > 0 && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-bold text-text-primary">Active Demo Sessions</h3>
                {demoSessions.map((session: any) => (
                  <div key={session.id} className="p-3 bg-background-elevated rounded-lg border border-border flex items-center justify-between">
                    <div>
                      <p className="text-sm text-text-primary capitalize">{session.surface} App</p>
                      <p className="text-xs text-text-muted">Expires: {new Date(session.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-success-muted text-success">Active</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 p-4 bg-background-elevated rounded-lg border border-border">
              <p className="text-xs text-text-muted">Demo modes:</p>
              <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                <li>Preview Shell (Full Demo) — real push, maps, sounds, job-offer ringtone</li>
                <li>Expo Go (Look &amp; Feel) — branding and flows, limited push/location</li>
                <li>Paired Demo — customer + driver on two devices, same cohort</li>
              </ul>
            </div>
          </div>
        )}

        {currentStep === 'store-customer' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Store Listing — Customer App</h2>
            <p className="text-sm text-text-muted">Metadata for App Store and Play Store.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Short Description</label>
                <input type="text" className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" placeholder="Your go-to app for rides and deliveries" />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Full Description</label>
                <textarea rows={4} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent resize-none" placeholder="Describe your app..." />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Privacy Policy URL</label>
                <input type="url" className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" placeholder="https://yourbrand.com/privacy" />
              </div>
            </div>
          </div>
        )}

        {currentStep === 'store-provider' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Store Listing — Provider App</h2>
            <p className="text-sm text-text-muted">Additional requirements for the driver app (background location disclosures).</p>
            <div className="p-4 bg-accent-muted rounded-lg border border-accent/20">
              <p className="text-sm text-accent font-medium">Location Disclosure Required</p>
              <p className="text-xs text-text-secondary mt-1">The provider app uses background location while the driver is online or on an active job. Store submission requires disclosure artifacts.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Location Usage Justification</label>
                <textarea rows={3} className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent resize-none" placeholder="Explain why the app needs background location..." />
              </div>
            </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="bg-background-surface rounded-card border border-border p-6 space-y-5">
            <h2 className="text-lg font-heading text-text-primary">Review & Build</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-background-elevated rounded-lg border border-border">
                <h3 className="text-sm font-bold text-text-primary">Customer App</h3>
                <p className="text-xs text-text-muted mt-1">{identity.customerAppName || 'Not set'}</p>
                <p className="text-xs text-text-muted">Modules: {features.enabledModules.join(', ')}</p>
                <button onClick={() => handleTriggerBuild('customer')} disabled={loading} className="mt-3 px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 w-full">
                  {loading ? 'Building...' : 'Generate Customer App'}
                </button>
              </div>
              {identity.providerEnabled && (
                <div className="p-4 bg-background-elevated rounded-lg border border-border">
                  <h3 className="text-sm font-bold text-text-primary">Provider App</h3>
                  <p className="text-xs text-text-muted mt-1">{identity.providerAppName || 'Not set'}</p>
                  <p className="text-xs text-text-muted">Job types derived from modules</p>
                  <button onClick={() => handleTriggerBuild('provider')} disabled={loading} className="mt-3 px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 w-full">
                    {loading ? 'Building...' : 'Generate Provider App'}
                  </button>
                </div>
              )}
            </div>
            {builds.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold text-text-primary mb-3">Build History</h3>
                <div className="space-y-2">
                  {builds.slice(0, 5).map((build: any) => (
                    <div key={build.id} className="flex items-center justify-between p-3 bg-background-elevated rounded-lg border border-border">
                      <div>
                        <p className="text-xs text-text-primary">{build.config?.surface || 'customer'} — v{build.config?.manifestVersion || '?'}</p>
                        <p className="text-xs text-text-muted">{new Date(build.createdAt).toLocaleString()}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        build.status === 'succeeded' ? 'bg-success-muted text-success' :
                        build.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                        build.status === 'queued' ? 'bg-accent-muted text-accent' :
                        'bg-background-surface text-text-muted'
                      }`}>
                        {build.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => setCurrentStep(STEPS[Math.max(0, currentStepIdx - 1)].id)}
          disabled={currentStepIdx === 0}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30"
        >
          Previous
        </button>
        <button
          onClick={() => setCurrentStep(STEPS[Math.min(STEPS.length - 1, currentStepIdx + 1)].id)}
          disabled={currentStepIdx === STEPS.length - 1}
          className="px-4 py-2 bg-accent text-text-primary rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}
