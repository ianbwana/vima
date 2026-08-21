# App Generator (Expo React Native) — Implementation Plan

**Ref:** `docs/specs/expo-app-generator-feature-spec.md`
**Platform state:** All backend modules live (tenancy, identity, payments, notifications, rides, food, groceries, courier, home services, analytics, white-label theming). This plan builds the native app generation pipeline on top.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Tenant Portal (Next.js)                                                  │
│  Build Wizard (9 steps) → Manifest Drafts → Generate → Status           │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ API
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Platform API (NestJS)                                                     │
│  AppGeneratorModule                                                       │
│  ├── ManifestService (build manifest CRUD, validation, versioning)        │
│  ├── AssetPipelineService (BullMQ worker: transform, derive, hash)       │
│  ├── ConfigSigningService (JWS signing, scope enforcement)               │
│  ├── KeyProvisioningService (Google Maps, Firebase, PSP publishable)     │
│  ├── BuildOrchestrationService (EAS Build trigger, polling, webhooks)    │
│  ├── DemoService (sandbox seed, session management, cohort pairing)      │
│  ├── SubmissionService (EAS Submit, credential health, store tracking)   │
│  └── UpdateService (EAS Update channels, staged rollout, forced upgrade) │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
         ┌──────────────┐  ┌───────────┐  ┌──────────────┐
         │ EAS Build    │  │ EAS Update│  │ EAS Submit   │
         │ (iOS+Android)│  │ (OTA)     │  │ (Stores)     │
         └──────────────┘  └───────────┘  └──────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ White-Label Expo Monorepo (separate repo)                                │
│  ├── apps/customer/  (entry point)                                       │
│  ├── apps/provider/  (entry point)                                       │
│  ├── packages/modules/ (rides, food, groceries, courier, home-services)  │
│  ├── packages/theme/   (token-driven ThemeProvider)                      │
│  ├── packages/config/  (signed config client, boot sequence)             │
│  ├── packages/shared/  (API contracts, Zod schemas)                      │
│  └── app.config.ts     (pure function of manifest)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase A — Foundation (3 weeks)

### A.1 Data Model (Control Plane)

New tables to add to `control-plane.schema.ts`:

```sql
-- App projects (one per tenant per surface per platform)
app_projects (
  id, tenant_id, surface [customer|provider], platform [ios|android],
  bundle_id, eas_project_id, credential_mode [platform_managed|tenant_owned],
  store_listing_state, created_at
)

-- Tenant endpoint documents (per environment)
tenant_endpoints (
  id, tenant_id, environment [production|preview|demo],
  endpoint_document JSONB, -- {apiBaseUrl, realtimeUrl, assetsBaseUrl, configUrl}
  domain_state, updated_at
)

-- Key grants (client-safe keys only)
app_key_grants (
  id, tenant_id, app_project_id, key_type, -- google_maps|firebase|psp_publishable|sentry|mapbox
  environment, vendor_ref, restriction_state,
  encrypted_value, rotated_at, created_at
)

-- Build manifests (immutable, versioned)
build_manifests (
  id, tenant_id, surface [customer|provider], version INT,
  manifest JSONB, -- full manifest document
  asset_pack_hash, codebase_sha, created_by, created_at
)

-- Asset records
asset_records (
  id, tenant_id, kind, -- logo|icon|splash|notification_icon|onboarding|sound
  surface_variant [shared|customer|provider],
  original_url, original_hash, pack_hash,
  moderation_status [pending|approved|flagged|rejected],
  rights_declaration BOOLEAN, metadata JSONB, created_at
)

-- Demo sessions
demo_sessions (
  id, tenant_id, surface, cohort_id,
  manifest_draft_version, channel, eas_update_id,
  created_by, expires_at, revoked_at, created_at
)

-- Sound library (platform-owned)
sound_library (
  id, event_type, name, description, file_url,
  duration_seconds, license_ref, created_at
)

-- Update publishes
update_publishes (
  id, channel, eas_update_id, codebase_sha,
  rollout_stage [5|50|100], published_by, created_at
)
```

Extend existing `app_builds`:
- Add: `surface`, `manifest_version`, `codebase_sha`, `eas_build_ids JSONB`, `runtime_version`, `channel`, `smoke_status`, `artifacts JSONB`, `store_status`

