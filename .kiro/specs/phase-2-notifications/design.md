# Design: Notifications Service

## Architecture Overview

The notifications module follows the established patterns in the codebase: a NestJS module with BullMQ for async processing, Redis for rate limiting/deduplication, and tenant-aware database access via `TenantDbService`.

```
┌─────────────────────────────────────────────────────────────────┐
│  Calling Modules (Identity, Payments, Webhook, future verticals)│
│  ──────────────────────────────────────────────────────────────  │
│  Option A: NotificationService.send() (imperative)              │
│  Option B: EventEmitter events (declarative)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────┐
│           NotificationService             │
│  • Template resolution                    │
│  • Rate limit check (Redis)              │
│  • Quiet hours check                     │
│  • Deduplication (Redis SETNX)           │
│  • Enqueue to BullMQ 'notifications'     │
└───────────────────────────┬───────────────┘
                            │
                            ▼
┌───────────────────────────────────────────┐
│        NotificationProcessor              │
│  (BullMQ Worker, 10 concurrency)          │
│  • Resolve channel provider               │
│  • Render template with variables         │
│  • Call provider.send()                   │
│  • Log delivery status                    │
│  • On failure: attempt fallback channel   │
└───────────────────┬───────────────────────┘
                    │
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
   │ FCM    │  │ Twilio │  │ Resend │  │AfricaT │
   │Provider│  │Provider│  │Provider│  │Provider│
   └────────┘  └────────┘  └────────┘  └────────┘
```

## Module Structure

```
apps/api/src/modules/notifications/
├── notifications.module.ts
├── notifications.service.ts           # Core dispatch logic
├── notifications.processor.ts         # BullMQ worker
├── notifications.listener.ts          # Event-driven triggers
├── dto/
│   ├── send-notification.dto.ts
│   └── register-device.dto.ts
├── interfaces/
│   ├── channel-provider.interface.ts
│   └── notification-event.interface.ts
├── providers/
│   ├── fcm.provider.ts               # Firebase Cloud Messaging
│   ├── twilio-sms.provider.ts        # Twilio SMS
│   ├── twilio-whatsapp.provider.ts   # Twilio WhatsApp
│   ├── resend-email.provider.ts      # Resend email
│   └── africas-talking.provider.ts   # Africa's Talking SMS
├── templates/
│   ├── template.service.ts           # Template resolution & rendering
│   └── templates/                    # Default template definitions
│       ├── otp.template.ts
│       ├── payment.template.ts
│       └── index.ts
├── device/
│   ├── device.service.ts             # FCM token management
│   └── device.controller.ts          # Register/unregister endpoints
├── notifications.service.spec.ts
├── notifications.processor.spec.ts
└── notifications.properties.spec.ts
```

## Data Model

### Tenant DB additions (new tables in `tenant.schema.ts`)

```typescript
// Notification channel preferences
export const notificationChannelEnum = pgEnum('notification_channel', [
  'push', 'sms', 'whatsapp', 'email'
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'queued', 'sent', 'delivered', 'failed', 'rate_limited'
]);

// User device tokens for push notifications
export const userDevices = pgTable('user_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  deviceId: varchar('device_id', { length: 255 }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(), // 'ios', 'android', 'web'
  fcmToken: text('fcm_token').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User notification preferences (opt-outs)
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  category: varchar('category', { length: 100 }).notNull(), // 'marketing', 'trip_updates', 'promotions'
  channel: notificationChannelEnum('channel').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Notification delivery log
export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  channel: notificationChannelEnum('channel').notNull(),
  templateKey: varchar('template_key', { length: 100 }).notNull(),
  status: notificationStatusEnum('status').notNull(),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Control Plane DB additions (tenant-level configuration)

```typescript
// Tenant notification provider configuration (in control-plane.schema.ts)
export const tenantNotificationConfig = pgTable('tenant_notification_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  channel: varchar('channel', { length: 20 }).notNull(), // push, sms, whatsapp, email
  provider: varchar('provider', { length: 50 }).notNull(), // twilio, africas_talking, fcm, resend
  encryptedCredentials: text('encrypted_credentials').notNull(),
  region: varchar('region', { length: 50 }), // optional regional targeting
  fallbackChannel: varchar('fallback_channel', { length: 20 }), // fallback if primary fails
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Quiet hours config per tenant
export const tenantQuietHours = pgTable('tenant_quiet_hours', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  startHour: integer('start_hour').notNull(), // 0-23
  endHour: integer('end_hour').notNull(),     // 0-23
  timezone: varchar('timezone', { length: 50 }).notNull(), // IANA timezone
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

## Key Design Decisions

### 1. Async-first via BullMQ
All notifications are enqueued and processed asynchronously. The calling code never waits for delivery. This matches the existing webhook processing pattern.

### 2. Provider abstraction
A `ChannelProvider` interface allows swapping providers per tenant without changing dispatch logic. Same factory pattern as the PSP adapters.

### 3. Rate limiting with Redis
Use Redis sliding window counters (`INCR` + `EXPIRE`) per user per channel. Checked before enqueuing to avoid wasting queue capacity.

### 4. Template system
Templates are code-defined with a registry pattern. Each template declares its supported channels and variable schema. Tenant overrides are stored in the control plane DB and merged at render time.

### 5. Credential management
Reuse the same envelope encryption pattern from `PspConnectionService` for storing tenant notification provider credentials.

### 6. Fallback chain
If primary delivery fails (after retries), the processor checks for a fallback channel and re-enqueues a new job targeting it. Only one fallback level to prevent infinite loops.

## Integration Points

### Replacing OTP stub
`AuthService.requestOtp()` will call `NotificationService.send()` with template `otp.requested`, channel `sms`, and priority `critical` (bypasses rate limits/quiet hours).

### Event-driven notifications
A `NotificationListener` class uses `@OnEvent()` decorators to react to domain events:
- `otp.requested` → SMS to user's phone
- `payment.succeeded` → Push to customer
- `payout.completed` → Push to provider

### Future vertical integration
Ride-hailing, food delivery, etc. will emit events like `ride.driver_assigned`, `order.placed` that the listener maps to notification dispatches. New event mappings are added by extending the listener.

## API Endpoints

```
POST /notifications/devices          # Register FCM token
DELETE /notifications/devices/:id    # Unregister device
GET /notifications/preferences       # Get user notification preferences
PATCH /notifications/preferences     # Update opt-in/out preferences
GET /notifications/logs              # Delivery history (support debugging)
```

## Configuration (Environment Variables)

```
# Platform-level defaults (can be overridden per tenant)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SMS_FROM=
TWILIO_WHATSAPP_FROM=
FCM_PROJECT_ID=
FCM_SERVICE_ACCOUNT_KEY=   # base64-encoded JSON
RESEND_API_KEY=
RESEND_FROM_EMAIL=
AFRICAS_TALKING_API_KEY=
AFRICAS_TALKING_USERNAME=
```
