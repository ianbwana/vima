# Feature Spec: Food Delivery

**Module:** `food` (composes `catalog-core` + `logistics-core`)
**Phase:** 3 (Merchant Verticals)
**Priority:** High — second vertical, exercises catalog + delivery pipeline

---

## Overview

Food delivery combines the catalog engine (merchants, menus, orders) with the logistics engine (delivery dispatch). It introduces the merchant persona and the three-sided marketplace dynamic (customer → merchant → delivery provider).

---

## Functional Requirements

### Customer Flow

- [ ] Browse restaurants by zone (filterable by cuisine, rating, delivery time)
- [ ] Restaurant menu with categories
- [ ] Item modifiers (size, extras, special instructions)
- [ ] Cart management (multi-item, single restaurant per cart)
- [ ] Checkout with delivery address, payment method, tip option
- [ ] Order tracking states: placed → accepted → preparing → picked_up → delivered
- [ ] Delivery fee display (per tenant config)
- [ ] Rating: restaurant + delivery separately

### Merchant Flow

- [ ] Menu CRUD: categories, items, modifiers, pricing
- [ ] Item availability toggle (out of stock)
- [ ] Order acceptance with prep-time estimate
- [ ] Mark order as "ready for pickup"
- [ ] Operating hours and holiday schedule
- [ ] Order history and settlement reports

### Provider (Delivery) Flow

- [ ] Delivery job offers (dispatched after merchant accepts or after prep-time threshold)
- [ ] Pickup confirmation at restaurant
- [ ] Drop-off confirmation with optional photo
- [ ] Earnings per delivery

### Tenant Admin Configuration

- [ ] Merchant onboarding (invite link or self-signup)
- [ ] Commission rates (percentage of order subtotal)
- [ ] Delivery fee configuration:
  - Flat fee
  - Distance-based tiers
  - Free delivery threshold
- [ ] Delivery radius per zone
- [ ] Minimum order amount

---

## Dispatch Specifics (Food Delivery)

- Dispatch delay: triggered when merchant accepts OR at estimated prep-time minus pickup ETA
- Provider matching: same as ride-hailing but filtered to delivery-capable providers
- Job type: `delivery_leg` (pickup merchant → drop customer)

---

## Data Model (Tenant DB, via catalog-core)

```sql
merchants (id, name, description, logo_url, cover_url, address, location [PostGIS],
           zone_id, category, commission_rate, status, created_at)
merchant_hours (id, merchant_id, day_of_week, open_time, close_time)
catalogs (id, merchant_id, name, sort_order)
catalog_items (id, catalog_id, name, description, image_url, price, currency,
              available, sort_order, created_at)
modifier_groups (id, catalog_item_id, name, required, min_select, max_select)
modifiers (id, modifier_group_id, name, price, available)

orders (id, customer_id, merchant_id, job_id, status, subtotal, delivery_fee,
        commission_amount, tip, total, delivery_address, notes, placed_at, delivered_at)
order_items (id, order_id, catalog_item_id, name, quantity, unit_price, modifiers [jsonb], subtotal)
```

---

## Payment Settlement (per order)

```
Order total collected from customer → ledger transaction:
  - Debit: customer wallet (or PSP clearing)
  - Credit: merchant wallet (subtotal - commission)
  - Credit: provider wallet (delivery fee - platform cut)
  - Credit: tenant revenue (commission + delivery platform cut)
  - Credit (optional): tip → provider wallet (pass-through)
```

---

## Exit Criteria (Phase 3)

- Food order placed, accepted by merchant, delivered by provider, settled
- Merchant portal functional: menu management, order acceptance
- Delivery dispatch integrated with logistics-core
- Commission and fees calculated correctly
- Customer order tracking shows all states
