# Design Document: Phase 1 — Payments Core + Tenant Portal + Dockerization

## Overview

Phase 1 extends the Vima modular monolith (NestJS API) with three pillars:

1. **Payments Core** — A double-entry ledger service, wallet operations, PSP adapter implementations (Stripe + Paystack), webhook ingress, and tenant PSP connection management. All monetary movements are recorded as balanced ledger transactions within per-tenant databases.

2. **Tenant Portal** — A Next.js 15 application providing tenant admins with a dashboard (metrics), module management, provider views, and payment settings. Authenticates via the existing JWT/identity service, uses dark-mode design language.

3. **Docker Environment** — A multi-stage Dockerfile for the API and a docker-compose.yml that orchestrates Postgres, Redis, and the API with health checks, migration automation, and developer-friendly defaults.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PSP adapter resolution | Registry pattern with per-tenant lookup | Tenants can connect different PSPs; adapters resolved at runtime from `psp_connections` table |
| Ledger enforcement | Application-layer + DB check constraint | Double-entry balance enforced in service code and a DB trigger as safety net |
| Webhook routing | URL-path based (`/webhooks/:provider`) | PSPs already configured with distinct webhook URLs; no tenant-specific routing needed in URL |
| Portal auth | JWT stored in httpOnly cookie + silent refresh | Secure token storage; refresh token rotation already implemented in auth service |
| Metrics queries | Tenant DB with pre-computed aggregation views | Dashboard queries run against tenant DB; materialized views for 30-day windows |
| Docker migrations | Entrypoint script with `drizzle-kit migrate` | Runs before API starts accepting connections; simpler than init containers for local dev |
| Event bus | Redis Streams (via BullMQ) | Already in the stack; sufficient for internal event propagation and retry |

---

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Network                        │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  PostgreSQL   │    │    Redis     │    │    NestJS API         │  │
│  │  (port 5432)  │    │ (port 6379)  │    │    (port 3000)        │  │
│  │              │    │              │    │                        │  │
│  │  control_db  │    │  Streams +   │    │  ┌────────────────┐   │  │
│  │  tenant_*    │    │  BullMQ      │    │  │ PaymentsModule │   │  │
│  │              │    │              │    │  │ BillingModule   │   │  │
│  └──────┬───────┘    └──────┬───────┘    │  │ WebhookModule  │   │  │
│         │                   │            │  └────────────────┘   │  │
│         └───────────────────┴────────────┴──────────┬────────────┘  │
│                                                      │               │
└──────────────────────────────────────────────────────┼───────────────┘
                                                       │
        ┌──────────────────────────────────────────────┼──────────┐
        │                                              │          │
   ┌────▼─────┐   ┌───────────┐   ┌──────────┐   ┌───▼────┐
   │  Tenant   │   │  Stripe   │   │ Paystack │   │ Next.js│
   │  Portal   │   │  API      │   │ API      │   │ Portal │
   │ (Next.js) │   └─────┬─────┘   └────┬─────┘   └────────┘
   └───────────┘         │              │
                         │  webhooks    │  webhooks
                         └──────────────┘
```

### Module Dependency Graph

```
AppModule
├── DatabaseModule (Global)
├── TenancyModule
├── IdentityModule
├── EntitlementsModule
├── PaymentsModule (NEW)
│   ├── LedgerService
│   ├── WalletService
│   └── PspConnectionService
├── WebhookModule (NEW)
│   └── WebhookIngressController
├── BillingModule (NEW)
│   ├── SubscriptionService
│   └── UsageService
└── DashboardModule (NEW)
    └── MetricsService
```

---

## Components and Interfaces

### 1. Payments Module (`apps/api/src/modules/payments/`)

Responsible for ledger operations, wallet logic, and PSP connection management.

```
payments/
├── payments.module.ts
├── ledger/
│   ├── ledger.service.ts          # Double-entry transaction creation
│   ├── ledger.service.spec.ts
│   └── dto/
│       ├── create-transaction.dto.ts
│       └── ledger-entry.dto.ts
├── wallet/
│   ├── wallet.service.ts          # Top-up, P2P transfer, balance queries
│   ├── wallet.controller.ts       # REST endpoints
│   ├── wallet.service.spec.ts
│   └── dto/
│       ├── topup.dto.ts
│       ├── transfer.dto.ts
│       └── refund.dto.ts
├── psp-connection/
│   ├── psp-connection.service.ts  # Credential management + verification
│   ├── psp-connection.controller.ts
│   ├── psp-resolver.service.ts    # Runtime PSP adapter resolution
│   └── dto/
│       ├── connect-psp.dto.ts
│       └── verify-psp.dto.ts
└── interfaces/
    └── psp-registry.interface.ts
