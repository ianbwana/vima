# Feature Spec: Courier / Parcel Delivery

**Module:** `courier` (composes `logistics-core`)
**Phase:** 4 (Courier + Home Services)
**Priority:** Medium — reuses ride-hailing dispatch with parcel job type

---

## Overview

Courier reuses the ride-hailing dispatch engine with a parcel-specific job type. Key additions: sender/recipient details, package size categories, proof of delivery, and COD (cash on delivery) collection.

---

## Functional Requirements

### Customer (Sender) Flow

- [ ] Pickup address (sender) and delivery address (recipient)
- [ ] Recipient details: name, phone
- [ ] Package size category selection (affects pricing)
- [ ] Delivery instructions / special handling notes
- [ ] Price estimate before confirmation
- [ ] Live tracking of parcel
- [ ] Delivery confirmation notification with proof

### Provider (Courier) Flow

- [ ] Job offer with pickup/dropoff details and package info
- [ ] Navigate to pickup, confirm collection
- [ ] Navigate to dropoff
- [ ] Proof of delivery: photo + recipient OTP verification
- [ ] COD collection: mark cash collected amount
- [ ] Earnings per delivery

### Package Categories

| Category | Example | Max Weight |
|---|---|---|
| Document | Envelope, papers | 1 kg |
| Small | Shoebox size | 5 kg |
| Medium | Backpack size | 15 kg |
| Large | Suitcase size | 30 kg |

### COD (Cash on Delivery)

- [ ] Sender marks order as COD with amount
- [ ] Courier collects cash from recipient
- [ ] Cash logged to `cash_in_transit` ledger account
- [ ] Netted from courier earnings on payout schedule
- [ ] Auto-suspend courier if collection threshold exceeded without remittance

### Tenant Admin Configuration

- [ ] Package categories and weight limits
- [ ] Pricing rules per category (base + per km)
- [ ] COD enable/disable
- [ ] COD collection limits per courier
- [ ] Proof of delivery requirements (photo, OTP, both)

---

## Data Model (Tenant DB)

```sql
parcels (id, job_id, sender_id, recipient_name, recipient_phone,
         package_category, weight_kg, description, special_instructions,
         cod_amount, cod_collected, proof_photo_url, proof_otp_verified,
         status, created_at, delivered_at)
```

---

## Dispatch Specifics

- Same sequential offer matching as rides
- Filter: providers marked as courier-capable
- Job type: `parcel` (single pickup → single dropoff)
- Multi-stop: explicitly deferred to post-MVP

---

## Payment Settlement

```
Delivery fee from sender → ledger:
  - Debit: sender wallet/card
  - Credit: courier wallet (fee - commission)
  - Credit: tenant revenue (commission)

If COD:
  - Debit: cash_in_transit (courier owes platform)
  - Credit: sender wallet (COD amount minus any fee)
  -- Netted on payout
```

---

## Exit Criteria (Phase 4)

- Parcel sent, picked up, delivered with photo + OTP proof
- COD flow: cash collected, logged, netted from earnings
- Pricing by package category works
- Distinct from ride-hailing in job type but same dispatch pipeline
