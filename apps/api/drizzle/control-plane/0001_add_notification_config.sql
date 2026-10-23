-- Migration: Add tenant notification configuration tables
-- Stores per-tenant channel provider settings and quiet hours.

-- Enum for supported notification providers
DO $$ BEGIN
  CREATE TYPE notification_provider AS ENUM ('twilio', 'africas_talking', 'fcm', 'resend', 'ses');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tenant-level notification provider configuration
-- Each tenant can configure which provider to use per channel (and optionally per region)
CREATE TABLE IF NOT EXISTS tenant_notification_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  channel VARCHAR(20) NOT NULL,
  provider notification_provider NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  region VARCHAR(50),
  fallback_channel VARCHAR(20),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_notification_config_tenant ON tenant_notification_config(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_notification_config_unique ON tenant_notification_config(tenant_id, channel, region);

-- Quiet hours configuration per tenant
-- Notifications (except critical) are suppressed during these hours
CREATE TABLE IF NOT EXISTS tenant_quiet_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  end_hour INTEGER NOT NULL CHECK (end_hour >= 0 AND end_hour <= 23),
  timezone VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_quiet_hours_tenant ON tenant_quiet_hours(tenant_id);
