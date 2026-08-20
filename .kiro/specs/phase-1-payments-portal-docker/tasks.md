# Implementation Plan: Phase 1 — Payments Core + Tenant Portal + Dockerization

## Overview

This plan implements three pillars on top of the Phase 0 foundations (tenancy, identity, entitlements): a double-entry payments core with PSP integrations, a tenant administration portal (Next.js 15), and Docker-based local development infrastructure. Tasks are ordered so that foundational infrastructure comes first, backend services build incrementally on each other, and the frontend consumes APIs that already exist.

**Language**: TypeScript (NestJS API + Next.js 15 portal)
**Testing**: Jest (unit), fast-check (property-based), Playwright (E2E)

## Tasks

- [x] 1. Docker development environment
  - [x] 1.1 Create multi-stage Dockerfile for the NestJS API
    - Create `docker/Dockerfile` with three stages: deps (npm ci), builder (npm run build), runner (node:20-alpine production)
    - Copy drizzle migrations into the production image
    - Create `docker/scripts/entrypoint.sh` that runs `npx drizzle-kit migrate` then starts the API
    - _Requirements: 14.3, 14.4, 14.6_

  - [x] 1.2 Create docker-compose.yml with all services
    - Define postgres (16-alpine), redis (7-alpine), and api services
    - Configure health checks for postgres (`pg_isready`) and redis (`redis-cli ping`)
    - Set `depends_on` with `condition: service_healthy` so API waits for dependencies
    - Expose ports: API 3000, Postgres 5432, Redis 6379
    - Create `.env.example` with all required environment variables
    - _Requirements: 14.1, 14.2, 14.5, 14.7_

  - [x] 1.3 Enhance health check endpoint with dependency verification
    - Update `apps/api/src/health.controller.ts` to check Postgres and Redis connectivity
    - Return HTTP 200 with `{ status: "ok" }` when all deps reachable
    - Return HTTP 503 with details indicating which dependency failed
    - Configure docker-compose API healthcheck to use `/health` with 10s interval and 30s start_period
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 2. Ledger service (double-entry accounting)
  - [x] 2.1 Create ledger module structure and DTOs
    - Create `apps/api/src/modules/payments/payments.module.ts` (shell)
    - Create `apps/api/src/modules/payments/ledger/` directory structure
    - Define `CreateTransactionInput` DTO with entries array (accountId, amount, direction)
    - Define `LedgerAccountType` enum: customer_wallet, provider_wallet, merchant_wallet, tenant_revenue, platform_fees, psp_clearing, cash_in_transit
    - _Requirements: 1.6_

  - [x] 2.2 Implement LedgerService core transaction creation
    - Implement `createTransaction()` that validates entries sum to zero (debits + credits balanced)
    - Execute all entry inserts within a single database transaction for atomicity
    - Reject and throw `BalancingError` if sum of entries != 0
    - Enforce append-only semantics (no update/delete operations exposed)
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 2.3 Implement LedgerService account balance and account management
    - Implement `getAccountBalance()` that computes balance as SUM of credits minus debits
    - Implement `getOrCreateAccount()` for creating named accounts by type and user
    - Implement `getAccountEntries()` with pagination support
    - _Requirements: 1.4, 1.6_

  - [x] 2.4 Add database trigger for ledger balance enforcement
    - Create Drizzle migration with `check_ledger_balance()` trigger function
    - Apply as a deferred constraint trigger on `ledger_entries` table
    - Trigger validates net amount = 0 per transaction after all entries inserted
    - _Requirements: 1.1, 1.2_

  - [x] 2.5 Write property tests for ledger balance invariant
    - **Property 1: Ledger Balance Invariant** — For any set of entries within a transaction, credits minus debits = 0
    - **Validates: Requirements 1.1, 1.2**

  - [x] 2.6 Write property tests for account balance consistency
    - **Property 3: Account Balance Consistency** — Reported balance equals sum of all credits minus sum of all debits for the account
    - **Validates: Requirements 1.4**

  - [x] 2.7 Write property test for ledger append-only semantics
    - **Property 2: Ledger Append-Only** — Any update/delete attempt on existing entries fails
    - **Validates: Requirements 1.3**

