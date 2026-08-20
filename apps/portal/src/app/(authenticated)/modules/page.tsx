'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import { ToggleSwitch } from '../../../components/ui/toggle-switch';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { ToastContainer, useToast } from '../../../components/ui/toast';

interface ModuleInfo {
  key: string;
  name: string;
  description: string;
}

const MODULES: ModuleInfo[] = [
  { key: 'rides', name: 'Ride Hailing', description: 'On-demand passenger transport' },
  { key: 'food', name: 'Food Delivery', description: 'Restaurant food delivery' },
  { key: 'courier', name: 'Courier', description: 'Package delivery services' },
  { key: 'groceries', name: 'Groceries', description: 'Grocery shopping & delivery' },
  { key: 'home_services', name: 'Home Services', description: 'Home maintenance & repair' },
];

interface Entitlements {
  rides: boolean;
  food: boolean;
  groceries: boolean;
  courier: boolean;
  home_services: boolean;
  tier: string;
}

interface DisableConfirmation {
  moduleKey: string;
  moduleName: string;
}

export default function ModulesPage() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [disableConfirmation, setDisableConfirmation] = useState<DisableConfirmation | null>(null);
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    fetchEntitlements();
  }, []);

  async function fetchEntitlements() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<Entitlements>('/entitlements');
      setEntitlements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }

  const handleEnableModule = useCallback(async (moduleKey: string) => {
    if (!entitlements) return;

    const previousState = { ...entitlements };
    // Optimistically update state
    setEntitlements({ ...entitlements, [moduleKey]: true });
    setPendingToggle(moduleKey);

    try {
      await apiClient('/entitlements/enable', {
        method: 'POST',
        body: { module: moduleKey },
      });
      showToast('success', `Module enabled successfully`);
    } catch (err) {
      // Revert on failure
      setEntitlements(previousState);
      const message = err instanceof Error ? err.message : 'Failed to enable module';
      showToast('error', message);
    } finally {
      setPendingToggle(null);
    }
  }, [entitlements, showToast]);

  const handleDisableModule = useCallback(async (moduleKey: string) => {
    if (!entitlements) return;

    const previousState = { ...entitlements };
    setEntitlements({ ...entitlements, [moduleKey]: false });
    setPendingToggle(moduleKey);

    try {
      await apiClient('/entitlements/disable', {
        method: 'POST',
        body: { module: moduleKey },
      });
      showToast('success', `Module disabled successfully`);
    } catch (err) {
      // Revert on failure
      setEntitlements(previousState);
      const message = err instanceof Error ? err.message : 'Failed to disable module';
      showToast('error', message);
    } finally {
      setPendingToggle(null);
    }
  }, [entitlements, showToast]);

  function handleToggle(moduleKey: string, enabled: boolean) {
    if (!entitlements || pendingToggle) return;

    if (enabled) {
      // Enable flow: optimistically update and call API
      handleEnableModule(moduleKey);
    } else {
      // Disable flow: show confirmation dialog first
      const mod = MODULES.find((m) => m.key === moduleKey);
      setDisableConfirmation({
        moduleKey,
        moduleName: mod?.name ?? moduleKey,
      });
    }
  }

  function handleConfirmDisable() {
    if (!disableConfirmation) return;
    const { moduleKey } = disableConfirmation;
    setDisableConfirmation(null);
    handleDisableModule(moduleKey);
  }

  function handleCancelDisable() {
    setDisableConfirmation(null);
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Modules</h1>
        <p className="mt-2 text-text-secondary">Manage which services your customers can access.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((mod) => (
            <div
              key={mod.key}
              className="bg-background-surface rounded-card border border-border p-6 animate-pulse"
            >
              <div className="h-5 w-32 bg-background-elevated rounded" />
              <div className="mt-2 h-4 w-48 bg-background-elevated rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-heading text-text-primary">Modules</h1>
        <p className="mt-2 text-text-secondary">Manage which services your customers can access.</p>
        <div className="mt-6 bg-background-surface rounded-card border border-border p-6 text-center">
          <p className="text-text-secondary">{error}</p>
          <button
            onClick={fetchEntitlements}
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
      <h1 className="text-2xl font-heading text-text-primary">Modules</h1>
      <p className="mt-2 text-text-secondary">Manage which services your customers can access.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((mod) => {
          const isEnabled = entitlements ? (entitlements as Record<string, boolean>)[mod.key] ?? false : false;
          const isToggling = pendingToggle === mod.key;

          return (
            <div
              key={mod.key}
              className="bg-background-surface rounded-card border border-border p-6 flex items-start justify-between gap-4"
            >
              <div>
                <h3 className="text-sm font-bold text-text-primary">{mod.name}</h3>
                <p className="mt-1 text-sm text-text-secondary">{mod.description}</p>
              </div>
              <ToggleSwitch
                enabled={isEnabled}
                onChange={(enabled) => handleToggle(mod.key, enabled)}
                label={`Toggle ${mod.name}`}
                disabled={isToggling}
              />
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={disableConfirmation !== null}
        title="Disable Module"
        message={
          disableConfirmation
            ? `Are you sure you want to disable ${disableConfirmation.moduleName}? This will affect active services.`
            : ''
        }
        confirmLabel="Disable"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDisable}
        onCancel={handleCancelDisable}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
