# Requirements Document

## Introduction

Phase 1 of the Vima platform builds upon Phase 0 foundations (tenancy, identity, entitlements) to deliver three pillars: a double-entry payments core with PSP integrations, a tenant administration portal (Next.js), and Docker-based local development infrastructure. Together these enable tenants to connect payment providers, process wallet operations, manage their platform configuration visually, and give developers a reproducible local environment.

## Glossary

- **Ledger_Service**: The double-entry accounting service that manages wallet balances through append-only ledger entries within a tenant database
- **PSP_Adapter**: An implementation of the PspAdapter interface that communicates with a specific payment service provider (Stripe, Paystack)
- **Webhook_Ingress**: The isolated service endpoint that receives, verifies, and normalizes incoming PSP webhook events
- **Wallet_Service**: The service managing wallet top-ups, P2P transfers, and balance queries backed by the Ledger_Service
- **Billing_Service**: The service managing platform billing for tenants via Stripe Billing (subscriptions, metered usage, invoices)
- **Tenant_Portal**: The Next.js web application that provides tenant administrators with a dashboard and management interface
- **PSP_Connection**: A verified link between a tenant and a payment service provider, storing envelope-encrypted credentials
- **Ledger_Transaction**: A group of ledger entries that together sum to zero, representing a single atomic money movement
- **Ledger_Entry**: A single debit or credit line within a Ledger_Transaction, referencing a Ledger_Account
- **Ledger_Account**: A named account (e.g., customer_wallet, psp_clearing) within the tenant database that accumulates entries
- **Docker_Environment**: The Docker Compose setup providing local development services (API, Postgres, Redis)
- **Platform_Admin**: A user with access to manage the Vima control plane
- **Tenant_Admin**: A user with owner/admin role within a specific tenant, accessing the Tenant_Portal
- **Usage_Record**: A metered billing event (per completed job, per app build, per SMS) recorded against a tenant

---

## Requirements

### Requirement 1: Double-Entry Ledger Operations

**User Story:** As a platform developer, I want all monetary operations to be recorded as balanced double-entry ledger transactions, so that financial integrity is guaranteed and auditable.

#### Acceptance Criteria

1. WHEN the Ledger_Service creates a Ledger_Transaction, THE Ledger_Service SHALL insert two or more Ledger_Entry rows whose amounts sum to exactly zero (debits and credits balanced)
2. IF the sum of Ledger_Entry amounts within a Ledger_Transaction does not equal zero, THEN THE Ledger_Service SHALL reject the transaction and return a balancing error
3. THE Ledger_Service SHALL enforce append-only semantics on Ledger_Entry rows, preventing any update or deletion of existing entries
4. WHEN the Ledger_Service computes a Ledger_Account balance, THE Ledger_Service SHALL calculate it as the sum of all Ledger_Entry amounts for that account (credits positive, debits negative)
5. WHEN a Ledger_Transaction is created, THE Ledger_Service SHALL execute all entries within a single database transaction to ensure atomicity
6. THE Ledger_Service SHALL support these Ledger_Account types: customer_wallet, provider_wallet, merchant_wallet, tenant_revenue, platform_fees, psp_clearing, cash_in_transit

---

### Requirement 2: Wallet Operations

**User Story:** As a customer, I want to top up my wallet, transfer funds to another user, and view my balance, so that I can use stored value for platform services.

#### Acceptance Criteria

1. WHEN a customer requests a wallet top-up, THE Wallet_Service SHALL create a payment intent via the tenant's configured PSP_Adapter and, upon payment success, credit the customer's Ledger_Account and debit the psp_clearing account
2. WHEN a customer initiates a P2P transfer to another user within the same tenant, THE Wallet_Service SHALL debit the sender's Ledger_Account and credit the recipient's Ledger_Account in a single Ledger_Transaction
3. IF a customer attempts a P2P transfer with an amount exceeding their available balance, THEN THE Wallet_Service SHALL reject the transfer and return an insufficient balance error
4. IF a customer attempts a P2P transfer with an amount that is zero or negative, THEN THE Wallet_Service SHALL reject the transfer and return a validation error
5. WHEN a customer queries their wallet balance, THE Wallet_Service SHALL return the computed balance from the Ledger_Service for that customer's Ledger_Account
6. WHEN an admin initiates a refund for a completed payment, THE Wallet_Service SHALL debit the customer's Ledger_Account (or credit via psp_clearing for source refunds) and invoke the PSP_Adapter refund method