### A.2 Manifest Service

**Location:** `apps/api/src/modules/app-generator/services/manifest.service.ts`

Responsibilities:
- Validate manifest against schema (Zod): required fields per surface, entitlement cross-check
- Version management: each save increments version, manifests are immutable once built
- Diff computation: compare two manifest versions, classify changes as "requires rebuild" vs "runtime-updatable"
- Serialize to the format consumed by `app.config.ts`

**Manifest schema (TypeScript/Zod):**
```typescript
interface BuildManifest {
  version: number;
  surface: 'customer' | 'provider';
  identity: {
    appName: string;
    bundleId: string;
    deepLinkDomain: string;
    developerAccountMode: 'platform_managed' | 'tenant_owned';
    defaultEnvironment: 'production' | 'demo';
  };
  features: {
    enabledModules: string[];   // customer: rides, food, etc.
    derivedJobTypes: string[];  // provider: trips, deliveries, parcels, jobs
    flags: Record<string, boolean>;
    layoutPreset: string;
    locales: string[];
  };
  theme: ThemeTokens; // existing token document
  assets: {
    iconHash: string;
    splashHash: string;
    notificationIconHash?: string;
    onboardingImages: string[];
    assetPackHash: string;
  };
  sounds: {
    events: Record<string, { source: 'library' | 'custom'; id: string }>;
  };
  endpoints: {
    configUrl: string;
    bakedBinding: { tenantId: string; surface: string; environment: string };
    platformPublicKey: string; // for JWS verification
  };
  keyGrants: Record<string, string>; // key_type → grant_id (resolved at build time)
  storeListing?: {
    descriptions: Record<string, { short: string; full: string }>;
    keywords: string[];
    category: string;
    privacyPolicyUrl: string;
    // ... per spec 4.6
  };
}
```

### A.3 Asset Pipeline

**Location:** `apps/api/src/modules/app-generator/services/asset-pipeline.service.ts`

BullMQ queue: `asset-pack`

Steps:
1. Fetch originals from object storage
2. Validate (dimensions, format, file size, sRGB normalization)
3. Transform:
   - Icons: iOS set (all sizes), Android adaptive (foreground layer + theme background)
   - Splash: light/dark variants, Android 12+ compliant (640dp circle)
   - Provider variants: auto-derived distinct treatment (inverted background)
   - Sounds: WAV/MP3 → CAF (iOS) + OGG (Android), loudness normalization (-16 LUFS)
4. Content-address everything (SHA-256 hashes)
5. Store pack, emit pack manifest JSON
6. Perceptual hash comparison for icon similarity warning (provider vs customer)

**Dependencies:** `sharp` (raster), `@resvg/resvg-js` (SVG), `fluent-ffmpeg` (audio transcode)

### A.4 Config Signing Service

**Location:** `apps/api/src/modules/app-generator/services/config-signing.service.ts`

- Signs runtime config documents as JWS (RS256) using platform KMS key
- Scope enforcement rules:
  - `demo` environment: only test-mode PSP keys, sandbox endpoints
  - `production` environment: only live endpoints, live keys
  - Surface mismatch rejected (customer config for provider app = reject)
- Serves: `GET /v1/:tenant/:surface/:environment/config`
- TTL: 15 minutes, client caches and background-refreshes

### A.5 Key Provisioning Service

**Location:** `apps/api/src/modules/app-generator/services/key-provisioning.service.ts`

