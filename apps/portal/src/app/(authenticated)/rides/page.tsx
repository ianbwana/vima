'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';

interface VehicleClass {
  id: string;
  name: string;
  iconUrl: string | null;
  capacity: number;
  sortOrder: number;
  active: boolean;
}

interface FareRule {
  id: string;
  zoneId: string;
  vehicleClassId: string;
  baseFare: string;
  perKm: string;
  perMinute: string;
  minimumFare: string;
  surgeMultiplier: string;
  currency: string;
  commissionRate: string;
  zoneName: string;
  vehicleClassName: string;
}

interface Zone {
  id: string;
  name: string;
  active: boolean;
}

export default function RidesPage() {
  const [vehicleClasses, setVehicleClasses] = useState<VehicleClass[]>([]);
  const [fareRules, setFareRules] = useState<FareRule[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'classes' | 'fares' | 'zones'>('classes');

  // Vehicle class form
  const [showClassForm, setShowClassForm] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', capacity: 4, sortOrder: 0 });

  // Fare rule form
  const [showFareForm, setShowFareForm] = useState(false);
  const [fareForm, setFareForm] = useState({
    zoneId: '',
    vehicleClassId: '',
    baseFare: 0,
    perKm: 0,
    perMinute: 0,
    minimumFare: 0,
    surgeMultiplier: 1,
    commissionRate: 0.2,
  });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [classesRes, rulesRes, zonesRes] = await Promise.all([
        apiClient<{ vehicleClasses: VehicleClass[] }>('/rides/admin/vehicle-classes'),
        apiClient<{ fareRules: FareRule[] }>('/rides/admin/fare-rules'),
        apiClient<{ zones: Zone[] }>('/rides/admin/zones'),
      ]);
      setVehicleClasses(classesRes.vehicleClasses);
      setFareRules(rulesRes.fareRules);
      setZones(zonesRes.zones);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ride configuration');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateVehicleClass(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiClient('/rides/admin/vehicle-classes', {
        method: 'POST',
        body: classForm,
      });
      setShowClassForm(false);
      setClassForm({ name: '', capacity: 4, sortOrder: 0 });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vehicle class');
    }
  }

  async function handleDeleteVehicleClass(id: string) {
    try {
      await apiClient(`/rides/admin/vehicle-classes/${id}`, { method: 'DELETE' });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete vehicle class');
    }
  }

  async function handleCreateFareRule(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiClient('/rides/admin/fare-rules', {
        method: 'POST',
        body: fareForm,
      });
      setShowFareForm(false);
      setFareForm({
        zoneId: '',
        vehicleClassId: '',
        baseFare: 0,
        perKm: 0,
        perMinute: 0,
        minimumFare: 0,
        surgeMultiplier: 1,
        commissionRate: 0.2,
      });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create fare rule');
    }
  }

  async function handleDeleteFareRule(id: string) {
    try {
      await apiClient(`/rides/admin/fare-rules/${id}`, { method: 'DELETE' });
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete fare rule');
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Rides</h1>
        <p className="mt-2 text-text-secondary">Configure vehicle classes, fare rules, and service zones.</p>
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
        <h1 className="text-2xl font-heading text-text-primary">Rides</h1>
        <p className="mt-2 text-text-secondary">Configure vehicle classes, fare rules, and service zones.</p>
        <div className="mt-6 bg-background-surface rounded-card border border-border p-6 text-center">
          <p className="text-text-secondary">{error}</p>
          <button
            onClick={fetchAll}
            className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">Rides</h1>
      <p className="mt-2 text-text-secondary">Configure vehicle classes, fare rules, and service zones.</p>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 bg-background-surface rounded-lg p-1 border border-border w-fit">
        {(['classes', 'fares', 'zones'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab === 'classes' ? 'Vehicle Classes' : tab === 'fares' ? 'Fare Rules' : 'Zones'}
          </button>
        ))}
      </div>

      {/* Vehicle Classes Tab */}
      {activeTab === 'classes' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-heading text-text-primary">Vehicle Classes</h2>
            <button
              onClick={() => setShowClassForm(!showClassForm)}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              {showClassForm ? 'Cancel' : 'Add Class'}
            </button>
          </div>

          {showClassForm && (
            <form
              onSubmit={handleCreateVehicleClass}
              className="mb-6 bg-background-surface rounded-card border border-border p-6 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={classForm.name}
                    onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    placeholder="e.g., Economy"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Capacity</label>
                  <input
                    type="number"
                    value={classForm.capacity}
                    onChange={(e) => setClassForm({ ...classForm, capacity: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={classForm.sortOrder}
                    onChange={(e) => setClassForm({ ...classForm, sortOrder: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Create Vehicle Class
              </button>
            </form>
          )}

          <div className="space-y-3">
            {vehicleClasses.length === 0 ? (
              <div className="bg-background-surface rounded-card border border-border p-6 text-center">
                <p className="text-text-muted">No vehicle classes configured yet.</p>
              </div>
            ) : (
              vehicleClasses.map((vc) => (
                <div
                  key={vc.id}
                  className="bg-background-surface rounded-card border border-border p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-background-elevated flex items-center justify-center text-text-secondary">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{vc.name}</p>
                      <p className="text-xs text-text-muted">Capacity: {vc.capacity} · Order: {vc.sortOrder}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${vc.active ? 'bg-success-muted text-success' : 'bg-background-elevated text-text-muted'}`}>
                      {vc.active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => handleDeleteVehicleClass(vc.id)}
                      className="text-text-muted hover:text-red-400 transition-colors"
                      title="Deactivate"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Fare Rules Tab */}
      {activeTab === 'fares' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-heading text-text-primary">Fare Rules</h2>
            <button
              onClick={() => setShowFareForm(!showFareForm)}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              {showFareForm ? 'Cancel' : 'Add Rule'}
            </button>
          </div>

          {showFareForm && (
            <form
              onSubmit={handleCreateFareRule}
              className="mb-6 bg-background-surface rounded-card border border-border p-6 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Zone</label>
                  <select
                    value={fareForm.zoneId}
                    onChange={(e) => setFareForm({ ...fareForm, zoneId: e.target.value })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    required
                  >
                    <option value="">Select zone</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Vehicle Class</label>
                  <select
                    value={fareForm.vehicleClassId}
                    onChange={(e) => setFareForm({ ...fareForm, vehicleClassId: e.target.value })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    required
                  >
                    <option value="">Select class</option>
                    {vehicleClasses.map((vc) => (
                      <option key={vc.id} value={vc.id}>{vc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Base Fare</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fareForm.baseFare}
                    onChange={(e) => setFareForm({ ...fareForm, baseFare: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Per Km</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fareForm.perKm}
                    onChange={(e) => setFareForm({ ...fareForm, perKm: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Per Minute</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fareForm.perMinute}
                    onChange={(e) => setFareForm({ ...fareForm, perMinute: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Minimum</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fareForm.minimumFare}
                    onChange={(e) => setFareForm({ ...fareForm, minimumFare: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Surge Multiplier</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fareForm.surgeMultiplier}
                    onChange={(e) => setFareForm({ ...fareForm, surgeMultiplier: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Commission Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fareForm.commissionRate}
                    onChange={(e) => setFareForm({ ...fareForm, commissionRate: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-background-elevated border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                    min={0}
                    max={1}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Create Fare Rule
              </button>
            </form>
          )}

          <div className="space-y-3">
            {fareRules.length === 0 ? (
              <div className="bg-background-surface rounded-card border border-border p-6 text-center">
                <p className="text-text-muted">No fare rules configured yet. Add vehicle classes and zones first.</p>
              </div>
            ) : (
              fareRules.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-background-surface rounded-card border border-border p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-text-primary">
                        {rule.vehicleClassName} — {rule.zoneName}
                      </p>
                      <div className="mt-1 flex gap-4 text-xs text-text-muted">
                        <span>Base: {rule.currency} {rule.baseFare}</span>
                        <span>/km: {rule.perKm}</span>
                        <span>/min: {rule.perMinute}</span>
                        <span>Min: {rule.minimumFare}</span>
                        <span>Surge: {rule.surgeMultiplier}x</span>
                        <span>Commission: {(parseFloat(rule.commissionRate) * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteFareRule(rule.id)}
                      className="text-text-muted hover:text-red-400 transition-colors"
                      title="Delete rule"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Zones Tab */}
      {activeTab === 'zones' && (
        <div className="mt-6">
          <h2 className="text-lg font-heading text-text-primary mb-4">Service Zones</h2>
          <div className="space-y-3">
            {zones.length === 0 ? (
              <div className="bg-background-surface rounded-card border border-border p-6 text-center">
                <p className="text-text-muted">No service zones configured yet.</p>
              </div>
            ) : (
              zones.map((zone) => (
                <div
                  key={zone.id}
                  className="bg-background-surface rounded-card border border-border p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center">
                      <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-text-primary">{zone.name}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-success-muted text-success">
                    Active
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
