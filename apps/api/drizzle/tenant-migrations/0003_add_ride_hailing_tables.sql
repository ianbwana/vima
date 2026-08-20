-- Migration: Add ride-hailing tables
-- Vehicle classes, fare rules, trips, and trip track recording.

-- Enum for trip lifecycle
CREATE TYPE trip_status AS ENUM (
  'requested', 'matching', 'offered', 'accepted',
  'arriving', 'arrived', 'in_progress',
  'completed', 'cancelled', 'expired'
);

-- Vehicle classes (Economy, Comfort, XL, etc.)
CREATE TABLE vehicle_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  icon_url TEXT,
  capacity INTEGER NOT NULL DEFAULT 4,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Fare rules per zone per vehicle class
CREATE TABLE fare_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES zones(id),
  vehicle_class_id UUID NOT NULL REFERENCES vehicle_classes(id),
  base_fare DECIMAL(10, 2) NOT NULL,
  per_km DECIMAL(10, 2) NOT NULL,
  per_minute DECIMAL(10, 2) NOT NULL,
  minimum_fare DECIMAL(10, 2) NOT NULL,
  surge_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  commission_rate DECIMAL(4, 2) NOT NULL DEFAULT 0.20,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_fare_rules_zone_vehicle ON fare_rules(zone_id, vehicle_class_id);

-- Trips (ride-hailing specific, references jobs for shared logistics)
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  provider_id UUID REFERENCES providers(id),
  vehicle_class_id UUID NOT NULL REFERENCES vehicle_classes(id),
  zone_id UUID REFERENCES zones(id),
  status trip_status NOT NULL DEFAULT 'requested',
  pickup_lat DECIMAL(10, 7) NOT NULL,
  pickup_lng DECIMAL(10, 7) NOT NULL,
  pickup_address TEXT,
  dropoff_lat DECIMAL(10, 7) NOT NULL,
  dropoff_lng DECIMAL(10, 7) NOT NULL,
  dropoff_address TEXT,
  estimated_fare DECIMAL(10, 2),
  actual_fare DECIMAL(10, 2),
  estimated_distance_km DECIMAL(10, 2),
  estimated_duration_min DECIMAL(10, 2),
  actual_distance_km DECIMAL(10, 2),
  actual_duration_min DECIMAL(10, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  surge_multiplier DECIMAL(4, 2) DEFAULT 1.00,
  commission_rate DECIMAL(4, 2),
  payment_method VARCHAR(20) DEFAULT 'wallet',
  metadata JSONB,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  arrived_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancelled_by UUID,
  cancellation_reason TEXT
);

CREATE INDEX idx_trips_customer ON trips(customer_id);
CREATE INDEX idx_trips_provider ON trips(provider_id);
CREATE INDEX idx_trips_status ON trips(status);

-- Trip track points (GPS breadcrumbs during active trips)
CREATE TABLE trip_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id),
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trip_tracks_trip_id ON trip_tracks(trip_id);
CREATE INDEX idx_trip_tracks_recorded_at ON trip_tracks(trip_id, recorded_at);
