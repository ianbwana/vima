# Feature Spec: Platform Core (Tenancy & Provisioning)

**Module:** `tenancy`, `entitlements`
**Phase:** 0 (Foundations)
**Priority:** Critical — everything depends on this

---

## Overview

The platform core handles multi-tenant lifecycle management: signup, provisioning, isolation, entitlements, billing, branding, and custom domains. It is the foundation on which all vertical modules operate.

---

## Functional Requirements

### Tenant Signup & Provisioning

- [ ] Tenant signup form: company name, admin email, password
- [ ] KYB-lite verification: business email domain check, manual approval toggle
- [ ] On approval: provision isolated Postgres database from versioned template
- [ ] Provisioning target: under 60 seconds
- [ ] Subdomain auto-provisioned: `{slug}.vima.app`
- [ ] Default theme applied from tenant name

### Tenant Resolution

- [ ] Resolution order: custom domain → subdomain → X-Tenant header → JWT claim
- [ ] All identifiers must agree or request is rejected
- [ ] Middleware attaches resolved tenant context to every request
- [ ] Connection pool routes to correct tenant database

### Module Marketplace & Entitlements

- [ ] Tenants enable/disable modules: rides, food, groceries, courier, home_services
- [ ] Each toggle updates entitlements and billing line items
- [ ] Entitlements cached in Redis with short TTL
- [ ] Feature map: `{ rides: true, food: true, groceries: false, ... }`
- [ ] Enforced at: API guards (NestJS decorator), tenant portal nav, app runtime config

### Plan Tiers

| Tier | Customer Surface | Provider Surface | Domain | App Factory |
|---|---|---|---|---|
| Starter | Branded PWA (subdomain) | Shared platform provider app | Subdomain only | No |
| Growth | Branded PWA | Shared platform provider app | Custom domain | No |
| Scale | PWA + dedicated native apps | Dedicated white-label provider app | Custom domain | Yes |

### Branding & Theming

- [ ] Theme token document per tenant: colors, typography, logos, radius, copy
- [ ] Design asset upload: brand guidelines and reference images per module
- [ ] Layout presets (2-3 home layouts, list vs grid catalogs)
- [ ] Copy overrides per module (app name, tagline, module labels)

### Custom Domains

- [ ] Tenant adds domain in portal
- [ ] Platform creates custom hostname via Cloudflare for SaaS
- [ ] Tenant sets CNAME
- [ ] Automatic TLS provisioning
- [ ] Domain becomes tenant resolution key
- [ ] Subdomain always available as fallback

### Roles & Permissions

- [ ] Roles: owner, admin, ops, finance, support
- [ ] Per-role permission matrix for portal actions
- [ ] Role assignment by tenant owner/admin

### Tenant Lifecycle States

```
signup → email/KYB verification → plan selection → payment method
→ provisioning (DB, subdomain, theme) → onboarding checklist
→ live → suspension (non-payment) → offboarding (export + deletion)
```

### Platform Billing (Billing Tenants)

- [ ] Base platform fee + per-module monthly fee
- [ ] Usage-based: per completed job, per app build, per SMS
- [ ] Optional bps on GMV
- [ ] Engine: Stripe Billing for subscriptions + metered usage
- [ ] Dunning → grace period (read-only banners) → suspension

---

## Data Model (Control Plane DB)

```sql
tenants (id, name, slug, status, tier, created_at, updated_at)
tenant_domains (id, tenant_id, domain, type, verified, ssl_status)
tenant_users (id, tenant_id, user_id, role, created_at)
plans (id, name, tier, base_price, created_at)
subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end)
subscription_items (id, subscription_id, module, price, quantity)
usage_records (id, tenant_id, metric, quantity, recorded_at)
invoices (id, tenant_id, amount, status, due_date, paid_at)
psp_connections (id, tenant_id, provider, encrypted_credentials, verified, created_at)
app_builds (id, tenant_id, platform, status, config, artifact_url, created_at)
platform_audit_log (id, actor_id, tenant_id, action, resource, details, created_at)
```

---

## Technical Notes

- Database-per-tenant on shared Postgres clusters (Neon or RDS)
- PgBouncer for connection management
- Migrations: template + fan-out to all tenant DBs with per-tenant status tracking
- Provisioning worker: BullMQ job queue
- Tenant config cached in Redis, invalidated on update

---

## Exit Criteria (Phase 0)

- Create tenant end-to-end from portal
- Isolated DB provisioned in under 60 seconds
- Entitlement-gated hello-world module works
- Tenant resolution via subdomain functional
