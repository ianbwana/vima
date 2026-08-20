# Vima - Multi-Tenant Payments and Operations Platform

## Problem Statement

Mobility startups spend months building payments infrastructure and multi-tenancy foundations before they can focus on their core product. Each new company re-invents ledger systems, PSP integrations, tenant isolation, billing pipelines, and admin portals — costing engineering teams 3–6 months of runway on undifferentiated heavy lifting.

## Solution

Vima is a production-ready multi-tenant platform that provides ledger accounting, PSP integrations (Stripe, Paystack), usage-based billing, an admin portal, and Docker-based deployment — out of the box. Teams plug in, configure their tenant, and ship revenue-generating features from day one.

## Key Features

- **Double-entry ledger** — immutable journal entries with automatic balance triggers
- **Multi-PSP wallet funding** — Stripe and Paystack adapters behind a unified interface
- **Usage-based billing** — metered Stripe subscriptions with BullMQ push workers
- **Multi-tenant isolation** — per-tenant PostgreSQL schemas with control-plane routing
- **Admin portal** — Next.js 15 dashboard with metrics, tenant management, and billing views
- **Entitlements engine** — module-level feature gating per tenant
- **Webhook ingestion** — verified Stripe and Paystack webhook processing
- **Docker-ready** — single Dockerfile with health checks and multi-stage build
- **Property-based testing** — fast-check powered specs for ledger, billing, and metrics

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API | NestJS | Backend framework with modular architecture |
| Portal | Next.js 15 | Admin dashboard (App Router, Server Components) |
| ORM | Drizzle ORM | Type-safe schema definitions and migrations |
| Database | PostgreSQL | Multi-tenant data with per-schema isolation |
| Cache / Queue | Redis + BullMQ | Job queues for billing push and background work |
| Payments | Stripe | Card payments, subscriptions, usage billing |
| Payments | Paystack | Mobile-money and card payments (Africa) |
| Styling | Tailwind CSS | Utility-first CSS for portal UI |
| Testing | Jest | Unit and integration test runner |
| Property Tests | fast-check | Property-based testing for core logic |

## How Kiro Was Used

This project was built using **Kiro's spec-driven development workflow**:

1. **Requirements** — defined in `.kiro/specs/phase-1-payments-portal-docker/requirements.md` capturing acceptance criteria for payments, portal, billing, and Docker.
2. **Design** — generated in `design.md` with architecture decisions, data models, and correctness properties.
3. **Task Breakdown** — decomposed into **71 tasks** organized in a dependency graph across **14 execution waves**, ensuring correct build order.
4. **Implementation** — each task executed via Kiro's task runner with automated code generation, test creation, and verification.
5. **Artifacts** — the `.kiro/` directory contains the full spec artifacts (requirements, design, tasks, and metadata) demonstrating the end-to-end workflow.

## Project Structure

```
vima/
├── apps/
│   ├── api/              # NestJS backend (payments, ledger, billing, tenancy)
│   │   ├── src/modules/
│   │   │   ├── payments/     # Ledger, wallet, PSP connections
│   │   │   ├── billing/      # Stripe subscriptions, usage metering
│   │   │   ├── tenancy/      # Tenant provisioning and routing
│   │   │   ├── identity/     # Auth (JWT), registration
│   │   │   ├── entitlements/ # Module-level feature flags
│   │   │   ├── dashboard/    # Metrics aggregation
│   │   │   ├── webhook/      # PSP webhook ingestion
│   │   │   └── notifications/# Event-driven notifications
│   │   └── drizzle/          # SQL migrations (control-plane + tenant)
│   ├── portal/           # Next.js 15 admin dashboard
│   └── web/              # Marketing / public site
├── packages/
│   ├── psp-adapters/     # Stripe & Paystack adapter implementations
│   ├── shared-types/     # Cross-package TypeScript types
│   ├── config/           # Shared configuration utilities
│   └── ui/               # Shared UI component library
├── docker/
│   ├── Dockerfile        # Multi-stage production build
│   └── scripts/          # Container entrypoint and health scripts
└── .kiro/
    ├── specs/            # Spec artifacts (requirements, design, tasks)
    └── settings/         # Kiro workspace settings
```

## Setup Instructions

### Prerequisites