```

#### LedgerService Interface

```typescript
interface LedgerService {
  createTransaction(
    tenantId: string,
    input: CreateTransactionInput,
  ): Promise<LedgerTransaction>;

  getAccountBalance(
    tenantId: string,
    accountId: string,
  ): Promise<{ balance: string; currency: string }>;

  getAccountEntries(
    tenantId: string,
    accountId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<LedgerEntry>>;

  getOrCreateAccount(
    tenantId: string,
    userId: string | null,
    type: LedgerAccountType,
    currency: string,
  ): Promise<LedgerAccount>;
}

interface CreateTransactionInput {
  type: string; // 'topup' | 'p2p_transfer' | 'payout' | 'refund' | 'fare' | 'commission'
  referenceId?: string;
  description?: string;
  entries: Array<{
    accountId: string;
    amount: string; // decimal string
    direction: 'debit' | 'credit';
  }>;
}
```

#### PspResolverService

Resolves the correct PSP adapter for a tenant at runtime:

```typescript
@Injectable()
export class PspResolverService {
  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly adapters: Map<PspProvider, PspAdapter>,
  ) {}

  async resolve(tenantId: string, provider?: PspProvider): Promise<PspAdapter> {
    // 1. Look up active psp_connection for tenant
    // 2. Decrypt credentials
    // 3. Return configured adapter instance
  }
}
```

**Registration**: Adapters are registered via NestJS custom providers using the `PSP_ADAPTER_MAP` injection token. Each adapter class is instantiated once; credentials are injected per-call.

### 2. Webhook Module (`apps/api/src/modules/webhook/`)

Isolated module for PSP event ingestion.

```
webhook/
├── webhook.module.ts
├── webhook-ingress.controller.ts  # POST /webhooks/:provider
├── webhook.service.ts             # Dedup, normalize, publish
├── webhook.service.spec.ts
└── interfaces/
    └── webhook-event.interface.ts
```

#### Webhook Flow

```
PSP Server
    │
    ▼ POST /webhooks/stripe  (raw body preserved)
┌───────────────────────────────────────────────────┐
│ WebhookIngressController                          │
│  1. Extract raw body + headers                    │
│  2. Route to correct PSP adapter by URL path      │
│  3. Call adapter.verifyWebhook(rawBody, headers)  │
│  4. On failure → 401                              │
│  5. On success → NormalizedWebhookEvent           │
└──────────────────────────┬────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────┐
│ WebhookService                                    │
│  1. Check dedup (providerEventId in Redis SET)    │
│  2. If duplicate → 200 (idempotent)              │
│  3. Publish to BullMQ 'webhook-events' queue      │
│  4. Store providerEventId in Redis (TTL 7 days)   │
│  5. Return 200 immediately                        │
└──────────────────────────┬────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────┐
│ WebhookProcessor (BullMQ consumer)                │
│  1. Match event type to handler                   │
│  2. payment.succeeded → WalletService.complete()  │
│  3. refund.succeeded → WalletService.refund()     │
│  4. Retry on failure (3 attempts, exp backoff)    │
└───────────────────────────────────────────────────┘
```

### 3. Billing Module (`apps/api/src/modules/billing/`)

Manages platform-level billing of tenants via Stripe Billing.

```
billing/
├── billing.module.ts
├── subscription/
│   ├── subscription.service.ts    # Stripe subscription CRUD
│   ├── subscription.controller.ts
│   └── dto/
│       └── create-subscription.dto.ts
├── usage/
│   ├── usage.service.ts           # Record + push usage
│   ├── usage-push.processor.ts    # Nightly BullMQ job
│   └── dto/
│       └── record-usage.dto.ts
└── stripe-billing.client.ts       # Thin Stripe SDK wrapper
```

#### Billing Flow

```
Tenant enables module → EntitlementsService
    │
    ▼ Event: 'module.enabled'
