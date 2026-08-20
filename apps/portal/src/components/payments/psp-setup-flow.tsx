'use client';

import { useState } from 'react';
import { apiClient } from '../../lib/api-client';

type PspProvider = 'stripe' | 'paystack';

type Step = 'select-provider' | 'credentials' | 'verifying' | 'result';

interface VerificationResult {
  success: boolean;
  provider: PspProvider;
  error?: string;
}

interface StripeCredentials {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

interface PaystackCredentials {
  secretKey: string;
  publicKey: string;
}

export function PspSetupFlow() {
  const [step, setStep] = useState<Step>('select-provider');
  const [provider, setProvider] = useState<PspProvider | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  function handleProviderSelect(selected: PspProvider) {
    setProvider(selected);
    setStep('credentials');
  }

  function handleBack() {
    if (step === 'credentials') {
      setStep('select-provider');
    }
  }

  async function handleSubmit(credentials: Record<string, string>) {
    if (!provider) return;

    setStep('verifying');
    try {
      await apiClient('/psp-connections', {
        method: 'POST',
        body: { provider, credentials },
      });
      setResult({ success: true, provider });
    } catch (err) {
      setResult({
        success: false,
        provider,
        error: err instanceof Error ? err.message : 'Verification failed. Please check your credentials.',
      });
    }
    setStep('result');
  }

  function handleRetry() {
    setResult(null);
    setStep('credentials');
  }

  return (
    <div className="mx-auto max-w-lg">
      {step === 'select-provider' && (
        <ProviderSelection onSelect={handleProviderSelect} />
      )}
      {step === 'credentials' && provider && (
        <CredentialForm
          provider={provider}
          onSubmit={handleSubmit}
          onBack={handleBack}
        />
      )}
      {step === 'verifying' && <VerifyingState />}
      {step === 'result' && result && (
        <ResultState result={result} onRetry={handleRetry} />
      )}
    </div>
  );
}

/* ─── Step 1: Provider Selection ─────────────────────────────────── */

function ProviderSelection({ onSelect }: { onSelect: (p: PspProvider) => void }) {
  const [selected, setSelected] = useState<PspProvider | null>(null);

  return (
    <div>
      <h2 className="text-xl font-heading text-text-primary">Connect Payment Provider</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Choose a payment service provider to start accepting payments.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setSelected('stripe')}
          className={`bg-background-surface rounded-card border p-6 text-left transition-colors ${
            selected === 'stripe'
              ? 'border-accent'
              : 'border-border hover:border-text-muted'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background-elevated">
            <span className="text-lg font-bold text-text-secondary">S</span>
          </div>
          <p className="mt-3 text-sm font-medium text-text-primary">Stripe</p>
          <p className="mt-1 text-xs text-text-secondary">
            Cards, wallets, bank transfers
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSelected('paystack')}
          className={`bg-background-surface rounded-card border p-6 text-left transition-colors ${
            selected === 'paystack'
              ? 'border-accent'
              : 'border-border hover:border-text-muted'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background-elevated">
            <span className="text-lg font-bold text-text-secondary">P</span>
          </div>
          <p className="mt-3 text-sm font-medium text-text-primary">Paystack</p>
          <p className="mt-1 text-xs text-text-secondary">
            Africa: NG, GH, KE, ZA
          </p>
        </button>
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
        className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}

/* ─── Step 2: Credential Form ────────────────────────────────────── */

function CredentialForm({
  provider,
  onSubmit,
  onBack,
}: {
  provider: PspProvider;
  onSubmit: (credentials: Record<string, string>) => void;
  onBack: () => void;
}) {
  const isStripe = provider === 'stripe';

  const [fields, setFields] = useState<Record<string, string>>(
    isStripe
      ? { secretKey: '', publishableKey: '', webhookSecret: '' }
      : { secretKey: '', publicKey: '' },
  );

  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  function toggleVisibility(field: string) {
    setVisibility((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  function handleChange(field: string, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }));
  }

  const allFilled = Object.values(fields).every((v) => v.trim().length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (allFilled) {
      onSubmit(fields);
    }
  }

  const fieldConfigs = isStripe
    ? [
        { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_live_...' },
        { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_live_...' },
        { key: 'webhookSecret', label: 'Webhook Secret', placeholder: 'whsec_...' },
      ]
    : [
        { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_live_...' },
        { key: 'publicKey', label: 'Public Key', placeholder: 'pk_live_...' },
      ];

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>

      <h2 className="text-xl font-heading text-text-primary">
        {isStripe ? 'Stripe' : 'Paystack'} Credentials
      </h2>
      <p className="mt-2 text-sm text-text-secondary">
        Enter your {isStripe ? 'Stripe' : 'Paystack'} API credentials. These will be encrypted and stored securely.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {fieldConfigs.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label htmlFor={key} className="block text-sm text-text-secondary">
              {label}
            </label>
            <div className="relative mt-1">
              <input
                id={key}
                type={visibility[key] ? 'text' : 'password'}
                value={fields[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-border bg-background-elevated px-3 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => toggleVisibility(key)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                aria-label={visibility[key] ? 'Hide' : 'Show'}
              >
                {visibility[key] ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ))}

        <button
          type="submit"
          disabled={!allFilled}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Connect {isStripe ? 'Stripe' : 'Paystack'}
        </button>
      </form>
    </div>
  );
}

/* ─── Step 3: Verifying ──────────────────────────────────────────── */

function VerifyingState() {
  return (
    <div className="flex flex-col items-center py-12">
      {/* Spinner */}
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-accent" />
      <h2 className="mt-6 text-lg font-heading text-text-primary">Verifying Connection</h2>
      <p className="mt-2 text-sm text-text-secondary text-center">
        We&apos;re validating your credentials with the payment provider. This may take a few seconds.
      </p>
    </div>
  );
}

/* ─── Step 4: Result ─────────────────────────────────────────────── */

function ResultState({
  result,
  onRetry,
}: {
  result: VerificationResult;
  onRetry: () => void;
}) {
  if (result.success) {
    return (
      <div className="flex flex-col items-center py-12">
        {/* Success icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-muted">
          <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="mt-6 text-lg font-heading text-text-primary">Connection Verified</h2>
        <p className="mt-2 text-sm text-text-secondary text-center">
          {result.provider === 'stripe' ? 'Stripe' : 'Paystack'} has been successfully connected and verified.
        </p>

        <div className="mt-6 w-full rounded-card border border-border bg-background-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-elevated">
              <span className="text-sm font-bold text-text-secondary">
                {result.provider === 'stripe' ? 'S' : 'P'}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {result.provider === 'stripe' ? 'Stripe' : 'Paystack'}
              </p>
              <p className="text-xs text-success">Verified</p>
            </div>
          </div>
        </div>

        <a
          href="/payments"
          className="mt-6 w-full inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Go to Payments
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-12">
      {/* Error icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h2 className="mt-6 text-lg font-heading text-text-primary">Connection Failed</h2>
      <p className="mt-2 text-sm text-text-secondary text-center">
        {result.error || 'Unable to verify credentials with the payment provider.'}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Retry
      </button>
    </div>
  );
}