---

### Requirement 3: Stripe PSP Adapter

**User Story:** As a tenant operating in Stripe-supported markets, I want to accept payments, issue refunds, and perform payouts through Stripe, so that my customers and providers can transact.

#### Acceptance Criteria

1. THE Stripe PSP_Adapter SHALL implement the full PspAdapter interface: createCustomer, createPaymentIntent, confirm, refund, createTransferRecipient, payout, verifyWebhook, and capabilities
2. WHEN the Stripe PSP_Adapter creates a payment intent, THE Stripe PSP_Adapter SHALL return a client secret suitable for client-side confirmation
3. WHEN the Stripe PSP_Adapter processes a refund, THE Stripe PSP_Adapter SHALL support both full and partial refunds based on the provided amount
4. WHEN the Stripe PSP_Adapter verifies a webhook, THE Stripe PSP_Adapter SHALL validate the Stripe signature header and return a NormalizedWebhookEvent
5. IF the Stripe webhook signature is invalid, THEN THE Stripe PSP_Adapter SHALL throw a signature verification error
6. WHEN the Stripe PSP_Adapter creates a payout, THE Stripe PSP_Adapter SHALL use Stripe Connect transfers to move funds to the recipient's connected account

---

### Requirement 4: Paystack PSP Adapter

**User Story:** As a tenant operating in African markets (NG, GH, KE, ZA), I want to accept payments and perform bank transfers through Paystack, so that my local customers and providers can transact.

#### Acceptance Criteria

1. THE Paystack PSP_Adapter SHALL implement the full PspAdapter interface: createCustomer, createPaymentIntent, confirm, refund, createTransferRecipient, payout, verifyWebhook, and capabilities
2. WHEN the Paystack PSP_Adapter creates a payment intent, THE Paystack PSP_Adapter SHALL initialize a Paystack transaction and return the authorization URL and reference
3. WHEN the Paystack PSP_Adapter creates a transfer recipient, THE Paystack PSP_Adapter SHALL register the bank account details with Paystack and return the recipient code
4. WHEN the Paystack PSP_Adapter processes a payout, THE Paystack PSP_Adapter SHALL initiate a Paystack transfer to the registered recipient
5. WHEN the Paystack PSP_Adapter verifies a webhook, THE Paystack PSP_Adapter SHALL validate the request using the Paystack secret hash and return a NormalizedWebhookEvent
6. IF the Paystack webhook hash is invalid, THEN THE Paystack PSP_Adapter SHALL throw a signature verification error

---

### Requirement 5: Webhook Ingress Service

**User Story:** As the platform, I want to securely receive and process PSP webhook events, so that payment state transitions are reliably captured and propagated.

#### Acceptance Criteria

1. WHEN the Webhook_Ingress receives a webhook request, THE Webhook_Ingress SHALL route it to the correct PSP_Adapter based on the URL path (e.g., /webhooks/stripe, /webhooks/paystack)
2. WHEN the Webhook_Ingress receives a valid webhook, THE Webhook_Ingress SHALL normalize the event into a NormalizedWebhookEvent and publish it to the internal event bus
3. IF the Webhook_Ingress receives a webhook with an invalid signature, THEN THE Webhook_Ingress SHALL respond with HTTP 401 and discard the event
4. WHEN the Webhook_Ingress processes an event, THE Webhook_Ingress SHALL deduplicate by providerEventId to ensure idempotent handling
5. IF processing of a webhook event fails, THEN THE Webhook_Ingress SHALL retry with exponential backoff up to 3 attempts before logging the failure
6. THE Webhook_Ingress SHALL respond with HTTP 200 within 5 seconds of receiving the request to avoid PSP timeout retries