BillingModule.SubscriptionService
    │ add subscription item to Stripe
    ▼
Stripe generates invoice → webhook → BillingModule syncs invoice status

Nightly cron (BullMQ repeatable job):
    UsagePushProcessor → aggregate usage_records → Stripe metered usage API
```

### 4. Dashboard Module (`apps/api/src/modules/dashboard/`)

Provides tenant-scoped metrics endpoints.

```
dashboard/
├── dashboard.module.ts
├── metrics.service.ts
├── metrics.controller.ts
└── dto/
    └── metrics-response.dto.ts
```

#### Metrics Queries

All queries execute against the tenant database (resolved from JWT context):

| Metric | Query Strategy |
|--------|---------------|
| GMV (30d) | `SUM(actual_fare) FROM jobs WHERE status='completed' AND completed_at > NOW() - 30d` |
| Completed Jobs (30d) | `COUNT(*) FROM jobs WHERE status='completed' AND completed_at > NOW() - 30d` |
| Active Providers | `COUNT(*) FROM providers WHERE is_online = true` |
| Completion Rate | `completed / (total - expired)` for jobs in 30d window |
| Jobs by Module (7d) | `GROUP BY type, DATE(created_at)` for last 7 days |

Growth percentages compare current 30-day window vs. the prior 30-day window.

### 5. PSP Adapters (`packages/psp-adapters/src/`)

Concrete adapter implementations:

```
psp-adapters/src/
├── index.ts
├── psp-adapter.interface.ts       # (existing)
├── stripe/
│   ├── stripe.adapter.ts
│   ├── stripe.adapter.spec.ts
│   └── stripe.types.ts
├── paystack/
│   ├── paystack.adapter.ts
│   ├── paystack.adapter.spec.ts
│   └── paystack.types.ts
└── utils/
    └── webhook-signature.ts
```

Each adapter receives decrypted credentials via a factory method, not through constructor injection. This allows the same adapter class to serve multiple tenants with different credentials:

```typescript
export class StripeAdapter implements PspAdapter {
  readonly provider = 'stripe';

  constructor(private readonly secretKey: string, private readonly webhookSecret: string) {}

  static create(credentials: StripeCredentials): StripeAdapter {
    return new StripeAdapter(credentials.secretKey, credentials.webhookSecret);
  }
  // ... interface methods
}
```

### 6. Tenant Portal (`apps/portal/`)

Next.js 15 application with App Router.

```
apps/portal/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout with sidebar
│   │   ├── page.tsx               # Redirect to /overview
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── overview/
│   │   │   └── page.tsx           # Dashboard metrics
│   │   ├── modules/
│   │   │   └── page.tsx           # Module toggles
│   │   ├── providers/
│   │   │   ├── page.tsx           # Provider list
│   │   │   └── [id]/page.tsx      # Provider detail
│   │   └── payments/
│   │       └── page.tsx           # PSP connection + transactions
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── nav-item.tsx
│   │   │   └── header.tsx
│   │   ├── dashboard/
│   │   │   ├── metric-card.tsx
│   │   │   ├── jobs-chart.tsx
│   │   │   └── metric-skeleton.tsx
│   │   ├── modules/
│   │   │   ├── module-card.tsx
│   │   │   └── confirm-dialog.tsx
│   │   ├── providers/
│   │   │   ├── provider-table.tsx
│   │   │   └── provider-search.tsx
│   │   └── payments/
│   │       ├── psp-status.tsx
│   │       ├── psp-setup-flow.tsx
│   │       └── transactions-list.tsx
│   ├── lib/
│   │   ├── api-client.ts          # Fetch wrapper with auth
│   │   ├── auth.ts                # Token storage + refresh
│   │   └── constants.ts
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-metrics.ts
│   │   └── use-modules.ts
│   └── types/
│       └── index.ts
└── public/
```

#### Portal Auth Flow

```
┌────────────────────────────────────────────────────────────┐
│                    Next.js Portal                           │
│                                                            │
│  1. Login page → POST /auth/login (email + password)       │
│  2. API returns { accessToken, refreshToken }              │
│  3. Store accessToken in memory, refreshToken in           │
│     httpOnly cookie (via Set-Cookie from API)              │
│  4. All API calls include Authorization: Bearer <access>   │
│  5. On 401 → call POST /auth/refresh (cookie sent auto)   │
│  6. New tokens issued; retry original request              │
│  7. If refresh fails → redirect to /login                  │
└────────────────────────────────────────────────────────────┘
```

The portal uses a Next.js middleware to check for the refresh cookie on protected routes. If absent, redirect to login. The access token is kept in a React context (memory-only, not localStorage) to minimize XSS exposure.

### 7. Docker Environment

```
docker/
├── Dockerfile                     # Multi-stage build for API
├── docker-compose.yml
├── .env.example
└── scripts/
    └── entrypoint.sh              # Migration + start
