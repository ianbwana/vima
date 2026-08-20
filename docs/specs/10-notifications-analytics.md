# Feature Spec: Notifications & Analytics

**Module:** `notifications`, `analytics-events`
**Phase:** 0-2 (Progressive, cross-cutting)
**Priority:** Medium — required by all verticals but not standalone

---

## Overview

Cross-cutting services for push notifications, SMS/email delivery, and per-tenant analytics. These are consumed by all verticals rather than being standalone features.

---

## Notifications

### Channels

| Channel | Provider | Use Case |
|---|---|---|
| Push (mobile) | FCM | Trip updates, order status, job offers |
| Push (web) | FCM Web Push | PWA order/trip status |
| SMS | Twilio, Africa's Talking | OTP, critical alerts, iOS fallback |
| WhatsApp | Twilio/Meta API | OTP alternative, delivery updates |
| Email | Resend or SES | Invoices, password reset, onboarding |

### Requirements

- [ ] Pluggable provider per channel per tenant region
- [ ] Template system with tenant branding (logo, colors in emails)
- [ ] Delivery preference: tenant configures primary + fallback per event type
- [ ] Rate limiting per user per channel
- [ ] Delivery status tracking (sent, delivered, failed, opened for email)
- [ ] Quiet hours configuration per tenant

### Event-to-Notification Mapping (Examples)

| Event | Customer | Provider | Merchant |
|---|---|---|---|
| ride.driver_assigned | Push: "Driver on the way" | — | — |
| ride.arrived | Push + SMS | — | — |
| order.placed | Push: "Order confirmed" | — | Push: "New order!" |
| order.ready | — | Push: "Pickup ready" | — |
| delivery.completed | Push: "Delivered!" | Push: "Earnings +$X" | — |
| job.offer | — | Push: "New job nearby" | — |
| payout.completed | — | Push: "Payout sent" | Push: "Settlement sent" |

---

## Analytics

### Per-Tenant Dashboard Metrics

- [ ] Orders/trips: total, completed, cancelled, completion rate
- [ ] GMV (gross merchandise value) over time
- [ ] Active providers (online hours, jobs completed)
- [ ] Active customers (ordering frequency)
- [ ] Average delivery/trip time
- [ ] Payment method breakdown
- [ ] Top merchants by GMV (food/grocery)

### Technical Approach

- [ ] Events emitted to Redis Streams from all modules
- [ ] Per-tenant aggregation worker (BullMQ) computes daily rollups
- [ ] Rollup tables in tenant DB for fast dashboard queries
- [ ] Cross-tenant platform analytics: nightly ELT to ClickHouse/BigQuery
- [ ] No real-time cross-tenant queries on tenant DBs

### Data Model

```sql
-- Tenant DB
analytics_daily (id, date, metric, dimension, dimension_value, value, created_at)

-- Example rows:
-- (date: 2025-01-15, metric: 'orders_completed', dimension: 'module', dimension_value: 'food', value: 47)
-- (date: 2025-01-15, metric: 'gmv', dimension: 'module', dimension_value: 'rides', value: 2340.50)
```

---

## Exit Criteria

- Push notification delivered on trip/order status change
- SMS OTP delivery functional via at least one provider
- Tenant dashboard shows basic metrics (orders, GMV, active providers)
- Per-tenant event isolation (no cross-tenant data leakage)
