# Feature Spec: Ride Hailing

**Module:** `rides` (composes `logistics-core`)
**Phase:** 2 (Logistics Core + Ride Hailing)
**Priority:** High — first vertical, exercises all shared engines

---

## Overview

Ride hailing is the first instant-dispatch vertical. It exercises the full logistics pipeline: realtime location, dispatch, job state machine, fare calculation, and payment settlement. Built as a thin layer on `logistics-core`.

---

## Functional Requirements

### Customer Flow

- [ ] Pickup/dropoff selection (map pin + address search)
- [ ] Fare estimate (per vehicle class)
- [ ] Vehicle class selection
- [ ] Ride request
- [ ] Driver matching with ETA
- [ ] Live tracking (driver to pickup, then to dropoff)
- [ ] Driver details display (name, photo, vehicle, rating)
- [ ] Payment: wallet, card, or cash (toggle per tenant config)
- [ ] Trip receipt
- [ ] Rating (1-5 stars + optional comment)

### Provider (Driver) Flow

- [ ] Online/offline toggle
- [ ] Job offer with accept/decline timer (15-20 seconds)
- [ ] Navigation handoff (Google/Apple Maps deep link)
- [ ] Trip state machine: arrived → started → ended
- [ ] Earnings display per trip and cumulative

### Tenant Admin Configuration

- [ ] Vehicle classes (e.g., Economy, Comfort, XL) with capacity and icon
- [ ] Fare rules per vehicle class:
  - Base fare
  - Per km rate
  - Per minute rate
  - Minimum fare
  - Surge multiplier (manual for MVP)
- [ ] Service zones (geofence polygons via PostGIS)
- [ ] Driver onboarding: required documents list
- [ ] Document verification (admin approve/reject)

---

## Dispatch Logic (from logistics-core)

```
Job State Machine:
created → matching → offered → accepted → arriving → in_progress → completed | cancelled | expired
```

### Matching Algorithm (MVP)

1. Filter: online providers within zone and radius
2. Rank: by ETA (straight-line first pass, Distance Matrix for top N)
3. Offer: sequential with 15-20 second accept window
4. Exhaust: widen radius on no-accept
5. Expire: notify customer with retry option

---

## Data Model (Tenant DB)

```sql
vehicle_classes (id, name, icon_url, capacity, sort_order, active)
fare_rules (id, zone_id, vehicle_class_id, base_fare, per_km, per_minute, minimum, surge_multiplier, currency)
vehicles (id, provider_id, vehicle_class_id, make, model, year, plate, color, verified)
trips (id, job_id, customer_id, provider_id, vehicle_class_id, pickup_location, dropoff_location,
       estimated_fare, actual_fare, distance_km, duration_minutes, status, started_at, ended_at)
trip_tracks (id, trip_id, points [jsonb], created_at)  -- or PostGIS linestring
ratings (id, trip_id, from_user_id, to_user_id, score, comment, created_at)
```

---

## Realtime Requirements

- [ ] Driver location: updates every 3-5 seconds while online
- [ ] Redis GEOADD per tenant per city for proximity queries
- [ ] WebSocket push to customer: driver location during active trip
- [ ] WebSocket push to driver: new job offers
- [ ] Trip track recording for completed trips

---

## Fare Calculation

```
estimatedFare = max(
  baseFare + (distanceKm * perKmRate) + (durationMinutes * perMinuteRate),
  minimumFare
) * surgeMultiplier
```

- Distance/duration from Google Distance Matrix API
- Actual fare recalculated on trip end using actual route

---

## Payment Settlement (per trip)

```
Fare collected from customer → ledger transaction:
  - Debit: customer wallet (or PSP clearing if card)
  - Credit: provider wallet (fare - platform commission)
  - Credit: tenant revenue (platform commission)
  - Credit: platform fees (platform's take from tenant, if applicable)
```

---

## Exit Criteria (Phase 2)

- End-to-end paid ride on a real device
- Live tracking functional (driver to pickup to dropoff)
- Fare calculated correctly per zone rules
- Running under tenant subdomain with tenant theme applied
- Driver earnings visible in provider app