```

#### Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/*/package*.json ./packages/*/
RUN npm ci --workspace=@vima/api

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@vima/api

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/drizzle ./drizzle
COPY docker/scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
```

#### docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vima
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-vimadev}
      POSTGRES_DB: vima_control
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vima -d vima_control"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      CONTROL_PLANE_DATABASE_URL: postgres://vima:${POSTGRES_PASSWORD:-vimadev}@postgres:5432/vima_control
      TENANT_DATABASE_BASE_URL: postgres://vima:${POSTGRES_PASSWORD:-vimadev}@postgres:5432
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET:-dev-jwt-secret}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-dev-refresh-secret}
      NODE_ENV: development
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s

volumes:
  pgdata:
```

#### Entrypoint Script

```bash
#!/bin/sh
set -e

echo "Running database migrations..."
npx drizzle-kit migrate

echo "Starting API server..."
exec node dist/main.js
```

#### Docker Service Discovery

Services communicate via Docker's internal DNS:
- API → Postgres: `postgres:5432` (service name)
- API → Redis: `redis:6379` (service name)
- Portal (runs on host during dev) → API: `localhost:3000`

---

## Data Models

### Control Plane Schema Additions

No new tables needed. Existing tables already cover:
- `psp_connections` — PSP credential storage (encrypted)
- `subscriptions` + `subscription_items` — Stripe Billing sync
- `invoices` — Invoice status tracking
- `usage_records` — Metered billing events
- `plans` — Plan tier configuration

### Tenant Schema (existing, used by Payments)

The ledger tables are already defined in `tenant.schema.ts`:

| Table | Purpose |
|-------|---------|
| `ledger_accounts` | Named accounts (wallet, clearing, revenue) per user or system |
| `ledger_transactions` | Transaction headers (type, reference, timestamp) |
| `ledger_entries` | Individual debit/credit lines within a transaction |

#### Ledger Entry Amount Convention

- `direction: 'credit'` with positive `amount` → increases account balance
- `direction: 'debit'` with positive `amount` → decreases account balance
- Balance = `SUM(CASE WHEN direction='credit' THEN amount ELSE -amount END)`

#### Balance Constraint (DB-level safety net)

A database trigger validates that entries within a transaction sum to zero:

```sql
CREATE OR REPLACE FUNCTION check_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
  net_amount NUMERIC;
BEGIN
  SELECT SUM(
    CASE WHEN direction = 'credit' THEN amount::numeric ELSE -amount::numeric END
  ) INTO net_amount
  FROM ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  IF net_amount != 0 THEN
    RAISE EXCEPTION 'Ledger transaction is unbalanced: net = %', net_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied as a deferred constraint trigger
CREATE CONSTRAINT TRIGGER enforce_ledger_balance
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_ledger_balance();
```

### API Contracts

#### Wallet Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/wallet/topup` | Initiate wallet top-up |
| `POST` | `/wallet/transfer` | P2P transfer |
| `GET` | `/wallet/balance` | Current balance |
| `POST` | `/wallet/refund` | Issue refund |

#### Webhook Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/:provider` | PSP webhook ingress |

#### PSP Connection Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/psp-connections` | Connect PSP credentials |
| `POST` | `/psp-connections/:id/verify` | Verify connection |
| `GET` | `/psp-connections` | List tenant's connections |

