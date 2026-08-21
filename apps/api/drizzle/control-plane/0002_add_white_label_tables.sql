-- Migration: Add white-label theming and asset tables (Phase 5)

CREATE TYPE asset_type AS ENUM ('logo', 'splash', 'icon', 'hero', 'guideline', 'app_icon', 'favicon');

-- Tenant theme tokens (versioned, publish workflow)
CREATE TABLE tenant_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  tokens JSONB NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_themes_tenant ON tenant_themes(tenant_id);
CREATE INDEX idx_tenant_themes_published ON tenant_themes(tenant_id, published);

-- Tenant design assets (logos, icons, splash screens, guidelines)
CREATE TABLE tenant_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type asset_type NOT NULL,
  url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_assets_tenant ON tenant_assets(tenant_id);
CREATE INDEX idx_tenant_assets_type ON tenant_assets(tenant_id, type);
