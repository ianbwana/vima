'use client';

import { PspSetupFlow } from '../../../../components/payments/psp-setup-flow';

export default function PaymentSetupPage() {
  return (
    <div>
      <h1 className="text-2xl font-heading text-text-primary">Payment Setup</h1>
      <p className="mt-2 text-text-secondary">
        Connect a payment provider to start accepting payments from your customers.
      </p>

      <div className="mt-8">
        <PspSetupFlow />
      </div>
    </div>
  );
}
