-- Migration: Add platform admins table
-- Vima platform administrators (control plane, not tenant-scoped).
-- Used by PlatformAdminAuthService for the admin console login.
-- IF NOT EXISTS: databases bootstrapped with `drizzle-kit push` may already have it.

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL CONSTRAINT platform_admins_email_unique UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
