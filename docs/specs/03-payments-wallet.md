# Feature Spec: Payments & Wallet

**Module:** `payments`
**Phase:** 1 (Payments Core)
**Priority:** Critical — required for all monetized transactions

---

## Overview

The payments module provides a unified interface to multiple regional PSPs, a double-entry internal ledger, user wallets, P2P transfers, provider/merchant payouts, and handles the complexity of cash-based markets.

---

## Functional Requirements

### PSP Abstraction Layer

- [ ] Single internal interface (`PspAdapter`), one implementation per provider
- [ ] No vertical module ever imports a PSP SDK directly
- [ ] Webhooks normalized to internal events before consumption
- [ ] Tenant PSP connection flow with test-transaction verification

### Supported PSPs (Build Order)

1. **Stripe** — Europe, US, GCC (validate GCC availability)
2. **Paystack** — Africa (NG, GH, KE, ZA)
3. **Xendit** — Southeast Asia (ID, PH)
4. **Mercado Pago** — South America (AR, BR, MX)

### Wallet (Double-Entry Ledger)

- [ ] Every balance is the sum of ledger entries, never a mutable column
- [ ] Ledger accounts: customer_wallet, provider_wallet, merchant_wallet, tenant_revenue, platform_fees, psp_clearing, cash_in_transit
- [ ] DB constraints enforce balanced transactions (sum of entries = 0)
- [ ] Append-only entries, no mutations
- [ ] Daily reconciliation job against PSP settlement reports

### Money Movement Types

| Flow | Description |
|---|---|
| C2B Payment | Card/local method via tenant's PSP; cash toggle per module |
| Wallet Top-up | Card charge → credit customer wallet |
| P2P Transfer | Debit sender wallet → credit recipient wallet (within tenant) |
| Provider Earnings | Fare/commission split → credit provider wallet |
| Provider Payout | Debit provider wallet → PSP transfer to bank |
| Merchant Settlement | Order revenue - commission → credit merchant wallet |
| Merchant Payout | Debit merchant wallet → PSP transfer to bank |
| Refund | Admin-initiated → refund to source or wallet credit |
| Cash Trip | Cash-in-transit account, netted from driver earnings |

### Platform Billing (Billing Tenants)

- [ ] Stripe Billing for subscription management
- [ ] Metered usage events pushed nightly
- [ ] Dunning flow: grace → read-only → suspension

---

## Data Model (Tenant DB)

```sql
ledger_accounts (id, user_id, type, currency, created_at)
ledger_transactions (id, type, reference_id, description, created_at)
ledger_entries (id, transaction_id, account_id, amount, direction [debit|credit], created_at)
  -- CONSTRAINT: sum of entries per transaction = 0

payments (id, user_id, psp_provider, psp_reference, amount, currency, status, created_at)
payouts (id, user_id, psp_provider, psp_reference, amount, currency, status, scheduled_at, completed_at)
refunds (id, payment_id, amount, reason, status, created_at)
```

---

## Webhook Handling

- [ ] Dedicated webhook ingress service (isolated for security)
- [ ] Signature verification per PSP provider
- [ ] Normalize to internal events: `payment.succeeded`, `payment.failed`, `payout.succeeded`, `payout.failed`, `refund.succeeded`
- [ ] Idempotency: deduplicate by provider event ID
- [ ] Retry with exponential backoff on processing failure

---

## Security & Compliance

- [ ] PCI SAQ-A: client-side tokenization only, no card data touches our servers
- [ ] PSP credentials envelope-encrypted per tenant (Cloud KMS)
- [ ] Credentials decrypted only in payments module memory, never logged
- [ ] Wallet regulatory note: closed-loop prepaid credit, per-market legal review before P2P

---

## Exit Criteria (Phase 1)

- Tenant connects Stripe or Paystack successfully
- Customer tops up wallet via card
- P2P wallet transfer completes with balanced ledger entries
- Tenant receives platform invoice via Stripe Billing
- Webhook processing functional for payment.succeeded
