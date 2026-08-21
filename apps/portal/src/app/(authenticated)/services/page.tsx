'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

interface ServiceCategory {
  id: string;
  parentId: string | null;
  name: string;
  iconUrl: string | null;
  sortOrder: number;
  active: boolean;
}

interface PriceCard {
  id: string;
  categoryId: string;
  name: string;
  type: 'fixed' | 'hourly' | 'quote';
  price: string | null;
  currency: string;
  minDurationHours: string | null;
  description: string | null;
}

export default function ServicesPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [priceCards, setPriceCards] = useState<PriceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'categories' | 'pricing' | 'courier'>('categories');

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', parentId: '' });

  // Price card form
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceForm, setPriceForm] = useState({
    categoryId: '',
    name: '',
    type: 'fixed' as 'fixed' | 'hourly' | 'quote',
    price: 0,
    minDurationHours: 1,
    description: '',
  });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [catRes, priceRes] = await Promise.all([
        apiClient<{ categories: ServiceCategory[] }>('/home-services/admin/categories'),
        apiClient<{ priceCards: PriceCard[] }>('/home-services/admin/price-cards'),
      ]);
      setCategories(catRes.categories || []);
      setPriceCards(priceRes.priceCards || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services configuration');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiClient('/home-services/admin/categories', {
        method: 'POST',
        body: { name: catForm.name, parentId: catForm.parentId || undefined },
      });
      setShowCatForm(false);
      setCatForm({ name: '', parentId: '' });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    }
  }

  async function handleCreatePriceCard(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiClient('/home-services/admin/price-cards', {
        method: 'POST',
        body: priceForm,
      });
      setShowPriceForm(false);
      setPriceForm({ categoryId: '', name: '', type: 'fixed', price: 0, minDurationHours: 1, description: '' });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create price card');
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Services</h1>
        <p className="mt-2 text-text-secondary">Configure courier delivery and home services.</p>
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
        <h1 className="text-2xl font-heading text-text-primary">Services</h1>
        <div className="mt-6 bg-background-surface rounded-card border border-border p-6 text-center">
          <p className="text-text-secondary">{error}</p>
          <button onClick={fetchAll} className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">Services</h1>
      <p className="mt-2 text-text-secondary">Configure courier delivery and home services.</p>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 bg-background-surface rounded-lg p-1 border border-border w-fit">
        {(['categories', 'pricing', 'courier'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab === 'categories' ? 'Service Categories' : tab === 'pricing' ? 'Price Cards' : 'Courier Config'}
          </button>
        ))}
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-heading text-text-primary">Service Categories</h2>
            <button
              onClick={() => setShowCatForm(!showCatForm)}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              {showCatForm ? 'Cancel' : 'Add Category'}
            </button>
          </div>

          {showCatForm && (
            <form onSubmit={handleCreateCategory} className="mb-6 bg-background-surface rounded-card border border-border p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={catForm.name}
                    onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    placeholder="e.g., Cleaning"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Parent Category (optional)</label>
                  <select
                    value={catForm.parentId}
                    onChange={(e) => setCatForm({ ...catForm, parentId: e.target.value })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">None (top-level)</option>
                    {categories.filter((c) => !c.parentId).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
                Create Category
              </button>
            </form>
          )}

          <div className="space-y-3">
            {categories.length === 0 ? (
              <div className="bg-background-surface rounded-card border border-border p-6 text-center">
                <p className="text-text-muted">No service categories configured yet.</p>
              </div>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="bg-background-surface rounded-card border border-border p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center">
                      <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{cat.name}</p>
                      {cat.parentId && (
                        <p className="text-xs text-text-muted">
                          Sub-category of: {categories.find((c) => c.id === cat.parentId)?.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-success-muted text-success">Active</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Price Cards Tab */}
      {activeTab === 'pricing' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-heading text-text-primary">Price Cards</h2>
            <button
              onClick={() => setShowPriceForm(!showPriceForm)}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              {showPriceForm ? 'Cancel' : 'Add Price Card'}
            </button>
          </div>

          {showPriceForm && (
            <form onSubmit={handleCreatePriceCard} className="mb-6 bg-background-surface rounded-card border border-border p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Category</label>
                  <select
                    value={priceForm.categoryId}
                    onChange={(e) => setPriceForm({ ...priceForm, categoryId: e.target.value })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    required
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Service Name</label>
                  <input
                    type="text"
                    value={priceForm.name}
                    onChange={(e) => setPriceForm({ ...priceForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    placeholder="e.g., Deep Clean"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Type</label>
                  <select
                    value={priceForm.type}
                    onChange={(e) => setPriceForm({ ...priceForm, type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="fixed">Fixed Price</option>
                    <option value="hourly">Hourly Rate</option>
                    <option value="quote">Quote Required</option>
                  </select>
                </div>
                {priceForm.type !== 'quote' && (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={priceForm.price}
                      onChange={(e) => setPriceForm({ ...priceForm, price: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    />
                  </div>
                )}
                {priceForm.type === 'hourly' && (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Min Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={priceForm.minDurationHours}
                      onChange={(e) => setPriceForm({ ...priceForm, minDurationHours: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    />
                  </div>
                )}
              </div>
              <button type="submit" className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
                Create Price Card
              </button>
            </form>
          )}

          <div className="space-y-3">
            {priceCards.length === 0 ? (
              <div className="bg-background-surface rounded-card border border-border p-6 text-center">
                <p className="text-text-muted">No price cards configured. Add categories first.</p>
              </div>
            ) : (
              priceCards.map((card) => (
                <div key={card.id} className="bg-background-surface rounded-card border border-border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">{card.name}</p>
                    <p className="text-xs text-text-muted">
                      {categories.find((c) => c.id === card.categoryId)?.name} ·{' '}
                      {card.type === 'fixed' ? `${card.currency} ${card.price}` :
                       card.type === 'hourly' ? `${card.currency} ${card.price}/hr (min ${card.minDurationHours}h)` :
                       'Quote required'}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    card.type === 'fixed' ? 'bg-success-muted text-success' :
                    card.type === 'hourly' ? 'bg-accent-muted text-accent' :
                    'bg-background-elevated text-text-muted'
                  }`}>
                    {card.type}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Courier Config Tab */}
      {activeTab === 'courier' && (
        <div className="mt-6">
          <h2 className="text-lg font-heading text-text-primary mb-4">Courier Package Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { category: 'Document', maxKg: '1 kg', base: '$3.00', perKm: '$0.80/km' },
              { category: 'Small', maxKg: '5 kg', base: '$5.00', perKm: '$1.00/km' },
              { category: 'Medium', maxKg: '15 kg', base: '$8.00', perKm: '$1.50/km' },
              { category: 'Large', maxKg: '30 kg', base: '$12.00', perKm: '$2.00/km' },
            ].map((pkg) => (
              <div key={pkg.category} className="bg-background-surface rounded-card border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-text-primary">{pkg.category}</h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-background-elevated text-text-muted">
                    Max {pkg.maxKg}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-text-secondary">
                  <p>Base fee: <span className="text-text-primary">{pkg.base}</span></p>
                  <p>Per km: <span className="text-text-primary">{pkg.perKm}</span></p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-text-muted">Package pricing is currently platform-managed. Per-tenant customization coming soon.</p>
        </div>
      )}
    </div>
  );
}
