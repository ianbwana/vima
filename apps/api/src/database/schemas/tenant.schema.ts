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
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'banned']);
export const authTypeEnum = pgEnum('auth_type', ['otp', 'password']);
export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'provider',
  'merchant',
  'owner',
  'admin',
  'ops',
  'finance',
  'support',
]);
export const ledgerDirectionEnum = pgEnum('ledger_direction', ['debit', 'credit']);
export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'customer_wallet',
  'provider_wallet',
  'merchant_wallet',
  'tenant_revenue',
  'platform_fees',
  'psp_clearing',
  'cash_in_transit',
]);
export const jobStatusEnum = pgEnum('job_status', [
  'created',
  'matching',
  'offered',
  'accepted',
  'arriving',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
]);
export const jobTypeEnum = pgEnum('job_type', ['ride', 'delivery_leg', 'parcel']);

// --- USERS & AUTH ---

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userAuth = pgTable('user_auth', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: authTypeEnum('type').notNull(),
  credentialHash: text('credential_hash').notNull(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  deviceId: varchar('device_id', { length: 255 }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userRoles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  role: userRoleEnum('role').notNull(),
  grantedBy: uuid('granted_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const otpAttempts = pgTable('otp_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 50 }).notNull(),
  otpHash: text('otp_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  verified: boolean('verified').default(false).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- PROVIDERS ---

export const providers = pgTable('providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  isOnline: boolean('is_online').default(false).notNull(),
  lastLocationLat: decimal('last_location_lat', { precision: 10, scale: 7 }),
  lastLocationLng: decimal('last_location_lng', { precision: 10, scale: 7 }),
  lastLocationAt: timestamp('last_location_at'),
  capabilities: jsonb('capabilities').$type<string[]>().default([]), // ['ride', 'delivery', 'parcel']
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  totalJobs: integer('total_jobs').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id),
  vehicleClassId: uuid('vehicle_class_id'),
  make: varchar('make', { length: 100 }),
  model: varchar('model', { length: 100 }),
  year: integer('year'),
  plate: varchar('plate', { length: 20 }).notNull(),
  color: varchar('color', { length: 50 }),
  verified: boolean('verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: varchar('type', { length: 100 }).notNull(), // license, insurance, id_card, etc.
  fileUrl: text('file_url').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, approved, rejected
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- LEDGER ---

export const ledgerAccounts = pgTable('ledger_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id), // null for system accounts
  type: ledgerAccountTypeEnum('type').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ledgerTransactions = pgTable('ledger_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: varchar('type', { length: 100 }).notNull(), // payment, payout, p2p_transfer, fare, commission, refund
  referenceId: uuid('reference_id'), // links to payment, job, etc.
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id')
    .notNull()
    .references(() => ledgerTransactions.id),
  accountId: uuid('account_id')
    .notNull()
    .references(() => ledgerAccounts.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  direction: ledgerDirectionEnum('direction').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- JOBS & LOGISTICS ---

export const zones = pgTable('zones', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  // PostGIS polygon stored as GeoJSON text for now; migrate to geometry column with PostGIS extension
  boundary: jsonb('boundary').$type<Record<string, unknown>>().notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: jobTypeEnum('type').notNull(),
  status: jobStatusEnum('status').notNull().default('created'),
  customerId: uuid('customer_id').references(() => users.id),
  providerId: uuid('provider_id').references(() => providers.id),
  zoneId: uuid('zone_id').references(() => zones.id),
  pickupLat: decimal('pickup_lat', { precision: 10, scale: 7 }),
  pickupLng: decimal('pickup_lng', { precision: 10, scale: 7 }),
  pickupAddress: text('pickup_address'),
  dropoffLat: decimal('dropoff_lat', { precision: 10, scale: 7 }),
  dropoffLng: decimal('dropoff_lng', { precision: 10, scale: 7 }),
  dropoffAddress: text('dropoff_address'),
  estimatedFare: decimal('estimated_fare', { precision: 10, scale: 2 }),
  actualFare: decimal('actual_fare', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 3 }).default('USD'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at'),
  completedAt: timestamp('completed_at'),
});

export const jobEvents = pgTable('job_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  status: jobStatusEnum('status').notNull(),
  actorId: uuid('actor_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- NOTIFICATIONS ---

export const notificationChannelEnum = pgEnum('notification_channel', [
  'push',
  'sms',
  'whatsapp',
  'email',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'failed',
  'rate_limited',
]);

export const devicePlatformEnum = pgEnum('device_platform', ['ios', 'android', 'web']);

export const userDevices = pgTable('user_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  deviceId: varchar('device_id', { length: 255 }).notNull(),
  platform: devicePlatformEnum('platform').notNull(),
  fcmToken: text('fcm_token').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  category: varchar('category', { length: 100 }).notNull(), // 'marketing', 'trip_updates', 'promotions', 'order_updates'
  channel: notificationChannelEnum('channel').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  channel: notificationChannelEnum('channel').notNull(),
  templateKey: varchar('template_key', { length: 100 }).notNull(),
  status: notificationStatusEnum('status').notNull(),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- RATINGS ---

export const ratings = pgTable('ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  fromUserId: uuid('from_user_id')
    .notNull()
    .references(() => users.id),
  toUserId: uuid('to_user_id')
    .notNull()
    .references(() => users.id),
  score: integer('score').notNull(), // 1-5
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
