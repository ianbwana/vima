'use client';

import { useEffect, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bgColor = toast.type === 'success' ? 'bg-success/10 border-success/30' : 'bg-red-500/10 border-red-500/30';
  const textColor = toast.type === 'success' ? 'text-success' : 'text-red-400';
  const icon = toast.type === 'success' ? '✓' : '✕';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${bgColor} shadow-lg animate-slide-in`}
    >
      <span className={`text-sm font-bold ${textColor}`}>{icon}</span>
      <p className={`text-sm ${textColor}`}>{toast.message}</p>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * Simple hook for managing toast state.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
