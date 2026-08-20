# Feature Spec: White-Label & App Factory

**Module:** Platform core (theming, domains, app generation)
**Phase:** 5 (White-Label Depth + App Factory)
**Priority:** High — differentiator, but built last

---

## Overview

The white-labeling system and app factory enable tenants to fully brand and deploy customer-facing apps. The approach is layered: PWA-first (instant, all tiers), shared provider app (runtime rebrand), then dedicated native apps (Scale tier, generated via CI pipeline).

---

## Functional Requirements

### Theming System

- [ ] Theme token document per tenant (JSON):
  - Colors: primary, onPrimary, secondary, surface, background, error
  - Typography: fontFamily (from curated list)
  - Logos: appIcon, splash, headerLight, headerDark
  - Radius, imagery (onboarding images, module hero images)
  - Copy: appName, tagline, moduleLabels
- [ ] Flutter: tokens → ThemeData / Material 3 color scheme
- [ ] Next.js: tokens → CSS custom properties
- [ ] Dark mode: auto-derived with manual override option
- [ ] Theme preview in tenant portal before publishing

### Customer PWA (All Tiers)

- [ ] Installable PWA on tenant subdomain or custom domain
- [ ] Web app manifest generated per tenant from theme tokens
- [ ] Full icon set (192, 512, maskable) from asset pipeline
- [ ] Service worker: precache app shell, runtime cache for catalogs
- [ ] Web Push (FCM) for order/trip updates
- [ ] SMS/WhatsApp fallback for iOS limitations
- [ ] Lighthouse installability as CI check

### Shared Platform Provider App

- [ ] Single store listing published by platform
- [ ] Driver enters tenant code or uses deep link at login
- [ ] App fetches tenant theme, logo, enabled job types at runtime
- [ ] One codebase, one review cycle, all tenants' drivers covered

### App Factory (Scale Tier Only)

Pipeline per tenant build:
1. [ ] Read tenant config: bundle ID, app name, icons/splash, theme, modules, API base
2. [ ] Generate asset pack from logos (all required sizes)
3. [ ] Trigger Codemagic CI with config via flavor/dart-define
4. [ ] Signing: platform-managed certs (default) or tenant-provided credentials
5. [ ] Output: signed AAB + IPA
6. [ ] Attach to `app_builds` record, downloadable in portal
7. [ ] Optional: store upload via App Store Connect API / Play Developer API

### Custom Domains (Growth + Scale)

- [ ] Add domain in tenant portal
- [ ] Create custom hostname via Cloudflare for SaaS API
- [ ] Tenant sets CNAME (instructions displayed)
- [ ] Automatic TLS provisioning + verification
- [ ] Domain becomes tenant resolution key
- [ ] Subdomain always available as fallback

### Design Asset Uploads

- [ ] Tenants upload brand guidelines per module
- [ ] Treated as guided theming inputs (not custom screens)
- [ ] Applied as: theme tokens, imagery slots, copy overrides, layout presets
- [ ] 2-3 curated home layouts, list vs grid catalog views, card styles
- [ ] "Design review" service tier: team translates uploads to preset selections

---

## Data Model (Control Plane DB)

```sql
app_builds (id, tenant_id, platform [ios|android], status [queued|building|succeeded|failed],
            config [jsonb], artifact_url, error_message, triggered_by, created_at, completed_at)
tenant_themes (id, tenant_id, tokens [jsonb], published, version, created_at)
tenant_assets (id, tenant_id, type [logo|splash|icon|hero|guideline], url, metadata [jsonb])
```

---

## App Store Considerations

- Apple 4.3 (spam) and 4.2.6 (white-label) rules apply
- Tenant-owned developer accounts strongly preferred for Scale tier
- Each tenant app must have differentiated content/metadata
- Budget review friction into onboarding timeline

---

## Exit Criteria (Phase 5)

- Custom domain working with automatic TLS
- Theme editor produces correct PWA and native app styling
- App factory generates store-ready builds without engineer involvement
- Shared provider app rebrands at runtime per tenant login
- At least 2 tenant app pairs generated end-to-end
