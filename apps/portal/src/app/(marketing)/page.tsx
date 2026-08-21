'use client';

import Link from 'next/link';

const SERVICES = [
  { name: 'Ride hailing', desc: 'Fare estimates, live tracking, and sequential driver dispatch, ready on day one.', icon: '🚗', image: 'https://images.unsplash.com/photo-1449965408869-ebd3fee4f2ed?w=400&h=250&fit=crop' },
  { name: 'Food delivery', desc: 'Menus, modifiers, and order tracking from cart to doorstep.', icon: '🍔', image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=250&fit=crop' },
  { name: 'Groceries', desc: 'Large catalogs, substitution flows, and scheduled delivery slots.', icon: '🛒', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=250&fit=crop' },
  { name: 'Courier & parcel', desc: 'On-demand sending with photo proof of delivery and cash-on-delivery.', icon: '📦', image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=400&h=250&fit=crop' },
  { name: 'Home services', desc: 'Bookings, provider calendars, and quote flows for non-standard jobs.', icon: '🔧', image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=250&fit=crop' },
  { name: 'Payments & wallet', desc: 'One PSP abstraction, a double-entry ledger, and payouts in every region you launch.', icon: '💳', image: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=400&h=250&fit=crop' },
];

const STEPS = [
  { num: '01', title: 'Choose your modules', desc: 'Turn on rides, delivery, groceries, courier, or services like feature flags.' },
  { num: '02', title: 'Connect payments & brand it', desc: 'Pick a regional payment provider, set your colors, logo, and domain.' },
  { num: '03', title: 'Launch your branded PWA', desc: 'Every tenant gets an installable web app on their own domain the moment they go live.' },
  { num: '04', title: 'Scale to native apps', desc: 'Generate white-label iOS and Android apps for customers and drivers when you\'re ready.' },
];

const MACHINERY = [
  { title: 'Database-per-tenant', desc: 'Each tenant\'s data lives in its own isolated database, not a shared table with a filter.' },
  { title: 'Payments abstraction', desc: 'One internal interface, adapters per region: Stripe, Paystack, and more as you expand.' },
  { title: 'Real-time dispatch', desc: 'Live location, sequential offers, and tracking built for instant-dispatch marketplaces.' },
  { title: 'Branded PWA', desc: 'Installable, on your own domain, live the moment you go live — before any native build.' },
  { title: 'White-label native apps', desc: 'Store-ready iOS and Android builds generated from your theme and config.' },
  { title: 'Runtime rebranding', desc: 'The shared driver app fetches theme, logo, and enabled jobs at login — no rebuild.' },
];

const MODULE_PRICING = [
  { name: 'Ride hailing', fee: 149 },
  { name: 'Food delivery', fee: 129 },
  { name: 'Groceries', fee: 99 },
  { name: 'Courier & parcel', fee: 79 },
  { name: 'Home services', fee: 89 },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F5] text-[#1A1A1A]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold text-[#1A1A1A]">Vima</span>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#services" className="hover:text-[#1A1A1A] transition-colors">Services</a>
            <a href="#platform" className="hover:text-[#1A1A1A] transition-colors">Platform</a>
            <a href="#pricing" className="hover:text-[#1A1A1A] transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-600 hover:text-[#1A1A1A] transition-colors px-3 py-2">
              Book a demo
            </Link>
            <Link href="/signup" className="text-sm bg-[#1A1A1A] text-white px-4 py-2 rounded-full hover:bg-[#333] transition-colors">
              Try for free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <p className="text-sm text-[#E91E63] font-medium tracking-wide uppercase">White-label super-app platform</p>
        <h1 className="mt-4 text-5xl md:text-6xl font-bold leading-tight max-w-3xl">
          From signup to live app<br />in <span className="text-[#E91E63]">days</span>.
        </h1>
        <p className="mt-6 text-lg text-gray-600 max-w-xl leading-relaxed">
          Vima gives you the tenancy, payments, dispatch, and branding engine behind ride-hailing, delivery, and services apps — so you launch under your own name without building the platform yourself.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Link href="/signup" className="inline-flex items-center px-6 py-3 bg-[#E91E63] text-white rounded-full text-sm font-medium hover:bg-[#C2185B] transition-colors shadow-lg shadow-[#E91E63]/20">
            Try for free
          </Link>
          <Link href="/login" className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-full text-sm font-medium text-gray-700 hover:border-gray-500 transition-colors">
            Book a demo
          </Link>
        </div>
        <div className="mt-12 flex items-center gap-8 text-sm text-gray-500">
          <span><strong className="text-[#1A1A1A]">5</strong> service verticals</span>
          <span className="text-gray-300">|</span>
          <span><strong className="text-[#1A1A1A]">1</strong> platform core</span>
          <span className="text-gray-300">|</span>
          <span><strong className="text-[#1A1A1A]">Your brand</strong>, every screen</span>
        </div>
      </section>

      {/* Logos */}
      <section className="border-y border-gray-200 bg-white/50 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-center gap-12 text-sm font-medium text-gray-400 tracking-wider uppercase">
          <span>Northwind</span>
          <span>Coop Rides</span>
          <span>Freshline</span>
          <span>Parcelio</span>
          <span>Handy+</span>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="max-w-6xl mx-auto px-6 py-20">
        <p className="text-sm text-gray-500 uppercase tracking-wide text-center">Built for teams launching mobility, delivery, and services apps</p>
        <h2 className="mt-4 text-3xl md:text-4xl font-bold text-center">One platform. Every service you need.</h2>
        <p className="mt-4 text-gray-600 text-center max-w-2xl mx-auto">
          Turn on the verticals your customers need. Each one runs on the same shared engines for dispatch, catalogs, and payments.
        </p>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((s) => (
            <div key={s.name} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:shadow-gray-100 transition-all">
              <img src={s.image} alt={s.name} className="w-full h-36 object-cover" />
              <div className="p-6">
                <h3 className="text-lg font-bold">{s.name}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Four Steps */}
      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center">Four steps to launch.</h2>
          <p className="mt-4 text-gray-600 text-center">No custom development. Configure the platform machinery and go live.</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((step) => (
              <div key={step.num}>
                <span className="text-3xl font-bold text-[#E91E63]/30">{step.num}</span>
                <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Your Brand */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
            <img
              src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=600&fit=crop"
              alt="Mobile app on phone showing ride-hailing interface"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-lg">
                <p className="text-xs font-medium text-gray-500">Tenant: Acme Rides</p>
                <p className="text-sm font-bold text-gray-900 mt-1">Fully branded — your colors, your domain, your app</p>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-bold">Your brand, not ours.</h2>
            <p className="mt-4 text-gray-600 leading-relaxed">
              Colors, type, and logo are a single theme document. They map straight onto every native and web screen — no forked codebases per tenant.
            </p>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-[#E91E63] font-bold">•</span>
                <span className="text-sm text-gray-700"><strong>Custom domain, automatic TLS.</strong> Point a domain at your tenant and it's live and secure.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#E91E63] font-bold">•</span>
                <span className="text-sm text-gray-700"><strong>One driver app, every tenant.</strong> The shared provider app rebrands itself at runtime after a tenant-code login.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#E91E63] font-bold">•</span>
                <span className="text-sm text-gray-700"><strong>Dedicated apps when you're ready.</strong> Generate store-ready white-label iOS and Android builds on demand.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Platform Machinery */}
      <section id="platform" className="bg-[#1A1A1A] text-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center">Built on real platform machinery.</h2>
          <p className="mt-4 text-gray-400 text-center">Not a template. The infrastructure a multi-tenant marketplace actually needs.</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MACHINERY.map((m) => (
              <div key={m.title} className="bg-[#252525] rounded-2xl border border-[#333] p-6">
                <h3 className="text-base font-bold text-white">{m.title}</h3>
                <p className="mt-2 text-sm text-gray-400 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-gray-500">PCI SAQ-A posture · Tenant isolation tested in CI · Encrypted credentials at rest</p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center">Pick a tier, not a project.</h2>
        <p className="mt-4 text-gray-600 text-center">Start on a subdomain. Move to your own domain and native apps when you're ready.</p>
        <p className="mt-3 text-center"><span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium">✓ 14-day free trial on all plans</span></p>

        {/* Tier Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold">Starter</h3>
            <p className="text-sm text-gray-500 mt-1">Get live fast on a shared subdomain.</p>
            <ul className="mt-5 space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Branded customer PWA</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Shared platform provider app</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Subdomain hosting</li>
              <li className="flex items-center gap-2 text-gray-400"><span>—</span> No dedicated app factory</li>
            </ul>
            <Link href="/signup" className="mt-6 w-full inline-flex justify-center items-center px-4 py-2.5 border border-gray-300 rounded-full text-sm font-medium hover:border-gray-500 transition-colors">
              Try for free
            </Link>
          </div>

          {/* Growth (highlighted) */}
          <div className="bg-white rounded-2xl border-2 border-[#E91E63] p-6 relative shadow-lg shadow-[#E91E63]/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#E91E63] text-white text-xs font-medium px-3 py-1 rounded-full">Popular</div>
            <h3 className="text-lg font-bold">Growth</h3>
            <p className="text-sm text-gray-500 mt-1">Your own domain, unlimited modules.</p>
            <ul className="mt-5 space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Branded customer PWA</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Shared platform provider app</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Custom domain</li>
              <li className="flex items-center gap-2 text-gray-400"><span>—</span> No dedicated app factory</li>
            </ul>
            <Link href="/signup" className="mt-6 w-full inline-flex justify-center items-center px-4 py-2.5 bg-[#E91E63] text-white rounded-full text-sm font-medium hover:bg-[#C2185B] transition-colors">
              Try for free
            </Link>
          </div>

          {/* Scale */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold">Scale</h3>
            <p className="text-sm text-gray-500 mt-1">Dedicated apps, on your own store listings.</p>
            <ul className="mt-5 space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Branded PWA + dedicated iOS/Android</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Dedicated white-label provider app</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Custom domain</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> App factory, builds metered</li>
            </ul>
            <Link href="/signup" className="mt-6 w-full inline-flex justify-center items-center px-4 py-2.5 border border-gray-300 rounded-full text-sm font-medium hover:border-gray-500 transition-colors">
              Book a demo
            </Link>
          </div>
        </div>

        {/* Module Pricing */}
        <div className="mt-16 text-center">
          <h3 className="text-2xl font-bold">Pay for the modules you turn on.</h3>
          <p className="mt-3 text-gray-600 text-sm max-w-2xl mx-auto">
            Every tier starts with a base platform fee — tenancy, billing, and branding. Each additional service vertical adds its own monthly fee on top. We recommend at least two modules so the shared dispatch and payments engines pay off.
          </p>

          <div className="mt-8 inline-block">
            <p className="text-sm text-gray-500">Base platform fee <span className="text-2xl font-bold text-[#1A1A1A] ml-2">$199<span className="text-sm font-normal text-gray-500">/mo</span></span></p>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {MODULE_PRICING.map((mod) => (
              <div key={mod.name} className="bg-white rounded-xl border border-gray-200 px-5 py-4 text-center min-w-[140px]">
                <p className="text-xs text-gray-500">{mod.name}</p>
                <p className="mt-1 text-xl font-bold text-[#E91E63]">+${mod.fee}<span className="text-xs font-normal text-gray-500">/mo</span></p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-gray-400">Plus usage-based fees per completed job and per app build. Payments & wallet is included in the platform core.</p>
          <p className="mt-3 text-sm font-medium text-[#E91E63]">All plans include a 14-day free trial. No credit card required.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#1A1A1A] py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">Ready to launch your own super-app?</h2>
          <p className="mt-4 text-gray-400">Sign up and provision your tenant in minutes.</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/signup" className="px-6 py-3 bg-[#E91E63] text-white rounded-full text-sm font-medium hover:bg-[#C2185B] transition-colors shadow-lg shadow-[#E91E63]/20">
              Try for free
            </Link>
            <Link href="/login" className="px-6 py-3 border border-gray-600 text-white rounded-full text-sm font-medium hover:border-gray-400 transition-colors">
              Book a demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span className="font-bold text-[#1A1A1A]">Vima</span>
          <div className="flex items-center gap-6">
            <a href="#services">Services</a>
            <a href="#platform">Platform</a>
            <a href="#pricing">Pricing</a>
          </div>
          <span>© 2026 Vima. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
