# Requirements: Ride Hailing Module

## Overview

First vertical module built on top of the logistics-core infrastructure. Exercises the full pipeline: realtime location, dispatch/matching, job state machine, fare calculation, payment settlement, and live tracking. The module is gated behind the `rides` entitlement.

Ref: #[[file:docs/specs/04-ride-hailing.md]]

## Functional Requirements

### 1. Ride Configuration (Tenant Admin)

- 1.1 Tenant admin SHALL be able to create, update, and delete vehicle classes (name, icon, capacity, sort order).
- 1.2 Tenant admin SHALL be able to configure fare rules per zone per vehicle class (base fare, per-km rate, per-minute rate, minimum fare, surge multiplier, currency).
- 1.3 Tenant admin SHALL be able to define service zones as geofence polygons (GeoJSON).
- 1.4 All ride configuration endpoints SHALL require owner/admin role and `rides` module entitlement.

### 2. Customer Flow

- 2.1 Customer SHALL be able to get a fare estimate for a ride given pickup/dropoff coordinates and vehicle class.
- 2.2 Customer SHALL be able to request a ride providing pickup, dropoff, and vehicle class.
- 2.3 Customer SHALL receive driver match details (name, photo, vehicle, rating, ETA) upon acceptance.
- 2.4 Customer SHALL be able to track driver location in realtime via WebSocket (driver-to-pickup, then pickup-to-dropoff).
- 2.5 Customer SHALL receive a trip receipt with actual fare on completion.
- 2.6 Customer SHALL be able to rate the driver (1-5 stars + optional comment).
- 2.7 Customer SHALL be able to cancel a ride (before driver arrives).

### 3. Driver Flow

- 3.1 Driver SHALL be able to toggle online/offline status.
- 3.2 Driver SHALL receive job offers via WebSocket with accept/decline timer (15-20 seconds).
- 3.3 Driver SHALL be able to accept or decline a job offer.
- 3.4 Driver SHALL transition through trip states: arrived → started → ended.
- 3.5 Driver location SHALL be updated every 3-5 seconds while online (via API or WebSocket).
- 3.6 Driver SHALL see earnings per trip.

### 4. Dispatch & Matching

- 4.1 The system SHALL filter online providers within the pickup zone with `ride` capability.
- 4.2 The system SHALL rank candidates by straight-line distance (ETA) from pickup.
- 4.3 The system SHALL offer sequentially with a 20-second accept window per driver.
- 4.4 On no-accept, the system SHALL widen the search radius.
- 4.5 After exhausting candidates, the system SHALL expire the ride and notify the customer.
- 4.6 Dispatch SHALL use Redis GEO for proximity queries (tenant-isolated keys).

### 5. Fare Calculation

- 5.1 Estimated fare = max(baseFare + (distanceKm * perKmRate) + (durationMin * perMinRate), minimumFare) * surgeMultiplier.
- 5.2 Actual fare SHALL be recalculated on trip end using actual distance/duration.
- 5.3 Fare rules SHALL be resolved from the pickup zone and selected vehicle class.

### 6. Payment Settlement

- 6.1 On trip completion, fare SHALL be settled via the ledger: debit customer wallet, credit provider wallet (fare - commission), credit tenant revenue (commission).
- 6.2 Commission rate SHALL be configurable per tenant (default: 20%).
- 6.3 Settlement SHALL use the existing LedgerService.createTransaction() with type `'fare'`.

### 7. Realtime Infrastructure

- 7.1 The system SHALL provide WebSocket connectivity via Socket.IO with JWT authentication.
- 7.2 WebSocket rooms SHALL be tenant-isolated (room naming: `tenant:{tenantId}:ride:{jobId}`).
- 7.3 The system SHALL broadcast driver location updates to the customer during active trips.
- 7.4 The system SHALL deliver job offers to drivers via WebSocket.

### 8. Trip Track Recording

- 8.1 The system SHALL record trip track points (lat/lng/timestamp) during active trips.
- 8.2 Track data SHALL be stored per trip for post-trip display and distance calculation.

### 9. Portal — Rides Management Page

- 9.1 Tenant portal SHALL display a rides management page with vehicle classes and fare rules.
- 9.2 Portal SHALL follow existing dark theme design tokens (bg #141414, accent #FF6B3D, success #4ADE80).
- 9.3 Portal SHALL use the existing apiClient pattern for API communication.

## Non-Functional Requirements

- 10.1 All ride endpoints SHALL be gated behind `@RequireModule('rides')`.
- 10.2 Driver location updates SHALL have <100ms processing time (Redis GEO write).
- 10.3 The module SHALL emit notification events for driver assignment, arrival, and trip completion.
- 10.4 The module SHALL be compatible with future delivery dispatch (shared logistics core).
