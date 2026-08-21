-- Migration: Add catalog, merchant, and order tables for food delivery and groceries.
-- Shared catalog-core infrastructure used by both food and grocery modules.

-- Enums
CREATE TYPE merchant_status AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE order_status AS ENUM ('placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled', 'refunded');
CREATE TYPE catalog_item_unit AS ENUM ('piece', 'kg', 'g', 'l', 'ml');
CREATE TYPE substitution_status AS ENUM ('pending', 'approved', 'rejected', 'timed_out');
CREATE TYPE delivery_fee_type AS ENUM ('flat', 'distance_based', 'free_above');

-- Merchants (restaurants, grocery stores, etc.)
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url TEXT,
  cover_url TEXT,
  address TEXT,
  location_lat DECIMAL(10, 7),
  location_lng DECIMAL(10, 7),
  zone_id UUID REFERENCES zones(id),
  category VARCHAR(100),
  commission_rate DECIMAL(4, 2) NOT NULL DEFAULT 0.15,
  status merchant_status NOT NULL DEFAULT 'pending',
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_zone ON merchants(zone_id);
CREATE INDEX idx_merchants_status ON merchants(status);
CREATE INDEX idx_merchants_user ON merchants(user_id);

-- Merchant operating hours
CREATE TABLE merchant_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time VARCHAR(5) NOT NULL,
  close_time VARCHAR(5) NOT NULL
);

CREATE INDEX idx_merchant_hours_merchant ON merchant_hours(merchant_id);

-- Catalogs (menu categories)
CREATE TABLE catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalogs_merchant ON catalogs(merchant_id);

-- Catalog items (menu items / products)
CREATE TABLE catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES catalogs(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  available BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  unit catalog_item_unit DEFAULT 'piece',
  weight_based BOOLEAN NOT NULL DEFAULT false,
  avg_weight DECIMAL(6, 3),
  sku VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_items_catalog ON catalog_items(catalog_id);
CREATE INDEX idx_catalog_items_available ON catalog_items(catalog_id, available);

-- Modifier groups (e.g., "Size", "Extras")
CREATE TABLE modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id),
  name VARCHAR(255) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_modifier_groups_item ON modifier_groups(catalog_item_id);

-- Modifiers (individual options within a group)
CREATE TABLE modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id),
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  available BOOLEAN NOT NULL DEFAULT true
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  job_id UUID REFERENCES jobs(id),
  status order_status NOT NULL DEFAULT 'placed',
  subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  commission_amount DECIMAL(10, 2),
  tip DECIMAL(10, 2) DEFAULT 0.00,
  total DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  delivery_address TEXT,
  delivery_lat DECIMAL(10, 7),
  delivery_lng DECIMAL(10, 7),
  notes TEXT,
  placed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  prepared_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_merchant ON orders(merchant_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Order items (snapshot of what was ordered)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id),
  name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  modifiers JSONB,
  subtotal DECIMAL(10, 2) NOT NULL,
  actual_weight DECIMAL(6, 3),
  substitution_allowed BOOLEAN DEFAULT true
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Grocery substitutions
CREATE TABLE order_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  original_item_id UUID NOT NULL REFERENCES catalog_items(id),
  proposed_item_id UUID REFERENCES catalog_items(id),
  proposed_by UUID REFERENCES users(id),
  status substitution_status NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_substitutions_order ON order_substitutions(order_id);

-- Delivery fee configuration per zone
CREATE TABLE delivery_fee_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES zones(id),
  fee_type delivery_fee_type NOT NULL DEFAULT 'flat',
  flat_fee DECIMAL(10, 2) DEFAULT 0.00,
  per_km_rate DECIMAL(10, 2) DEFAULT 0.00,
  free_above_threshold DECIMAL(10, 2),
  minimum_order_amount DECIMAL(10, 2) DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
