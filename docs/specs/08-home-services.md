# Feature Spec: Home Services

**Module:** `home_services` (composes `booking-core`)
**Phase:** 4 (Courier + Home Services)
**Priority:** Medium — different dispatch pattern (scheduled, not instant)

---

## Overview

Home services uses a fundamentally different pattern from ride-hailing/delivery: scheduled bookings instead of instant dispatch, quote flows for non-standard jobs, and broadcast matching to qualified providers rather than nearest-first.

---

## Functional Requirements

### Customer Flow

- [ ] Browse service categories (cleaning, plumbing, electrical, beauty, etc.)
- [ ] Select service from price card (fixed or hourly rate)
- [ ] Choose available time slot
- [ ] For non-standard jobs: describe requirements → receive quotes from providers
- [ ] Accept quote → booking confirmed
- [ ] Booking tracking: confirmed → provider_en_route → in_progress → completed
- [ ] Job completion photos viewable
- [ ] Rating and review

### Provider (Technician) Flow

- [ ] Profile: skills, certifications, service area, hourly rate
- [ ] Calendar management: set available days/hours
- [ ] Receive booking broadcasts for matching categories in zone
- [ ] Accept/decline bookings
- [ ] For quote requests: submit quote with description and price
- [ ] Navigate to customer location
- [ ] Mark job stages: arrived, started, completed
- [ ] Upload completion photos
- [ ] Earnings per job

### Matching: Broadcast Model

Unlike rides (nearest-first sequential), home services uses:

1. Customer requests a time slot
2. System broadcasts to all qualified, available providers in zone
3. First N providers to accept are shown to customer (or auto-assigned)
4. For quotes: all submitted quotes shown to customer for selection

### Service Categories & Price Cards

- [ ] Tenant defines categories (hierarchical: category → sub-services)
- [ ] Each sub-service has a price card:
  - Fixed price (e.g., "AC cleaning - $50")
  - Hourly rate (e.g., "Plumber - $30/hour, minimum 1 hour")
  - Quote required (e.g., "Full home renovation - get quotes")

### Tenant Admin Configuration

- [ ] Service category management (add, edit, disable)
- [ ] Price card configuration per sub-service
- [ ] Provider qualification requirements per category
- [ ] Booking lead time (minimum hours before slot)
- [ ] Cancellation policy (hours before, fee percentage)

---

## Data Model (Tenant DB, via booking-core)

```sql
service_categories (id, parent_id, name, icon_url, sort_order, active)
service_price_cards (id, category_id, name, type [fixed|hourly|quote], price, currency, 
                    min_duration_hours, description)
provider_qualifications (id, provider_id, category_id, verified, documents [jsonb])
provider_availability (id, provider_id, day_of_week, start_time, end_time, active)
provider_availability_overrides (id, provider_id, date, available, reason)

bookings (id, customer_id, provider_id, category_id, price_card_id,
          scheduled_date, scheduled_time, duration_hours, address, location [PostGIS],
          quoted_price, final_price, status, notes, completion_photos [jsonb],
          created_at, completed_at)
booking_quotes (id, booking_id, provider_id, price, description, valid_until, status)
```

---

## Payment Settlement

```
Fixed price or hourly * duration:
  - Debit: customer wallet/card
  - Credit: provider wallet (price - commission)
  - Credit: tenant revenue (commission)
```

---

## Exit Criteria (Phase 4)

- Booking created, provider assigned via broadcast, job completed with photos
- Quote flow: request → quotes submitted → customer selects → job proceeds
- Provider calendar and availability working
- Different dispatch pattern clearly distinct from instant-dispatch modules