- [x] 3. PSP adapter implementations
  - [x] 3.1 Implement Stripe adapter
    - Create `packages/psp-adapters/src/stripe/stripe.adapter.ts` implementing `PspAdapter` interface
    - Implement `createPaymentIntent` returning client secret for client-side confirmation
    - Implement `refund` supporting full and partial refunds
    - Implement `verifyWebhook` validating Stripe signature header, returning `NormalizedWebhookEvent`
    - Implement `payout` using Stripe Connect transfers
    - Implement `createCustomer`, `confirm`, `createTransferRecipient`, `capabilities`
    - Use factory pattern: `static create(credentials)` for multi-tenant credential injection
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Implement Paystack adapter
    - Create `packages/psp-adapters/src/paystack/paystack.adapter.ts` implementing `PspAdapter` interface
    - Implement `createPaymentIntent` initializing Paystack transaction, returning authorization URL and reference
    - Implement `createTransferRecipient` registering bank account details with Paystack
    - Implement `payout` initiating Paystack transfer to registered recipient
    - Implement `verifyWebhook` validating Paystack secret hash, returning `NormalizedWebhookEvent`
    - Implement `createCustomer`, `confirm`, `refund`, `capabilities`
    - Use factory pattern: `static create(credentials)` for multi-tenant credential injection
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.3 Write unit tests for Stripe adapter
    - Test request/response mapping for all interface methods
    - Test signature verification with known valid and invalid fixtures
    - Test partial vs full refund logic
    - _Requirements: 3.4, 3.5_

  - [x] 3.4 Write unit tests for Paystack adapter
    - Test request/response mapping for all interface methods
    - Test hash verification with valid and invalid payloads
    - Test transfer recipient creation flow
    - _Requirements: 4.5, 4.6_

  - [x] 3.5 Write property test for webhook signature verification round-trip
    - **Property 7: Webhook Signature Verification Round-Trip** — For any payload + valid secret, sign then verify produces valid event; tampered signature throws error
    - **Validates: Requirements 3.4, 3.5, 4.5, 4.6**

- [x] 4. PSP connection service
  - [x] 4.1 Implement PSP connection service with credential encryption
    - Create `apps/api/src/modules/payments/psp-connection/psp-connection.service.ts`
    - Implement envelope encryption using platform KMS key for storing credentials
    - Implement `connect()` that encrypts and stores credentials in `psp_connections` table
    - Implement `decrypt()` that decrypts credentials in-memory without logging sensitive values
    - Enforce one active connection per PSP provider per tenant
    - _Requirements: 6.1, 6.5, 6.6_

  - [x] 4.2 Implement PSP connection verification and controller
    - Implement `verify()` that performs a test transaction (create + cancel small payment intent)
    - Mark connection as verified with timestamp on success; return error details on failure
    - Create `psp-connection.controller.ts` with POST `/psp-connections`, POST `/psp-connections/:id/verify`, GET `/psp-connections`
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 4.3 Implement PspResolverService for runtime adapter resolution
    - Create `apps/api/src/modules/payments/psp-connection/psp-resolver.service.ts`
    - Look up active psp_connection for tenant, decrypt credentials, return configured adapter instance
    - Register adapters via `PSP_ADAPTER_MAP` injection token
    - _Requirements: 6.5_

  - [x] 4.4 Write property test for credential encryption round-trip
    - **Property 9: PSP Credential Encryption Round-Trip** — Encrypting then decrypting any credentials returns original values; plaintext never persisted
    - **Validates: Requirements 6.1, 6.5**