- Node.js >= 18
- PostgreSQL 15+
- Redis 7+
- npm (workspace-aware)

### Installation

```bash
# Clone the repository
git clone git@github.com:ianbwana/vima.git
cd vima

# Install dependencies (workspaces)
npm install

# Copy environment files
cp .env.example .env
cp apps/api/.env.example apps/api/.env.local

# Run database migrations
cd apps/api
npx drizzle-kit push

# Start the API
npm run start:dev

# In a separate terminal — start the portal
cd apps/portal
npm run dev
```

### Docker

```bash
docker build -f docker/Dockerfile -t vima-api .
docker run -p 3000:3000 --env-file .env vima-api
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | API server port | `3000` |
| `CONTROL_PLANE_DATABASE_URL` | PostgreSQL URL for control-plane schema | `postgresql://user:pass@localhost:5432/vima` |
| `TENANT_DATABASE_BASE_URL` | Base URL for tenant schema connections | `postgresql://user:pass@localhost:5432/vima` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for signing access tokens | `your-jwt-secret` |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | `your-refresh-secret` |
| `PSP_ENCRYPTION_KEY` | AES key for encrypting PSP credentials | `32-byte-hex-key` |
| `STRIPE_SECRET_KEY` | Stripe API secret key (test mode) | `sk_test_...` |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe webhook endpoint secret | `whsec_...` |

## Testing Instructions

```bash
# Run all tests
cd apps/api
npm test

# Run specific test suites (property-based tests)
npx jest --testPathPattern="properties.spec"

# Run billing usage property tests
npx jest src/modules/billing/usage/usage.properties.spec.ts

# Run dashboard metrics property tests
npx jest src/modules/dashboard/metrics.properties.spec.ts
```

## Test Credentials

To test the platform locally:

1. **Create a tenant** via the tenancy API (`POST /tenancy/provision`)
2. **Register an admin user** on that tenant:
   - Email: `admin@demo.com`
   - Password: `password123`
3. **Login** via `POST /identity/login` to receive JWT tokens
4. Use the access token as a Bearer header for authenticated endpoints.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/identity/register` | Register a new user |
| POST | `/identity/login` | Authenticate and receive tokens |
| POST | `/tenancy/provision` | Provision a new tenant |
| GET | `/payments/wallets` | List tenant wallets |
| POST | `/payments/wallets/fund` | Fund a wallet via PSP |
| POST | `/payments/ledger/entries` | Create ledger journal entry |
| GET | `/payments/ledger/balance/:accountId` | Get account balance |
| POST | `/payments/psp-connections` | Store PSP credentials |
| POST | `/billing/subscriptions` | Create a billing subscription |
| PATCH | `/billing/subscriptions/:id/items` | Update subscription line items |
| POST | `/billing/usage` | Record metered usage |
| GET | `/dashboard/metrics` | Aggregated platform metrics |
| GET | `/dashboard/jobs-by-module` | Job counts grouped by module |
| POST | `/entitlements/modules` | Update tenant module entitlements |
| POST | `/webhooks/stripe` | Stripe webhook receiver |
| POST | `/webhooks/paystack` | Paystack webhook receiver |
| GET | `/health` | Health check |

## Third-Party Libraries and Attribution

| Library | License | Purpose |
|---------|---------|---------|
| NestJS | MIT | Backend framework |
| Next.js 15 | MIT | Frontend framework (portal) |
| Drizzle ORM | MIT | Database ORM and migrations |
| Stripe SDK | MIT | Payment processing and billing |
| BullMQ | MIT | Background job processing |
| fast-check | MIT | Property-based testing |
| bcrypt | MIT | Password hashing |
| ioredis | MIT | Redis client |
| Tailwind CSS | MIT | Utility-first CSS framework |
| class-validator | MIT | DTO validation decorators |
| supertest | MIT | HTTP assertion testing |

## API Costs and Rate Limits

| Service | Mode | Cost | Notes |
|---------|------|------|-------|
| Stripe | Test mode | Free | No real charges in test mode |
| Paystack | Test mode | Free | No real charges in test mode |
| PostgreSQL | Self-hosted | No cost | Local or Docker deployment |
| Redis | Self-hosted | No cost | Local or Docker deployment |

## License

All rights reserved. Submitted for Ready, Spec, Ship Hackathon.