#### Dashboard Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dashboard/metrics` | Overview metrics (GMV, jobs, providers, rate) |
| `GET` | `/dashboard/jobs-by-module` | 7-day jobs grouped by module |

#### Billing Endpoints (Platform Admin)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/billing/subscriptions` | Create subscription |
| `PATCH` | `/billing/subscriptions/:id/items` | Add/remove module item |
| `GET` | `/billing/usage` | Current period usage |
| `POST` | `/billing/usage` | Record billable event |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Ledger Balance Invariant

*For any* set of ledger entries within a single ledger transaction, the sum of credits minus debits SHALL equal exactly zero.

**Validates: Requirements 1.1, 1.2**

### Property 2: Ledger Append-Only

*For any* existing ledger entry, attempting to update or delete it SHALL fail, preserving the immutable audit trail.

**Validates: Requirements 1.3**

### Property 3: Account Balance Consistency

*For any* ledger account, the reported balance SHALL equal the sum of all associated credit entries minus the sum of all associated debit entries.

**Validates: Requirements 1.4**

### Property 4: P2P Transfer Conservation

*For any* P2P transfer between two wallets, the sender's balance decrease SHALL equal the recipient's balance increase exactly (zero-sum within the tenant).

**Validates: Requirements 2.2**

### Property 5: Insufficient Balance Rejection

*For any* transfer attempt where the requested amount exceeds the sender's available balance, the system SHALL reject the transfer and the sender's balance SHALL remain unchanged.

**Validates: Requirements 2.3**

### Property 6: Invalid Amount Rejection

*For any* transfer with an amount that is zero or negative, the system SHALL reject it and no ledger entries SHALL be created.

**Validates: Requirements 2.4**

### Property 7: Webhook Signature Verification Round-Trip

*For any* webhook payload and valid secret, signing and then verifying the payload SHALL produce a valid NormalizedWebhookEvent. Conversely, *for any* webhook with a tampered signature, verification SHALL throw a signature error.

**Validates: Requirements 3.4, 3.5, 4.5, 4.6**

### Property 8: Webhook Idempotency

*For any* webhook event processed successfully, reprocessing the same event (same providerEventId) SHALL produce no additional side effects and return HTTP 200.

**Validates: Requirements 5.4**

### Property 9: PSP Credential Encryption Round-Trip

*For any* set of PSP credentials, encrypting (envelope encryption) and then decrypting SHALL return the original credential values. At no point SHALL plaintext credentials be persisted.

**Validates: Requirements 6.1, 6.5**

### Property 10: Usage Record Idempotency

*For any* usage push to Stripe, using the same idempotency key SHALL not result in duplicate charges regardless of how many times the push is retried.

**Validates: Requirements 8.3**

### Property 11: Dashboard Metrics Tenant Isolation

*For any* two distinct tenants, a dashboard metrics query for tenant A SHALL never include data from tenant B's database.

**Validates: Requirements 17.6**

---

## Error Handling

### Payments Module

| Error Scenario | Handling Strategy |
|---------------|-------------------|
| Unbalanced ledger transaction | Reject at application layer with `BalancingError`; DB trigger as safety net |
| Insufficient balance | Return 400 with `INSUFFICIENT_BALANCE` code; no entries created |
| PSP API timeout | Retry with exponential backoff (3 attempts); mark payment as `processing` |
| PSP API error | Map to standard error codes; log raw error; return user-friendly message |
| Credential decryption failure | Log security alert; return 500; do not expose internal details |

### Webhook Module

| Error Scenario | Handling Strategy |
|---------------|-------------------|
| Invalid signature | Return 401 immediately; discard payload |
| Unknown provider in URL | Return 404 |
| Event processing failure | BullMQ retry (3 attempts, exponential backoff); dead-letter after exhaustion |
| Duplicate event | Return 200 (idempotent); skip processing |
| Timeout risk | Respond 200 within 2s; process asynchronously via queue |

### Billing Module

