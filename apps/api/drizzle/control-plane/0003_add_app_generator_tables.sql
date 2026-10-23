-- Migration: Add app generator tables (Phase A)
-- App projects, endpoints, key grants, build manifests, assets, demos, sounds, updates.

DO $$ BEGIN
  CREATE TYPE app_surface AS ENUM ('customer', 'provider');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE app_environment AS ENUM ('production', 'preview', 'demo');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE credential_mode AS ENUM ('platform_managed', 'tenant_owned');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE key_type AS ENUM ('google_maps', 'firebase', 'psp_publishable', 'sentry', 'mapbox');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE moderation_status AS ENUM ('pending', 'approved', 'flagged', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE smoke_status AS ENUM ('pending', 'running', 'passed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE store_status AS ENUM ('not_submitted', 'submitted', 'in_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- App projects (one per tenant per surface per platform)
CREATE TABLE IF NOT EXISTS app_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  surface app_surface NOT NULL,
  platform app_build_platform NOT NULL,
  bundle_id VARCHAR(255) NOT NULL,
  eas_project_id VARCHAR(255),
  credential_mode credential_mode NOT NULL DEFAULT 'platform_managed',
  store_listing_state JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_projects_tenant ON app_projects(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_projects_unique ON app_projects(tenant_id, surface, platform);

-- Tenant endpoint documents per environment
CREATE TABLE IF NOT EXISTS tenant_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  environment app_environment NOT NULL,
  endpoint_document JSONB NOT NULL,
  domain_state VARCHAR(50),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_endpoints_unique ON tenant_endpoints(tenant_id, environment);

-- Client-safe key grants
CREATE TABLE IF NOT EXISTS app_key_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  app_project_id UUID REFERENCES app_projects(id),
  key_type key_type NOT NULL,
  environment app_environment NOT NULL,
  vendor_ref VARCHAR(255),
  restriction_state VARCHAR(50),
  encrypted_value TEXT,
  rotated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_key_grants_tenant ON app_key_grants(tenant_id);

-- Build manifests (immutable, versioned per surface)
CREATE TABLE IF NOT EXISTS build_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  surface app_surface NOT NULL,
  version INTEGER NOT NULL,
  manifest JSONB NOT NULL,
  asset_pack_hash VARCHAR(64),
  codebase_sha VARCHAR(40),
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_build_manifests_tenant ON build_manifests(tenant_id, surface);
CREATE UNIQUE INDEX IF NOT EXISTS idx_build_manifests_version ON build_manifests(tenant_id, surface, version);

-- Asset records (uploads + generated packs)
CREATE TABLE IF NOT EXISTS asset_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  kind VARCHAR(50) NOT NULL,
  surface_variant VARCHAR(20) NOT NULL DEFAULT 'shared',
  original_url TEXT NOT NULL,
  original_hash VARCHAR(64) NOT NULL,
  pack_hash VARCHAR(64),
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  rights_declaration BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_records_tenant ON asset_records(tenant_id);

-- Demo sessions
CREATE TABLE IF NOT EXISTS demo_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  surface app_surface NOT NULL,
  cohort_id UUID,
  manifest_draft_version INTEGER,
  channel VARCHAR(255),
  eas_update_id VARCHAR(255),
  created_by UUID,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_tenant ON demo_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_cohort ON demo_sessions(cohort_id);

-- Platform sound library
CREATE TABLE IF NOT EXISTS sound_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  duration_seconds DECIMAL(5, 1),
  license_ref VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- OTA update publishes
CREATE TABLE IF NOT EXISTS update_publishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(255) NOT NULL,
  eas_update_id VARCHAR(255),
  codebase_sha VARCHAR(40),
  rollout_stage INTEGER NOT NULL DEFAULT 100,
  published_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_update_publishes_channel ON update_publishes(channel);

-- Extend app_builds with new columns
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS surface app_surface;
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS manifest_version INTEGER;
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS codebase_sha VARCHAR(40);
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS eas_build_ids JSONB;
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS runtime_version VARCHAR(50);
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS channel VARCHAR(255);
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS smoke_status smoke_status;
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS artifacts JSONB;
ALTER TABLE app_builds ADD COLUMN IF NOT EXISTS store_status store_status DEFAULT 'not_submitted';