- [x] 5. Checkpoint — Core payments infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Wallet service
  - [~] 6.1 Implement wallet top-up flow
    - Create `apps/api/src/modules/payments/wallet/wallet.service.ts`
    - Implement `topup()` that creates a payment intent via tenant's PSP adapter
    - On payment success (via webhook callback), credit customer's ledger account and debit psp_clearing
    - _Requirements: 2.1_

  - [~] 6.2 Implement P2P transfer
    - Implement `transfer()` that debits sender and credits recipient in a single ledger transaction
    - Validate sender has sufficient balance before creating entries; reject with `INSUFFICIENT_BALANCE` error
    - Validate amount is positive; reject zero/negative amounts with validation error
    - _Requirements: 2.2, 2.3, 2.4_

  - [~] 6.3 Implement balance query and refund
    - Implement `getBalance()` returning computed balance from LedgerService
    - Implement `refund()` that debits customer's account (or credits psp_clearing for source refunds) and invokes PSP adapter refund
    - _Requirements: 2.5, 2.6_

  - [~] 6.4 Create wallet controller with REST endpoints
    - Create `apps/api/src/modules/payments/wallet/wallet.controller.ts`
    - POST `/wallet/topup`, POST `/wallet/transfer`, GET `/wallet/balance`, POST `/wallet/refund`
    - Apply authentication guards and tenant context injection
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [ ] 6.5 Write property tests for P2P transfer conservation
    - **Property 4: P2P Transfer Conservation** — Sender's balance decrease equals recipient's balance increase exactly
    - **Validates: Requirements 2.2**

  - [ ] 6.6 Write property tests for insufficient balance and invalid amount rejection
    - **Property 5: Insufficient Balance Rejection** — Transfer exceeding balance is rejected; sender balance unchanged
    - **Property 6: Invalid Amount Rejection** — Zero/negative amounts rejected; no ledger entries created
    - **Validates: Requirements 2.3, 2.4**

- [ ] 7. Webhook ingress module
  - [~] 7.1 Create webhook module with ingress controller
    - Create `apps/api/src/modules/webhook/webhook.module.ts`
    - Create `webhook-ingress.controller.ts` with POST `/webhooks/:provider` endpoint
    - Preserve raw body for signature verification
    - Route to correct PSP adapter based on URL path parameter
    - Respond with HTTP 200 within acceptable time; return 401 for invalid signatures
    - _Requirements: 5.1, 5.3, 5.6_

  - [~] 7.2 Implement webhook service with deduplication and event publishing
    - Create `apps/api/src/modules/webhook/webhook.service.ts`
    - Normalize events into `NormalizedWebhookEvent` format
    - Deduplicate by `providerEventId` using Redis SET with 7-day TTL
    - Publish normalized events to BullMQ `webhook-events` queue
    - _Requirements: 5.2, 5.4_

  - [~] 7.3 Implement webhook processor with retry logic
    - Create BullMQ consumer for `webhook-events` queue
    - Route event types to handlers: `payment.succeeded` → WalletService.complete(), `refund.succeeded` → WalletService.refund()
    - Configure 3 retry attempts with exponential backoff; log failure after exhaustion
    - _Requirements: 5.5_

  - [ ] 7.4 Write property test for webhook idempotency
    - **Property 8: Webhook Idempotency** — Reprocessing same providerEventId produces no additional side effects and returns HTTP 200
    - **Validates: Requirements 5.4**

- [ ] 8. Billing module
  - [~] 8.1 Implement subscription service
    - Create `apps/api/src/modules/billing/billing.module.ts`
    - Create `subscription.service.ts` that creates Stripe Billing subscriptions for tenant plan tiers
    - Implement add/remove subscription items when modules are enabled/disabled
    - Sync invoice status from Stripe webhooks to local `invoices` table
    - Handle payment failures: update to `past_due`, initiate dunning flow with grace period
    - Store Stripe subscription ID and billing period on local `subscriptions` record
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [~] 8.2 Implement usage metering service
    - Create `usage.service.ts` that records usage_records (tenant ID, metric type, quantity)
    - Create `usage-push.processor.ts` as nightly BullMQ repeatable job
    - Aggregate and push usage records to Stripe metered usage API with idempotency keys
    - Retry 3x with exponential backoff on failure; alert ops team after exhaustion
    - Implement current-period usage query grouped by metric
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [~] 8.3 Create billing controller with REST endpoints
    - Create `subscription.controller.ts` with POST `/billing/subscriptions`, PATCH `/billing/subscriptions/:id/items`
    - Create usage endpoints: POST `/billing/usage` (record event), GET `/billing/usage` (query current period)
    - Apply platform admin guards for subscription management
    - _Requirements: 7.1, 8.1, 8.5_

  - [ ] 8.4 Write property test for usage record idempotency
    - **Property 10: Usage Record Idempotency** — Same idempotency key does not result in duplicate charges regardless of retry count
    - **Validates: Requirements 8.3**

