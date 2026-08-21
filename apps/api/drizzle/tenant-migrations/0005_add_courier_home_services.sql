-- Migration: Add courier/parcel and home services tables (Phase 4)

-- Courier enums
CREATE TYPE package_category AS ENUM ('document', 'small', 'medium', 'large');
CREATE TYPE parcel_status AS ENUM ('pending', 'picked_up', 'in_transit', 'delivered', 'cancelled');

-- Home services enums
CREATE TYPE price_card_type AS ENUM ('fixed', 'hourly', 'quote');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'provider_en_route', 'in_progress', 'completed', 'cancelled');
CREATE TYPE quote_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- Parcels (courier deliveries)
CREATE TABLE parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  sender_id UUID NOT NULL REFERENCES users(id),
  provider_id UUID REFERENCES providers(id),
  recipient_name VARCHAR(255) NOT NULL,
  recipient_phone VARCHAR(50) NOT NULL,
  package_category package_category NOT NULL,
  weight_kg DECIMAL(6, 2),
  description TEXT,
  special_instructions TEXT,
  pickup_address TEXT NOT NULL,
  pickup_lat DECIMAL(10, 7) NOT NULL,
  pickup_lng DECIMAL(10, 7) NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat DECIMAL(10, 7) NOT NULL,
  dropoff_lng DECIMAL(10, 7) NOT NULL,
  estimated_fee DECIMAL(10, 2),
  actual_fee DECIMAL(10, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  cod_amount DECIMAL(10, 2),
  cod_collected BOOLEAN NOT NULL DEFAULT false,
  proof_photo_url TEXT,
  proof_otp_verified BOOLEAN NOT NULL DEFAULT false,
  status parcel_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP
);

CREATE INDEX idx_parcels_sender ON parcels(sender_id);
CREATE INDEX idx_parcels_provider ON parcels(provider_id);
CREATE INDEX idx_parcels_status ON parcels(status);

-- Service categories (hierarchical: cleaning > deep cleaning, window cleaning, etc.)
CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID,
  name VARCHAR(255) NOT NULL,
  icon_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_categories_parent ON service_categories(parent_id);

-- Service price cards (fixed, hourly, or quote-required)
CREATE TABLE service_price_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES service_categories(id),
  name VARCHAR(255) NOT NULL,
  type price_card_type NOT NULL,
  price DECIMAL(10, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  min_duration_hours DECIMAL(4, 1),
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_price_cards_category ON service_price_cards(category_id);

-- Provider qualifications per service category
CREATE TABLE provider_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  category_id UUID NOT NULL REFERENCES service_categories(id),
  verified BOOLEAN NOT NULL DEFAULT false,
  documents JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_provider_qualifications_unique ON provider_qualifications(provider_id, category_id);

-- Provider weekly availability slots
CREATE TABLE provider_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_provider_availability_provider ON provider_availability(provider_id);

-- Bookings (scheduled home service jobs)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  provider_id UUID REFERENCES providers(id),
  category_id UUID NOT NULL REFERENCES service_categories(id),
  price_card_id UUID REFERENCES service_price_cards(id),
  scheduled_date VARCHAR(10) NOT NULL,
  scheduled_time VARCHAR(5) NOT NULL,
  duration_hours DECIMAL(4, 1),
  address TEXT,
  location_lat DECIMAL(10, 7),
  location_lng DECIMAL(10, 7),
  quoted_price DECIMAL(10, 2),
  final_price DECIMAL(10, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status booking_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  completion_photos JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_provider ON bookings(provider_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_date ON bookings(scheduled_date);

-- Booking quotes (from providers for quote-type services)
CREATE TABLE booking_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  provider_id UUID NOT NULL REFERENCES providers(id),
  price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  valid_until TIMESTAMP,
  status quote_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_quotes_booking ON booking_quotes(booking_id);