---

### Requirement 6: Tenant PSP Connection

**User Story:** As a tenant admin, I want to connect my PSP account to the platform and verify it works, so that my business can accept payments.

#### Acceptance Criteria

1. WHEN a Tenant_Admin submits PSP credentials, THE PSP_Connection service SHALL envelope-encrypt the credentials using the platform KMS key and store them in the psp_connections table
2. WHEN a Tenant_Admin requests verification of a PSP_Connection, THE PSP_Connection service SHALL perform a test transaction (e.g., create and immediately cancel a small payment intent) to validate the credentials
3. IF the test transaction succeeds, THEN THE PSP_Connection service SHALL mark the connection as verified and record the verification timestamp
4. IF the test transaction fails, THEN THE PSP_Connection service SHALL return the error details and leave the connection unverified
5. WHEN a payment operation requires PSP credentials, THE PSP_Connection service SHALL decrypt the credentials in-memory and provide them to the PSP_Adapter without logging any sensitive values
6. THE PSP_Connection service SHALL support one active connection per PSP provider per tenant

---

### Requirement 7: Platform Billing — Subscriptions

**User Story:** As the platform operator, I want tenants billed automatically based on their plan tier and enabled modules, so that recurring revenue is collected reliably.

#### Acceptance Criteria

1. WHEN a tenant selects a plan tier during onboarding, THE Billing_Service SHALL create a Stripe Billing subscription with the corresponding base price
2. WHEN a tenant enables or disables a module, THE Billing_Service SHALL add or remove the corresponding subscription item on the Stripe subscription
3. WHEN Stripe generates an invoice, THE Billing_Service SHALL sync the invoice status to the local invoices table via webhook
4. IF a Stripe invoice payment fails, THEN THE Billing_Service SHALL update the subscription status to past_due and initiate the dunning flow
5. WHEN a subscription enters dunning, THE Billing_Service SHALL apply a grace period with read-only banners before transitioning the tenant to suspended status
6. THE Billing_Service SHALL store the Stripe subscription ID and current billing period on the local subscriptions record

---

### Requirement 8: Platform Billing — Usage Metering

**User Story:** As the platform operator, I want to bill tenants for usage-based metrics (completed jobs, app builds, SMS), so that costs scale with tenant activity.

#### Acceptance Criteria

1. WHEN a billable event occurs (job completed, app build triggered, SMS sent), THE Billing_Service SHALL record a usage_record with the tenant ID, metric type, and quantity
2. THE Billing_Service SHALL aggregate and push usage records to Stripe Billing metered usage API nightly
3. WHEN pushing usage records to Stripe, THE Billing_Service SHALL use idempotency keys to prevent duplicate charges
4. IF the nightly usage push fails, THEN THE Billing_Service SHALL retry with exponential backoff and alert the platform operations team after 3 failures
5. WHEN a tenant queries their current usage, THE Billing_Service SHALL return accumulated usage records for the current billing period grouped by metric

---

### Requirement 9: Tenant Portal — Overview Dashboard

**User Story:** As a tenant admin, I want to see key business metrics at a glance on my dashboard, so that I can monitor platform health without navigating multiple screens.

#### Acceptance Criteria