| Error Scenario | Handling Strategy |
|---------------|-------------------|
| Stripe API failure (subscription) | Retry once; if persistent, flag for manual review |
| Nightly usage push failure | Retry 3x with backoff; alert ops team; mark batch as failed |
| Invoice webhook sync conflict | Use Stripe as source of truth; overwrite local state |

### Tenant Portal

| Error Scenario | Handling Strategy |
|---------------|-------------------|
| API request failure | Display error toast; offer retry; revert optimistic UI |
| Token expiration | Silent refresh via refresh token cookie; retry failed request |
| Refresh token invalid | Redirect to login; clear local state |
| Module toggle failure | Revert toggle to previous state; show error message |

### Docker Environment

| Error Scenario | Handling Strategy |
|---------------|-------------------|
| Migration failure on startup | Exit with code 1; container restarts (compose restart policy) |
| Postgres unreachable | Health check fails; API container reports unhealthy |
| Redis unreachable | Health check reports degraded; BullMQ jobs queue in memory briefly |

---

## Testing Strategy

### Unit Tests (Jest)

**Coverage targets**: Business logic (ledger, wallet, PSP adapters, webhook verification)

- **LedgerService**: Test balance computation, rejection of unbalanced transactions, account type creation
- **WalletService**: Test top-up flow (mock PSP), P2P transfer happy path + edge cases, refund logic
- **PSP Adapters**: Test request/response mapping, error handling (mock HTTP client)
- **Webhook verification**: Test signature validation with known fixtures
- **MetricsService**: Test query construction with mock DB responses

### Property-Based Tests (fast-check)

The payments domain is well-suited for property-based testing because:
- Ledger operations are pure functions with clear invariants (balance = 0, amounts conserved)
- Input space is large (arbitrary amounts, account combinations, concurrent transfers)
- Universal properties hold across all valid inputs

**Library**: [fast-check](https://github.com/dubzzz/fast-check) (TypeScript PBT library)
**Configuration**: Minimum 100 iterations per property test

Each property test references its design document property:
- **Feature: phase-1-payments, Property 1: Ledger Balance Invariant**
- **Feature: phase-1-payments, Property 2: Ledger Append-Only**
- **Feature: phase-1-payments, Property 3: Account Balance Consistency**
- **Feature: phase-1-payments, Property 4: P2P Transfer Conservation**
- **Feature: phase-1-payments, Property 5: Insufficient Balance Rejection**
- **Feature: phase-1-payments, Property 6: Invalid Amount Rejection**
- **Feature: phase-1-payments, Property 7: Webhook Signature Round-Trip**
- **Feature: phase-1-payments, Property 8: Webhook Idempotency**
- **Feature: phase-1-payments, Property 9: PSP Credential Encryption Round-Trip**
- **Feature: phase-1-payments, Property 10: Usage Record Idempotency**
- **Feature: phase-1-payments, Property 11: Dashboard Metrics Tenant Isolation**

### Integration Tests

- **Webhook E2E**: Send signed payloads, verify event processing end-to-end
- **PSP Connection**: Connect, verify, decrypt flow against test PSP accounts
- **Docker health**: `docker compose up` → health check passes → API responds
- **Migration**: Fresh DB → migrations → schema matches expected state

### Portal Tests

- **Component tests** (React Testing Library): Metric cards, module toggles, navigation
- **E2E tests** (Playwright): Login flow, dashboard load, module toggle, PSP setup

### Test File Organization

```
apps/api/src/modules/payments/ledger/ledger.service.spec.ts          # Unit
apps/api/src/modules/payments/ledger/ledger.properties.spec.ts       # PBT
apps/api/src/modules/payments/wallet/wallet.service.spec.ts          # Unit
apps/api/src/modules/payments/wallet/wallet.properties.spec.ts       # PBT
apps/api/src/modules/webhook/webhook.service.spec.ts                 # Unit
apps/api/src/modules/webhook/webhook.properties.spec.ts              # PBT
packages/psp-adapters/src/stripe/stripe.adapter.spec.ts              # Unit
packages/psp-adapters/src/paystack/paystack.adapter.spec.ts          # Unit
apps/api/test/webhook-e2e.spec.ts                                    # Integration
apps/portal/src/__tests__/                                           # Component tests
apps/portal/e2e/                                                     # Playwright E2E
```