On first build per app:
- Google Maps: create API key via Google Cloud API, restrict to bundle ID + cert fingerprint
- Firebase: register app in platform Firebase project (or tenant's), output `google-services.json` / `GoogleService-Info.plist` equivalent
- PSP: look up tenant's Stripe/Paystack publishable key from `psp_connections`
- Store grants in `app_key_grants` with rotation timestamps

### A.6 Build Orchestration Service

**Location:** `apps/api/src/modules/app-generator/services/build-orchestration.service.ts`

Flow:
1. Validate: Scale tier, build quota, manifest completeness
2. Create `app_builds` record (status: `queued`)
3. Resolve: manifest version, asset pack, codebase release SHA
4. Ensure EAS project exists (create via Expo API if first build)
5. Ensure credentials (EAS-managed or tenant-owned)
6. Trigger EAS Build (non-interactive): `eas build --platform all --non-interactive`
   - Pass `TENANT_MANIFEST_URL` as build env
   - Pass manifest hash as metadata
7. Poll / receive EAS webhooks → status transitions
8. On success: attach artifacts, run smoke suite, write usage record
9. On failure: classify (infra vs config), auto-retry infra failures once

**Webhook handler:** `POST /internal/webhooks/eas` (signature-verified)

### A.7 CI Secret Scan

Post-build step: scan every JS bundle and binary artifact for true-secret patterns:
- `sk_live_`, `sk_test_`, `whsec_`, PEM headers (`-----BEGIN`), service account markers (`"type": "service_account"`)
- Fail the build immediately if any match is found
- Integrated into the smoke suite

---

## Phase B — Sounds, Provider App, Demo (4 weeks)

### B.1 Sound System

- Platform sound library: seed `sound_library` table with curated entries per event type
- Upload flow: validate (format, duration, size), transcode (ffmpeg: WAV→CAF for iOS, WAV→OGG for Android), normalize loudness
- Android notification channel generation: bake channel definitions from manifest, rotate channel ID suffix on sound change
- Sound preview in wizard: inline playback via `<audio>` element
- Provider job-offer ringtone: mandatory-audible validation

### B.2 Provider App Generation

- Provider surface entry point in Expo monorepo (prerequisite: port if needed)
- Per-tenant variants: icon (derived distinct treatment), splash, job types from entitled modules
- Store listing with location disclosure inputs (12.3):
  - Generate iOS purpose strings from templates
  - Generate Android prominent disclosure screen
  - Play Console declaration video checklist
- Background location policy: online/on-job only, enforced in shared surface code

### B.3 Demo Environment

**Sandbox seed per tenant:**
- Demo customer and driver accounts (fixed OTP bypass)
- Sample merchants with catalogs (food, groceries)
- Service zones, fare rules, delivery fee config
- Pre-funded test wallets

**Simulators (BullMQ workers):**
- **Driver simulator:** accepts jobs, emits location updates along real routes (interpolated waypoints)
- **Merchant simulator:** auto-accepts orders, progresses on timer
- **Customer simulator:** generates demand on configurable interval for provider-only demos

**Demo sessions:**
- `demo_sessions` table with cohort IDs for paired demos
- Publish EAS Updates to `{slug}-{surface}-demo` channels
- Dispatch sandbox routes demand within cohort preferentially to human driver
- 14-day expiry, revocable, rate-limited publishes

### B.4 Preview Shell

- Platform-owned Expo development client
- Published to TestFlight (shareable link) + Play internal testing + direct APK
- Loads any tenant's demo update for either surface via deep link / QR code
- Full capabilities: push, maps, camera, custom sounds, job-offer ringtone
- Provider demo: foreground location + simulator movement (no true background tracking in demo)

### B.5 Expo Go Fallback

- Same demo updates loadable in stock Expo Go
- Documented degradations:
  - No remote push (SDK 53+): substitute in-app toast notifications
  - No custom notification sounds: system default
  - No background location: foreground only
  - Maps constrained to Go's bundled module
- Wizard labels: "look and feel demo" (Go) vs "full demo" (preview shell)
- Degradation list auto-generated from codebase Go-compatibility budget

### B.6 Paired Two-Device Demo

- Wizard shows both QR codes side by side
- Shared cohort ID links customer and provider sessions
- Dispatch sandbox: cohort customer request → preferentially routed to cohort human driver
- Solo fallback: customer simulator generates demand for provider-only, driver simulator serves customer-only
- The moment: request → ring → accept → live tracking → complete → receipt + earnings

---

## Phase C — Store Submission & OTA (2 weeks)

### C.1 Store Metadata & Submission

- Wizard steps 7-8: metadata collection per locale per surface
- Provider: location disclosure inputs, generated purpose strings, prominent disclosure
- EAS Submit integration with tenant-owned credentials
- Credential health checks before submission (key validity, agreement status)
- Differentiation enforcement: block if name/description/screenshots unchanged from defaults
- Store status tracking on `app_builds` (submitted → in_review → approved → rejected)
- Auto-ticket on rejection

### C.2 EAS Update Channels & OTA

- Channel naming: `{tenantSlug}-{surface}-{environment}`
- Bulk publish tooling: iterate all tenant channels, staged rollout (5% → 50% → 100%)
- One-click rollback: republish previous update
- Policy enforcement: diff change class (JS-only vs native), block OTA for native changes
- Forced upgrade: minimum runtime version in signed config → app shows update screen

### C.3 Smoke Suite

Maestro flows per generated app:
- **Customer:** cold start → config verified → theme applied → module tabs render → OTP screen → notification permission
- **Provider:** cold start → config → online toggle → simulated job offer → accept/decline screen with ringtone → earnings view
- Failed smoke blocks submission (not artifact delivery)
- Screenshot capture per locale/device class for store listings

---

## Phase D — Metering & Admin (1 week)

### D.1 Metering

- Usage record per successful build pair (iOS+Android = 1 unit), per surface
- Failed infra builds: not billed
- Failed config builds: not billed, count against monthly attempt cap
- Demo publishes: free within daily cap
- OTA publishes: included in Scale tier

### D.2 Platform Admin

- Build queue visibility (all tenants)
- Per-tenant build history per surface
- Key grant status and rotation
- Demo session management (pre-sales paired demos for prospects)
- Credential health dashboard
- Canary/rollback: pin tenant to codebase release
- Build log retention (90 days)

### D.3 Pre-Sales Demos

- Platform admin creates demo sessions for prospect tenants (not yet signed up)
- Backed by throwaway demo tenant records
- Same paired demo flow, branded with prospect's uploaded assets
- Conversion tool for sales calls

---

## Expo Monorepo Structure (Separate Repo)

```
vima-app/
├── apps/
│   ├── customer/          # Customer entry point
│   │   ├── app.config.ts  # Pure function of manifest
│   │   ├── App.tsx        # Shell: reads manifest, composes modules
│   │   └── index.ts
│   └── provider/          # Provider entry point
│       ├── app.config.ts
│       ├── App.tsx        # Fixed layout, job types from manifest
│       └── index.ts
├── packages/
│   ├── modules/
│   │   ├── rides/         # { id, tab, navigator, entitlementKey, providerJobType }
│   │   ├── food/
│   │   ├── groceries/
│   │   ├── courier/
│   │   └── home-services/
│   ├── theme/             # Token-driven ThemeProvider (React Native Paper/custom)
│   ├── config/            # Signed config client, boot sequence, cache
│   ├── notifications/     # Push handling, sound mapping, channel management
│   ├── location/          # Foreground + background (provider only)
│   ├── payments/          # PSP web surfaces (SAQ-A compliant)
│   └── shared/            # API contracts, Zod schemas, types
├── assets/
│   └── sounds/            # Platform sound library (bundled)
├── eas.json               # Build profiles
├── package.json
└── tsconfig.json
```

**Key constraints:**
- Managed workflow only (no `android/` or `ios/` directories, CNG)
- `app.config.ts` is a pure function of the manifest
- All modules ship in every binary (gating by config, not by build)
- One native dependency set for all tenants (both surfaces)
- Expo Go compatibility budget maintained

---

## API Endpoints (Platform API)

```
# Manifest management
POST   /app-generator/:surface/manifest          # Save/update manifest draft
GET    /app-generator/:surface/manifest          # Get current draft
GET    /app-generator/:surface/manifest/versions  # List versions
GET    /app-generator/:surface/manifest/:version  # Get specific version
POST   /app-generator/:surface/manifest/diff     # Diff two versions (rebuild vs runtime)

# Builds
POST   /app-generator/:surface/builds            # Trigger build
GET    /app-generator/:surface/builds            # List builds
GET    /app-generator/:surface/builds/:id        # Build status + artifacts

# Demo
POST   /app-generator/demo                       # Publish demo (body: surfaces, paired)
GET    /app-generator/demo                       # List active sessions
DELETE /app-generator/demo/:id                   # Revoke session

# Config (public, no auth — app uses signed config)
GET    /v1/:tenant/:surface/:environment/config  # Signed runtime config (JWS)

# Assets
POST   /app-generator/assets/upload             # Upload with validation
POST   /app-generator/assets/pack               # Trigger pack generation
GET    /app-generator/assets                    # List assets

# Sounds
GET    /app-generator/sounds/library            # Platform sound library
POST   /app-generator/sounds/upload             # Custom sound upload

# Submission
POST   /app-generator/:surface/builds/:id/submit  # Submit to stores
GET    /app-generator/:surface/store-status       # Store review status

# Updates (admin)
POST   /app-generator/updates/publish           # Bulk OTA publish
POST   /app-generator/updates/rollback/:channel # Rollback channel

# Webhooks
POST   /internal/webhooks/eas                   # EAS build/submit status
```

---

## Portal Wizard UX (9 Steps)

| Step | Title | Key Inputs |
|------|-------|------------|
| 1 | Identity & Surfaces | App names, bundle IDs, developer account mode, deep link domain, provider toggle |
| 2 | Features | Module toggles (from entitlements), flags, layout presets, locales |
| 3 | Design | Theme confirmation (from existing), dark mode review, both surfaces |
| 4 | Assets | Icon/splash uploads with live preview, provider derived variant, side-by-side comparison |
| 5 | Sounds | Per-event selection (library picker + custom upload), inline playback, provider ringtone mandatory |
| 6 | Try It (Demo) | Publish demos, QR codes per surface, paired demo panel, test push, session controls |
| 7 | Store Listing (Customer) | Metadata per locale, privacy policy, screenshots (auto/upload) |
| 8 | Store Listing (Provider) | Same + location disclosure inputs, generated artifacts preview |
| 9 | Review & Build | Manifest diff, rebuild vs runtime annotations, quota, Generate buttons |

---

## Dependencies & Prerequisites

### Must exist before Phase A starts:
- [x] Tenant theming system (white-label module — done)
- [x] Control plane with tenant/domain/entitlement management (done)
- [x] PSP connections with encrypted credentials (done)
- [x] Existing `app_builds` table (done)
- [ ] Expo monorepo initialized (customer entry point, module registry, app.config.ts)
- [ ] EAS account and project setup
- [ ] Platform KMS key for config signing
- [ ] Object storage for assets (S3/R2)

### Must exist before Phase B starts:
- [ ] Provider surface ported to Expo monorepo as entry point (12.1 — critical path risk)
- [ ] Platform sound library curated and licensed
- [ ] Preview shell published to TestFlight + Play internal testing
- [ ] Demo environment infrastructure (sandbox tenant DB seeding)

### External services:
- Expo Application Services (EAS Build, Update, Submit)
- Google Cloud (Maps API key provisioning)
- Firebase (app registration, FCM)
- Sharp / ffmpeg (asset pipeline — already available as npm packages)
- Maestro (smoke testing — CI only)

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Provider surface port delays Phase B | Size during Phase A; don't commit Phase B until provider builds in CI |
| Apple 4.3/4.2.6 rejections | Default to tenant-owned accounts; enforce metadata differentiation |
| EAS Build outage | Queue with transparent status; document `eas build --local` as break-glass |
| Secret leakage in binaries | CI secret scan on every build; manifest schema has no true-secret fields |
| Demo→production leakage | Config signing scope rules make it structurally impossible |
| Sound licensing exposure | Curated library primary; rights declaration on custom uploads |
| Android channel immutability | Channel ID rotation on sound change (acceptance criterion 11) |

---

## Success Criteria (from spec Section 20)

1. Scale tenant → store-ready artifacts for both surfaces < 45 min, no engineer involvement
2. Two tenants from same SHA differ only in manifest-driven config (verified by binary diff)
3. Demo ride end-to-end in preview shell within 5 min of publish
4. Paired demo: customer request rings provider device within 10 seconds
5. Provider solo demo: simulated offer rings within configured interval
6. Expo Go demo shows correct branding with documented degradations only
7. Domain migration via signed config, no rebuild
8. CI secret scan proves no true secrets in any artifact
9. Module disable hides in app on next launch without rebuild
10. JS fix published to 100% of channels within 1 hour via staged rollout
11. Sound change produces correctly rotated Android channels
12. Provider submission blocked until location disclosures complete
13. Cross-tenant manifest references rejected server-side
14. Every build reproducible from stored hashes
15. Expired demo stops resolving within config TTL
