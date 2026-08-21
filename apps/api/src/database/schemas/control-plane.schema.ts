import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  integer,
  decimal,
} from 'drizzle-orm/pg-core';

// Enums
export const tenantStatusEnum = pgEnum('tenant_status', [
  'pending_verification',
  'provisioning',
  'active',
  'suspended',
  'offboarding',
]);

export const planTierEnum = pgEnum('plan_tier', ['starter', 'growth', 'scale']);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'cancelled',
  'suspended',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
]);

export const appBuildStatusEnum = pgEnum('app_build_status', [
  'queued',
  'building',
  'succeeded',
  'failed',
]);

export const appBuildPlatformEnum = pgEnum('app_build_platform', ['ios', 'android']);

export const pspProviderEnum = pgEnum('psp_provider', [
  'stripe',
  'paystack',
  'xendit',
  'mercado_pago',
]);

export const domainTypeEnum = pgEnum('domain_type', ['subdomain', 'custom']);

export const sslStatusEnum = pgEnum('ssl_status', ['pending', 'active', 'failed']);

export const tenantUserRoleEnum = pgEnum('tenant_user_role', [
  'owner',
  'admin',
  'ops',
  'finance',
  'support',
]);

// Tables
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  status: tenantStatusEnum('status').notNull().default('pending_verification'),
  tier: planTierEnum('tier').notNull().default('starter'),
  enabledModules: jsonb('enabled_modules').$type<string[]>().default([]),
  theme: jsonb('theme').$type<Record<string, unknown>>(),
  databaseName: varchar('database_name', { length: 255 }),
  trialEndsAt: timestamp('trial_ends_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tenantDomains = pgTable('tenant_domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  type: domainTypeEnum('type').notNull(),
  verified: boolean('verified').default(false).notNull(),
  sslStatus: sslStatusEnum('ssl_status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tenantUsers = pgTable('tenant_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  role: tenantUserRoleEnum('role').notNull(),
  userId: uuid('user_id'), // references user in tenant DB
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  tier: planTierEnum('tier').notNull(),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptionItems = pgTable('subscription_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  module: varchar('module', { length: 50 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  metric: varchar('metric', { length: 100 }).notNull(),
  quantity: integer('quantity').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pspConnections = pgTable('psp_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  provider: pspProviderEnum('provider').notNull(),
  encryptedCredentials: text('encrypted_credentials').notNull(), // envelope encrypted
  verified: boolean('verified').default(false).notNull(),
  lastVerifiedAt: timestamp('last_verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const appBuilds = pgTable('app_builds', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  platform: appBuildPlatformEnum('platform').notNull(),
  status: appBuildStatusEnum('status').notNull().default('queued'),
  config: jsonb('config').$type<Record<string, unknown>>(),
  artifactUrl: text('artifact_url'),
  errorMessage: text('error_message'),
  triggeredBy: uuid('triggered_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// --- NOTIFICATION CONFIGURATION ---

export const notificationProviderEnum = pgEnum('notification_provider', [
  'twilio',
  'africas_talking',
  'fcm',
  'resend',
  'ses',
]);

export const tenantNotificationConfig = pgTable('tenant_notification_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  channel: varchar('channel', { length: 20 }).notNull(), // push, sms, whatsapp, email
  provider: notificationProviderEnum('provider').notNull(),
  encryptedCredentials: text('encrypted_credentials').notNull(), // envelope encrypted
  region: varchar('region', { length: 50 }), // optional regional targeting (e.g., 'africa', 'europe')
  fallbackChannel: varchar('fallback_channel', { length: 20 }), // channel to try if primary fails
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tenantQuietHours = pgTable('tenant_quiet_hours', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  startHour: integer('start_hour').notNull(), // 0-23
  endHour: integer('end_hour').notNull(), // 0-23
  timezone: varchar('timezone', { length: 50 }).notNull(), // IANA timezone e.g. 'Africa/Nairobi'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- AUDIT ---

export const platformAuditLog = pgTable('platform_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id'),
  tenantId: uuid('tenant_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 100 }),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- WHITE-LABEL & THEMING ---

export const assetTypeEnum = pgEnum('asset_type', [
  'logo',
  'splash',
  'icon',
  'hero',
  'guideline',
  'app_icon',
  'favicon',
]);

export const tenantThemes = pgTable('tenant_themes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  tokens: jsonb('tokens').$type<Record<string, unknown>>().notNull(),
  published: boolean('published').default(false).notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tenantAssets = pgTable('tenant_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  type: assetTypeEnum('type').notNull(),
  url: text('url').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- APP GENERATOR ---

export const appSurfaceEnum = pgEnum('app_surface', ['customer', 'provider']);
export const appEnvironmentEnum = pgEnum('app_environment', ['production', 'preview', 'demo']);
export const credentialModeEnum = pgEnum('credential_mode', ['platform_managed', 'tenant_owned']);
export const keyTypeEnum = pgEnum('key_type', [
  'google_maps',
  'firebase',
  'psp_publishable',
  'sentry',
  'mapbox',
]);
export const moderationStatusEnum = pgEnum('moderation_status', ['pending', 'approved', 'flagged', 'rejected']);
export const smokeStatusEnum = pgEnum('smoke_status', ['pending', 'running', 'passed', 'failed']);
export const storeStatusEnum = pgEnum('store_status', [
  'not_submitted',
  'submitted',
  'in_review',
  'approved',
  'rejected',
]);

export const appProjects = pgTable('app_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  surface: appSurfaceEnum('surface').notNull(),
  platform: appBuildPlatformEnum('platform').notNull(),
  bundleId: varchar('bundle_id', { length: 255 }).notNull(),
  easProjectId: varchar('eas_project_id', { length: 255 }),
  credentialMode: credentialModeEnum('credential_mode').notNull().default('platform_managed'),
  storeListingState: jsonb('store_listing_state').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tenantEndpoints = pgTable('tenant_endpoints', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  environment: appEnvironmentEnum('environment').notNull(),
  endpointDocument: jsonb('endpoint_document').$type<{
    apiBaseUrl: string;
    realtimeUrl: string;
    assetsBaseUrl: string;
    configUrl: string;
  }>().notNull(),
  domainState: varchar('domain_state', { length: 50 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const appKeyGrants = pgTable('app_key_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  appProjectId: uuid('app_project_id')
    .references(() => appProjects.id),
  keyType: keyTypeEnum('key_type').notNull(),
  environment: appEnvironmentEnum('environment').notNull(),
  vendorRef: varchar('vendor_ref', { length: 255 }),
  restrictionState: varchar('restriction_state', { length: 50 }),
  encryptedValue: text('encrypted_value'),
  rotatedAt: timestamp('rotated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const buildManifests = pgTable('build_manifests', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  surface: appSurfaceEnum('surface').notNull(),
  version: integer('version').notNull(),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
  assetPackHash: varchar('asset_pack_hash', { length: 64 }),
  codebaseSha: varchar('codebase_sha', { length: 40 }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const assetRecords = pgTable('asset_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  kind: varchar('kind', { length: 50 }).notNull(), // logo, icon, splash, notification_icon, onboarding, sound
  surfaceVariant: varchar('surface_variant', { length: 20 }).notNull().default('shared'), // shared, customer, provider
  originalUrl: text('original_url').notNull(),
  originalHash: varchar('original_hash', { length: 64 }).notNull(),
  packHash: varchar('pack_hash', { length: 64 }),
  moderationStatus: moderationStatusEnum('moderation_status').notNull().default('pending'),
  rightsDeclaration: boolean('rights_declaration').default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const demoSessions = pgTable('demo_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  surface: appSurfaceEnum('surface').notNull(),
  cohortId: uuid('cohort_id'), // links paired customer+provider demos
  manifestDraftVersion: integer('manifest_draft_version'),
  channel: varchar('channel', { length: 255 }),
  easUpdateId: varchar('eas_update_id', { length: 255 }),
  createdBy: uuid('created_by'),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const soundLibrary = pgTable('sound_library', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: varchar('event_type', { length: 100 }).notNull(), // order_status, driver_arrived, payment_success, job_offer, job_cancelled, payout_confirmed
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  fileUrl: text('file_url').notNull(),
  durationSeconds: decimal('duration_seconds', { precision: 5, scale: 1 }),
  licenseRef: varchar('license_ref', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const updatePublishes = pgTable('update_publishes', {
  id: uuid('id').defaultRandom().primaryKey(),
  channel: varchar('channel', { length: 255 }).notNull(),
  easUpdateId: varchar('eas_update_id', { length: 255 }),
  codebaseSha: varchar('codebase_sha', { length: 40 }),
  rolloutStage: integer('rollout_stage').notNull().default(100), // 5, 50, 100
  publishedBy: uuid('published_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