1. WHEN a Tenant_Admin loads the overview dashboard, THE Tenant_Portal SHALL display metric cards for: GMV (last 30 days), Completed Jobs (last 30 days), Active Providers, and Completion Rate
2. WHEN displaying metric cards, THE Tenant_Portal SHALL include growth indicators showing percentage change compared to the previous 30-day period
3. WHEN a Tenant_Admin views the dashboard, THE Tenant_Portal SHALL display a bar chart showing jobs grouped by module for the last 7 days
4. THE Tenant_Portal SHALL highlight the top-performing module in the bar chart using the orange accent color (#FF6B3D)
5. WHEN the dashboard data is loading, THE Tenant_Portal SHALL display skeleton loading states for each metric card and chart
6. IF the dashboard API request fails, THEN THE Tenant_Portal SHALL display an error state with a retry option

---

### Requirement 10: Tenant Portal — Module Management

**User Story:** As a tenant admin, I want to enable and disable platform modules from the portal, so that I can configure which services my customers can access.

#### Acceptance Criteria

1. WHEN a Tenant_Admin navigates to the Modules page, THE Tenant_Portal SHALL display a list of available modules (Ride Hailing, Food Delivery, Courier, Groceries, Home Services) with toggle switches indicating their current state
2. WHEN a Tenant_Admin toggles a module on, THE Tenant_Portal SHALL call the entitlements API to enable the module and display a success confirmation
3. WHEN a Tenant_Admin toggles a module off, THE Tenant_Portal SHALL display a confirmation dialog before disabling the module
4. WHEN a module toggle state changes, THE Tenant_Portal SHALL update the billing subscription items via the Billing_Service
5. IF a module toggle API call fails, THEN THE Tenant_Portal SHALL revert the toggle to its previous state and display an error message
6. THE Tenant_Portal SHALL reflect the current entitlements state by fetching the tenant's enabled modules on page load

---

### Requirement 11: Tenant Portal — Navigation and Layout

**User Story:** As a tenant admin, I want a clear, consistent navigation structure, so that I can access all portal features efficiently.

#### Acceptance Criteria

1. THE Tenant_Portal SHALL display a left sidebar navigation with sections: Overview, Modules, Providers, and Payments
2. WHEN a Tenant_Admin clicks a navigation item, THE Tenant_Portal SHALL route to the corresponding page and highlight the active item
3. THE Tenant_Portal SHALL use dark mode (#141414 background) as the default theme with an option to switch to light mode
4. THE Tenant_Portal SHALL use the orange/coral accent color (#FF6B3D) for primary actions, CTAs, and active navigation states
5. THE Tenant_Portal SHALL use green (#4ADE80) for positive indicators and success states throughout the interface
6. THE Tenant_Portal SHALL use a card-based layout with subtle borders on dark surfaces for content grouping
7. THE Tenant_Portal SHALL use a clean sans-serif typeface with bold weight for headings and metric values

---

### Requirement 12: Tenant Portal — Payments Page

**User Story:** As a tenant admin, I want to view my PSP connection status and manage payment settings from the portal, so that I can oversee my payment infrastructure.

#### Acceptance Criteria

1. WHEN a Tenant_Admin navigates to the Payments page, THE Tenant_Portal SHALL display the current PSP connection status (connected provider, verification state, last verified date)
2. WHEN no PSP is connected, THE Tenant_Portal SHALL display a setup flow prompting the Tenant_Admin to connect Stripe or Paystack
3. WHEN a Tenant_Admin submits PSP credentials via the setup flow, THE Tenant_Portal SHALL call the PSP_Connection API and display verification progress
4. WHEN PSP verification completes successfully, THE Tenant_Portal SHALL display a success state with the connected provider details
5. IF PSP verification fails, THEN THE Tenant_Portal SHALL display the error details and allow the Tenant_Admin to retry with corrected credentials
6. WHEN a Tenant_Admin views the Payments page with a verified connection, THE Tenant_Portal SHALL display recent transactions summary (last 10 payments with status, amount, date)

---

### Requirement 13: Tenant Portal — Authentication and Authorization

**User Story:** As a tenant admin, I want secure access to the portal with role-based permissions, so that only authorized users can manage tenant settings.

#### Acceptance Criteria

1. WHEN a Tenant_Admin accesses the portal, THE Tenant_Portal SHALL require authentication via JWT token issued by the Identity service
2. IF the JWT token is expired or invalid, THEN THE Tenant_Portal SHALL redirect the user to the login page
3. WHEN a user authenticates, THE Tenant_Portal SHALL verify that the user holds an owner, admin, ops, or finance role for the resolved tenant
4. IF a user lacks the required role, THEN THE Tenant_Portal SHALL display an access denied message and prevent portal access
5. THE Tenant_Portal SHALL include the tenant context (from JWT tenantId claim) in all API requests to the backend
6. WHEN a session is active, THE Tenant_Portal SHALL refresh the access token automatically before expiration

---

### Requirement 14: Docker Development Environment

**User Story:** As a developer, I want a single command to start all local services with correct configuration, so that I can develop and test without manual environment setup.

#### Acceptance Criteria

1. THE Docker_Environment SHALL provide a docker-compose.yml that starts the NestJS API, PostgreSQL, and Redis services
2. WHEN a developer runs `docker compose up`, THE Docker_Environment SHALL start all services with health checks and dependency ordering (Postgres and Redis healthy before API starts)
3. THE Docker_Environment SHALL provide a multi-stage Dockerfile for the NestJS API with separate build and production stages
4. WHEN building the production stage, THE Dockerfile SHALL produce an image using a minimal Node.js base (alpine) with only production dependencies installed
5. THE Docker_Environment SHALL configure environment variables for database connections, Redis URL, and JWT secrets via a .env.example template
6. WHEN the API container starts, THE Docker_Environment SHALL run database migrations automatically before accepting connections
7. THE Docker_Environment SHALL expose the API on port 3000, PostgreSQL on port 5432, and Redis on port 6379 to the host machine

---

### Requirement 15: API Health Checks

**User Story:** As a developer and the orchestration layer, I want health check endpoints that verify service connectivity, so that container readiness can be determined reliably.

#### Acceptance Criteria

1. WHEN a health check request is received at /health, THE API SHALL return HTTP 200 with status "ok" when all dependencies (Postgres, Redis) are reachable
2. IF PostgreSQL is unreachable during a health check, THEN THE API SHALL return HTTP 503 with details indicating the database connection failure
3. IF Redis is unreachable during a health check, THEN THE API SHALL return HTTP 503 with details indicating the Redis connection failure
4. THE Docker_Environment SHALL configure container health checks using the /health endpoint with a 10-second interval and 30-second startup grace period

---

### Requirement 16: Tenant Portal — Providers Page

**User Story:** As a tenant admin, I want to view and manage my service providers, so that I can oversee the supply side of my platform.

#### Acceptance Criteria

1. WHEN a Tenant_Admin navigates to the Providers page, THE Tenant_Portal SHALL display a paginated list of providers with name, status (online/offline), rating, and total completed jobs
2. WHEN a Tenant_Admin searches for a provider, THE Tenant_Portal SHALL filter the provider list by name or phone number
3. WHEN a Tenant_Admin clicks on a provider row, THE Tenant_Portal SHALL navigate to a provider detail view showing profile, documents, and earnings summary
4. THE Tenant_Portal SHALL display the total count of active providers and a breakdown by capability (ride, delivery, parcel)

---

### Requirement 17: Dashboard Metrics API

**User Story:** As the tenant portal, I want API endpoints that compute and return dashboard metrics, so that the frontend can display real-time business data.

#### Acceptance Criteria

1. WHEN the dashboard metrics endpoint is called, THE API SHALL return GMV (sum of completed job actual_fare) for the last 30 days and the percentage change from the prior 30 days
2. WHEN the dashboard metrics endpoint is called, THE API SHALL return the count of completed jobs for the last 30 days and the percentage change from the prior 30 days
3. WHEN the dashboard metrics endpoint is called, THE API SHALL return the count of providers currently marked as online
4. WHEN the dashboard metrics endpoint is called, THE API SHALL return the completion rate (completed jobs / total non-expired jobs) for the last 30 days
5. WHEN the jobs-by-module endpoint is called, THE API SHALL return daily job counts grouped by module type for the last 7 days
6. THE API SHALL scope all dashboard metrics to the authenticated tenant's database context
