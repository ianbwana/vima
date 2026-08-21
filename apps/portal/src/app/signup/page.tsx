'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const MODULES = [
  { key: 'rides', name: 'Ride Hailing', desc: 'On-demand passenger transport', icon: '🚗', fee: 149 },
  { key: 'food', name: 'Food Delivery', desc: 'Restaurant ordering & delivery', icon: '🍔', fee: 129 },
  { key: 'groceries', name: 'Groceries', desc: 'Grocery shopping & delivery', icon: '🛒', fee: 99 },
  { key: 'courier', name: 'Courier & Parcels', desc: 'Package delivery with proof', icon: '📦', fee: 79 },
  { key: 'home_services', name: 'Home Services', desc: 'Bookings & quote flows', icon: '🔧', fee: 89 },
];

const BASE_FEE = 199;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    companyName: '',
    slug: '',
    email: '',
    password: '',
    tier: 'growth',
    modules: [] as string[],
  });

  const totalMonthly = BASE_FEE + form.modules.reduce((sum, key) => {
    const mod = MODULES.find((m) => m.key === key);
    return sum + (mod?.fee || 0);
  }, 0);

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
          name: form.companyName,
          slug: form.slug,
          tier: form.tier,
          enabledModules: form.modules,
        }),
      });
      if (!tenantRes.ok) {
        const body = await tenantRes.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to create tenant');
      }

      // 2. Register admin user on the new tenant
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': form.slug },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.companyName + ' Admin',
          role: 'owner',
        }),
      });
      if (!res.ok) {
        // Tenant created but user registration failed — still redirect to login
      }

      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-text-primary">Vima</Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-text-primary">Already have an account? Sign in</Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-text-primary">Launch your super-app</h1>
        <p className="mt-2 text-gray-600">Set up your platform in under 5 minutes. No credit card required to start.</p>

        {/* Progress */}
        <div className="mt-8 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s < step ? 'bg-accent text-text-primary' :
                s === step ? 'bg-accent text-text-primary' :
                'bg-gray-200 text-gray-500'
              }`}>{s}</div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-accent' : 'bg-gray-200'}`} />}
            </div>
          ))}
          <span className="ml-3 text-sm text-gray-500">
            {step === 1 ? 'Your business' : step === 2 ? 'Choose services' : 'Review & launch'}
          </span>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {/* Step 1: Business info */}
        {step === 1 && (
          <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h2 className="text-lg font-bold text-text-primary">Tell us about your business</h2>
            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Company name</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value, slug: generateSlug(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-text-primary focus:outline-none focus:border-green focus:ring-1 focus:ring-[#E91E63]"
                  placeholder="Acme Transport"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your subdomain</label>
                <div className="flex">
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-l-xl text-text-primary focus:outline-none focus:border-green"
                    placeholder="acme-transport"
                  />
                  <span className="px-4 py-3 bg-gray-50 border border-l-0 border-gray-200 rounded-r-xl text-gray-500 text-sm">.vima.app</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Admin email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-text-primary focus:outline-none focus:border-green focus:ring-1 focus:ring-[#E91E63]"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-text-primary focus:outline-none focus:border-green focus:ring-1 focus:ring-[#E91E63]"
                  placeholder="Choose a strong password"
                />
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!form.companyName || !form.slug || !form.email || !form.password}
              className="mt-8 w-full py-3 bg-accent text-text-primary rounded-full font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Choose modules */}
        {step === 2 && (
          <div className="mt-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h2 className="text-lg font-bold text-text-primary">Choose your services</h2>
              <p className="text-sm text-gray-500 mt-1">Each service adds to your monthly bill. Pick at least one.</p>

              <div className="mt-6 space-y-3">
                {MODULES.map((mod) => {
                  const selected = form.modules.includes(mod.key);
                  return (
                    <button
                      key={mod.key}
                      onClick={() => setForm({
                        ...form,
                        modules: selected
                          ? form.modules.filter((m) => m !== mod.key)
                          : [...form.modules, mod.key],
                      })}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                        selected ? 'border-green bg-accent/5' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{mod.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{mod.name}</p>
                          <p className="text-xs text-gray-500">{mod.desc}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green">+${mod.fee}</p>
                        <p className="text-xs text-gray-400">/month</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Running total */}
            <div className="mt-4 bg-white rounded-2xl border border-green/20 p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Estimated monthly cost</p>
                <p className="text-xs text-gray-400 mt-0.5">Base $199 + {form.modules.length} module{form.modules.length !== 1 ? 's' : ''}</p>
              </div>
              <p className="text-2xl font-bold text-green">${totalMonthly}<span className="text-sm font-normal text-gray-500">/mo</span></p>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(1)} className="px-6 py-3 border border-gray-200 rounded-full text-sm text-gray-600 hover:border-gray-400 transition-colors">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={form.modules.length === 0}
                className="flex-1 py-3 bg-accent text-text-primary rounded-full font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & launch */}
        {step === 3 && (
          <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h2 className="text-lg font-bold text-text-primary">Review & launch</h2>
            <div className="mt-6 space-y-4">
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Company</span>
                <span className="text-sm font-medium text-text-primary">{form.companyName}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">URL</span>
                <span className="text-sm text-text-primary">{form.slug}.vima.app</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Admin</span>
                <span className="text-sm text-text-primary">{form.email}</span>
              </div>
              <div className="py-3 border-b border-gray-100">
                <p className="text-sm text-gray-500 mb-2">Services</p>
                <div className="flex flex-wrap gap-2">
                  {form.modules.map((key) => {
                    const mod = MODULES.find((m) => m.key === key);
                    return (
                      <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent/5 text-green rounded-full text-xs font-medium">
                        {mod?.icon} {mod?.name} <span className="text-green/60">+${mod?.fee}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-sm font-medium text-text-primary">Monthly total</span>
                <span className="text-xl font-bold text-green">${totalMonthly}/mo</span>
              </div>
            </div>

            <p className="mt-6 text-xs text-gray-400 text-center">
              Start with a 14-day free trial. No credit card required. Cancel anytime.
            </p>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(2)} className="px-6 py-3 border border-gray-200 rounded-full text-sm text-gray-600 hover:border-gray-400 transition-colors">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-accent text-text-primary rounded-full font-medium hover:bg-accent-hover transition-colors disabled:opacity-60"
              >
                {loading ? 'Creating your platform...' : 'Launch my platform'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