- [ ] 9. Dashboard metrics API
  - [~] 9.1 Implement metrics service and controller
    - Create `apps/api/src/modules/dashboard/dashboard.module.ts`
    - Implement `MetricsService` with queries against tenant database
    - Compute GMV (sum actual_fare for completed jobs, 30 days) with growth percentage vs prior 30 days
    - Compute completed jobs count (30 days) with growth percentage
    - Compute active providers (currently online count)
    - Compute completion rate (completed / total non-expired for 30 days)
    - Create GET `/dashboard/metrics` endpoint
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.6_

  - [~] 9.2 Implement jobs-by-module endpoint
    - Implement daily job counts grouped by module type for last 7 days
    - Create GET `/dashboard/jobs-by-module` endpoint
    - Scope all queries to authenticated tenant's database context
    - _Requirements: 17.5, 17.6_

  - [ ] 9.3 Write property test for dashboard metrics tenant isolation
    - **Property 11: Dashboard Metrics Tenant Isolation** — Query for tenant A never includes data from tenant B's database
    - **Validates: Requirements 17.6**

- [~] 10. Checkpoint — Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Tenant portal — Project setup, layout, and authentication
  - [~] 11.1 Initialize Next.js 15 portal application
    - Create `apps/portal/` with Next.js 15 App Router, TypeScript, Tailwind CSS
    - Configure `tailwind.config.ts` with Vima design tokens: dark bg (#141414), orange accent (#FF6B3D), green success (#4ADE80)
    - Set up `next.config.ts` with API proxy/env configuration
    - Add clean sans-serif typeface; configure bold headings
    - _Requirements: 11.3, 11.4, 11.5, 11.7_

  - [~] 11.2 Implement portal authentication layer
    - Create `src/lib/auth.ts` with token storage (access token in memory, refresh via httpOnly cookie)
    - Create `src/lib/api-client.ts` fetch wrapper that attaches Bearer token, handles 401 with silent refresh
    - Create `src/hooks/use-auth.ts` for auth state management
    - Create Next.js middleware to check refresh cookie on protected routes; redirect to login if absent
    - _Requirements: 13.1, 13.2, 13.5, 13.6_

  - [~] 11.3 Create login page
    - Create `src/app/login/page.tsx` with email + password form
    - POST to `/auth/login`, store tokens, redirect to `/overview`
    - Verify user holds owner/admin/ops/finance role for the resolved tenant; show access denied if lacking
    - _Requirements: 13.1, 13.3, 13.4_

  - [~] 11.4 Implement sidebar navigation and root layout
    - Create `src/app/layout.tsx` with dark mode root layout (#141414 background)
    - Create `src/components/layout/sidebar.tsx` with navigation sections: Overview, Modules, Providers, Payments
    - Create `src/components/layout/nav-item.tsx` with active state highlighting (orange #FF6B3D)
    - Implement card-based layout with subtle borders on dark surfaces
    - Route to corresponding pages on click; highlight active item
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6_

- [ ] 12. Tenant portal — Overview dashboard
  - [~] 12.1 Implement dashboard metric cards
    - Create `src/components/dashboard/metric-card.tsx` displaying value, label, and growth indicator
    - Create `src/app/overview/page.tsx` fetching from `/dashboard/metrics`
    - Display cards for: GMV (30d), Completed Jobs (30d), Active Providers, Completion Rate
    - Show percentage change with green (#4ADE80) for positive growth
    - _Requirements: 9.1, 9.2_

  - [~] 12.2 Implement jobs-by-module bar chart
    - Create `src/components/dashboard/jobs-chart.tsx` with bar chart (last 7 days, grouped by module)
    - Highlight top-performing module with orange accent (#FF6B3D)
    - _Requirements: 9.3, 9.4_

  - [~] 12.3 Implement loading and error states
    - Create `src/components/dashboard/metric-skeleton.tsx` for skeleton loading states
    - Display skeleton states while data is loading
    - Show error state with retry button on API failure
    - _Requirements: 9.5, 9.6_

- [ ] 13. Tenant portal — Modules page
  - [~] 13.1 Implement module management page
    - Create `src/app/modules/page.tsx` displaying available modules with toggle switches
    - Display modules: Ride Hailing, Food Delivery, Courier, Groceries, Home Services
    - Fetch current entitlements state on page load to reflect toggle positions
    - _Requirements: 10.1, 10.6_

  - [~] 13.2 Implement module toggle logic with confirmation
    - Call entitlements API on toggle on; display success confirmation
    - Show confirmation dialog before disabling a module
    - Update billing subscription items via Billing_Service on state change
    - Revert toggle to previous state on API failure; display error message
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

- [ ] 14. Tenant portal — Providers page
  - [~] 14.1 Implement providers list page
    - Create `src/app/providers/page.tsx` with paginated provider table
    - Display columns: name, status (online/offline), rating, total completed jobs
    - Show total active providers count and breakdown by capability (ride, delivery, parcel)
    - Implement search/filter by name or phone number
    - _Requirements: 16.1, 16.2, 16.4_

  - [~] 14.2 Implement provider detail view
    - Create `src/app/providers/[id]/page.tsx` showing profile, documents, and earnings summary
    - Navigate to detail view on provider row click
    - _Requirements: 16.3_

- [ ] 15. Tenant portal — Payments page
  - [~] 15.1 Implement payments page with PSP connection status
    - Create `src/app/payments/page.tsx` displaying current PSP connection status
    - Show connected provider, verification state, last verified date
    - Display recent transactions summary (last 10 payments with status, amount, date) when verified
    - _Requirements: 12.1, 12.6_

  - [~] 15.2 Implement PSP setup flow
    - Create `src/components/payments/psp-setup-flow.tsx` for connecting Stripe or Paystack
    - Display setup prompt when no PSP is connected
    - Submit credentials to PSP_Connection API; show verification progress
    - Display success state with provider details on verification; show error with retry on failure
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

- [~] 16. Checkpoint — Portal pages complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Wire modules into AppModule and integration
  - [~] 17.1 Register all new modules in AppModule
    - Import PaymentsModule, WebhookModule, BillingModule, DashboardModule into `app.module.ts`
    - Ensure module dependency order is correct (DatabaseModule available globally)
    - Verify all controllers are accessible and guards are applied
    - _Requirements: 1.1–17.6 (integration)_

  - [~] 17.2 Wire webhook processor to wallet service completion
    - Ensure `payment.succeeded` events from webhook processor call `WalletService.completeTopup()`
    - Ensure `refund.succeeded` events trigger `WalletService.processRefund()`
    - Ensure module enable/disable events propagate to BillingModule subscription items
    - _Requirements: 2.1, 2.6, 7.2, 10.4_

  - [ ] 17.3 Write integration tests for webhook E2E flow
    - Send signed Stripe payload → verify signature → normalize → process → ledger entry created
    - Send signed Paystack payload → same flow verification
    - Send invalid signature → verify 401 response
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 17.4 Write integration tests for Docker environment
    - Verify `docker compose up` → all health checks pass → API responds at /health
    - Verify migrations run on fresh database before API starts accepting connections
    - _Requirements: 14.2, 14.6, 15.1_

- [~] 18. Final checkpoint — All tests passing, feature complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The portal uses Next.js 15 App Router with dark theme design tokens throughout
- PSP adapters use the factory pattern (`static create()`) so the same class serves multiple tenants
- All ledger operations are append-only; balance constraint enforced at both application and database layers
- BullMQ (Redis Streams) handles async webhook processing and nightly usage pushes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5", "2.6", "2.7", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "8.1"] },
    { "id": 5, "tasks": ["6.1", "6.2", "8.2", "8.3", "9.1"] },
    { "id": 6, "tasks": ["6.3", "6.4", "7.1", "8.4", "9.2"] },
    { "id": 7, "tasks": ["6.5", "6.6", "7.2", "9.3"] },
    { "id": 8, "tasks": ["7.3", "7.4", "11.1"] },
    { "id": 9, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 10, "tasks": ["12.1", "12.2", "12.3", "13.1"] },
    { "id": 11, "tasks": ["13.2", "14.1", "15.1"] },
    { "id": 12, "tasks": ["14.2", "15.2"] },
    { "id": 13, "tasks": ["17.1", "17.2"] },
    { "id": 14, "tasks": ["17.3", "17.4"] }
  ]
}
```
