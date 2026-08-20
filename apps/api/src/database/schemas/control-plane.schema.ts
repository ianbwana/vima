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

export const platformAuditLog = pgTable('platform_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id'),
  tenantId: uuid('tenant_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 100 }),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
