# Feature Spec: Groceries

**Module:** `groceries` (extends `catalog-core` + `logistics-core`)
**Phase:** 3 (Merchant Verticals)
**Priority:** Medium — reuses food engine with specific additions

---

## Overview

Groceries reuses the food delivery engine with key differences: larger catalogs requiring bulk import, item substitutions flow, weight-based items, and (post-MVP) scheduled delivery slots.

---

## Functional Requirements

### Differences from Food Delivery

| Aspect | Food | Groceries |
|---|---|---|
| Catalog size | 20-100 items | 500-10,000+ items |
| Catalog input | Manual CRUD | CSV import + manual |
| Item types | Fixed price | Fixed + weight-based |
| Substitutions | No | Yes (picker suggests, customer approves) |
| Prep model | Kitchen prepares | Picker picks from shelves |
| Delivery timing | ASAP | ASAP + scheduled slots (post-MVP) |

### Customer Flow

- [ ] Browse store catalog with search and category filters
- [ ] Weight-based items: "approximately 1kg" with final weight adjustment
- [ ] Cart with substitution preferences per item (allow/disallow/specific alternative)
- [ ] Real-time substitution approval during picking (push notification)
- [ ] Order tracking: placed → picking → packed → dispatched → delivered

### Merchant (Store) Flow

- [ ] CSV catalog import (columns: SKU, name, category, price, unit, weight_flag, image_url)
- [ ] Bulk availability updates
- [ ] Picking interface: item list, mark found/substitute/unavailable
- [ ] Substitution proposal → wait for customer response (timeout: auto-remove)
- [ ] Mark order as packed and ready

### Provider Flow

- Same as food delivery (pickup store → deliver to customer)

### Tenant Admin

- [ ] Store onboarding with CSV template
- [ ] Commission and delivery fee config (same as food)
- [ ] Substitution timeout configuration (default: 3 minutes)

---

## Data Model Additions

```sql
-- Extends catalog_items
catalog_items.unit (enum: 'piece', 'kg', 'g', 'l', 'ml')
catalog_items.weight_based (boolean)
catalog_items.avg_weight (decimal, nullable)

-- Substitutions
order_substitutions (id, order_id, original_item_id, proposed_item_id, proposed_by,
                    status [pending|approved|rejected|timed_out], responded_at)
```

---

## Exit Criteria (Phase 3)

- CSV catalog import functional (1000+ items)
- Grocery order with substitution flow completed end-to-end
- Weight-based item pricing adjustment works
- Same delivery pipeline as food
