# Implementation Plan: Phase 2 — Notifications Service

## Overview

This plan implements the cross-cutting notifications infrastructure: a pluggable multi-channel dispatch system with push (FCM), SMS (Twilio/Africa's Talking), WhatsApp, and email (Resend). It integrates with the existing identity module to replace the OTP stub and provides event-driven hooks for future verticals (ride-hailing, food delivery).

**Language**: TypeScript (NestJS)
**Testing**: Jest (unit), fast-check (property-based)

## Tasks

- [x] 1. Module scaffolding and data model
  - [x] 1.1 Create notifications module structure
    - Create `apps/api/src/modules/notifications/notifications.module.ts` (shell)
    - Create directory structure: `dto/`, `interfaces/`, `providers/`, `templates/`, `device/`
    - Register BullMQ queue `'notifications'` in module imports
    - _Requirements: 1.1, 1.3_

  - [x] 1.2 Define interfaces and DTOs
    - Create `interfaces/channel-provider.interface.ts` with `ChannelProvider` interface: `send(recipient, message): Promise<ProviderResult>`
    - Create `interfaces/notification-event.interface.ts` with `NotificationPayload` type
    - Create `dto/send-notification.dto.ts` with validation decorators
    - Create `dto/register-device.dto.ts` for FCM token registration
    - _Requirements: 2.1, 1.1_

  - [x] 1.3 Add notification tables to tenant schema
    - Add `notificationChannelEnum`, `notificationStatusEnum` to `tenant.schema.ts`
    - Add `userDevices` table (userId, deviceId, platform, fcmToken, active)
    - Add `notificationPreferences` table (userId, category, channel, enabled)
    - Add `notificationLogs` table (userId, channel, templateKey, status, providerMessageId, errorMessage)
    - _Requirements: 4.1, 4.5, 6.1_

  - [x] 1.4 Add tenant notification config to control plane schema
    - Add `tenantNotificationConfig` table (tenantId, channel, provider, encryptedCredentials, region, fallbackChannel)
    - Add `tenantQuietHours` table (tenantId, startHour, endHour, timezone)
    - _Requirements: 2.6, 5.3_

  - [x] 1.5 Create Drizzle migration for new tables
    - Generate migration SQL for tenant DB tables (user_devices, notification_preferences, notification_logs)
    - Generate migration SQL for control plane tables (tenant_notification_config, tenant_quiet_hours)
    - _Requirements: 4.1, 6.1_

- [x] 2. Channel providers
  - [x] 2.1 Implement Twilio SMS provider
    - Create `providers/twilio-sms.provider.ts` implementing `ChannelProvider`
    - Use Twilio REST API to send SMS messages
    - Return provider message SID on success
    - Handle Twilio error codes gracefully (invalid number, rate limit)
    - _Requirements: 2.2_

  - [x] 2.2 Implement Twilio WhatsApp provider
    - Create `providers/twilio-whatsapp.provider.ts` implementing `ChannelProvider`
    - Use Twilio WhatsApp-enabled sender (`whatsapp:+...`)
    - _Requirements: 2.5_

  - [x] 2.3 Implement FCM push provider
    - Create `providers/fcm.provider.ts` implementing `ChannelProvider`
    - Use Firebase Admin SDK to send push notifications
    - Support data-only and notification messages
    - Handle `messaging/registration-token-not-registered` to mark tokens as stale
    - _Requirements: 2.3_

  - [x] 2.4 Implement Resend email provider
    - Create `providers/resend-email.provider.ts` implementing `ChannelProvider`
    - Send HTML email with subject line from template
    - Support tenant branding tokens in email templates
    - _Requirements: 2.4, 3.4_

  - [x] 2.5 Implement Africa's Talking SMS provider
    - Create `providers/africas-talking.provider.ts` implementing `ChannelProvider`
    - Use Africa's Talking SMS API for African markets
    - _Requirements: 2.2_

  - [x] 2.6 Create provider registry and resolver
    - Create `providers/provider-registry.ts` that maps (channel, providerName) → ChannelProvider instance
    - Resolve provider based on tenant configuration (from control plane DB)
    - Fall back to platform-level defaults if tenant has no config
    - _Requirements: 2.6, 2.7_

- [x] 3. Template system
  - [x] 3.1 Implement template service
    - Create `templates/template.service.ts` with `render(templateKey, channel, variables, tenantOverrides?): string`
    - Implement `{{variableName}}` interpolation with HTML escaping for email
    - Resolve correct channel variant (push title/body vs SMS text vs email HTML)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Define initial templates
    - Create `templates/definitions/otp.template.ts`: SMS text with OTP code
    - Create `templates/definitions/payment.template.ts`: push for payment success
    - Create `templates/definitions/payout.template.ts`: push for payout completed
    - Export template registry from `templates/definitions/index.ts`
    - _Requirements: 3.1, 7.3_

  - [x] 3.3 Add tenant branding to email templates
    - Accept tenant theme tokens (logo URL, primary color) as template variables
    - Wrap email content in a branded HTML layout with header logo and footer
    - _Requirements: 3.4, 3.5_

- [x] 4. Core notification service
  - [x] 4.1 Implement NotificationService.send()
    - Create `notifications.service.ts` with `send(payload: NotificationPayload): Promise<void>`
    - Validate required fields (tenantId, userId, channel, templateKey)
    - Check deduplication via Redis SETNX (idempotencyKey, 1-hour TTL)
    - Check rate limits via Redis sliding window (INCR + EXPIRE)
    - Check quiet hours from tenant config (skip for critical priority)
    - Enqueue to BullMQ `'notifications'` queue with retry options
    - _Requirements: 1.1, 1.3, 1.6, 5.1, 5.2, 5.3, 5.4, 9.1_

  - [x] 4.2 Implement NotificationProcessor
    - Create `notifications.processor.ts` extending `WorkerHost` with `@Processor('notifications')`
    - Set concurrency to 10
    - Resolve channel provider for tenant
    - Render template with variables
    - For push: resolve user's device tokens and send to each
    - Call `provider.send()` and log delivery status
    - On failure: check for fallback channel, re-enqueue if available
    - _Requirements: 1.4, 1.5, 2.7, 6.1, 6.2_

  - [x] 4.3 Implement delivery logging
    - Insert delivery attempt into `notification_logs` table after each send attempt
    - Record status (sent/delivered/failed), provider message ID, and error message
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 5. Device management
  - [x] 5.1 Implement device service
    - Create `device/device.service.ts` for managing FCM tokens
    - `registerDevice(tenantId, userId, deviceId, platform, fcmToken)`: upsert device token
    - `unregisterDevice(tenantId, userId, deviceId)`: mark device as inactive
    - `getActiveDevices(tenantId, userId)`: return all active FCM tokens for user
    - `deactivateToken(tenantId, fcmToken)`: mark stale token as inactive (called by FCM provider)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 5.2 Implement device controller
    - Create `device/device.controller.ts` with endpoints:
    - POST `/notifications/devices` — register device token
    - DELETE `/notifications/devices/:deviceId` — unregister device
    - Apply authentication guard (user must be logged in)
    - _Requirements: 4.3_

  - [x] 5.3 Implement notification preferences endpoints
    - Add to device controller or new preferences controller:
    - GET `/notifications/preferences` — get user's opt-in/out settings
    - PATCH `/notifications/preferences` — update category/channel preferences
    - _Requirements: 4.5_

- [x] 6. Event-driven integration
  - [x] 6.1 Implement NotificationListener
    - Create `notifications.listener.ts` using `@OnEvent()` decorators
    - Map `otp.requested` → send SMS to user's phone (critical priority)
    - Map `payment.succeeded` → send push to customer
    - Map `payout.completed` → send push to provider
    - _Requirements: 7.1, 7.3_

  - [x] 6.2 Replace OTP stub in AuthService
    - Update `apps/api/src/modules/identity/auth.service.ts` to inject and call `NotificationService`
    - Replace `console.log` OTP stub with `NotificationService.send()` using `otp.requested` template
    - Keep the dev-mode console.log as a fallback when notification service is not configured
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.3 Emit events from existing services
    - Add `EventEmitter2.emit('otp.requested', ...)` in OtpService after OTP generation
    - Verify `payment.succeeded` and `payout.completed` events are already emitted by webhook processor (or add them)
    - _Requirements: 7.1, 7.3_

- [x] 7. Wire into application
  - [x] 7.1 Register NotificationsModule in AppModule
    - Import `NotificationsModule` into `app.module.ts`
    - Ensure module dependency order is correct (DatabaseModule, IdentityModule available)
    - Export `NotificationService` for consumption by other modules
    - _Requirements: 7.4, 9.1_

  - [x] 7.2 Update environment configuration
    - Add notification provider env vars to `.env.example`
    - Add provider env vars to Docker Compose environment section
    - _Requirements: 9.3_

- [x] 8. Testing
  - [x] 8.1 Write unit tests for NotificationService
    - Test deduplication: same idempotency key does not double-enqueue
    - Test rate limiting: 6th SMS in same hour is rejected
    - Test quiet hours: notification outside hours is dropped (non-critical)
    - Test critical bypass: OTP sends regardless of quiet hours/rate limits
    - _Requirements: 1.6, 5.1, 5.3, 5.4_

  - [x] 8.2 Write unit tests for providers
    - Test Twilio SMS provider request formatting and error handling
    - Test FCM provider with token invalidation handling
    - Test Resend email provider with HTML template
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 8.3 Write unit tests for template service
    - Test variable interpolation with all variable types
    - Test HTML escaping for email channel
    - Test missing variable graceful handling
    - _Requirements: 3.2, 3.3_

  - [x] 8.4 Write property tests for notification dispatch
    - **Property 1: Rate Limit Enforcement** — For any number of sends exceeding the limit, exactly `limit` deliveries occur and the rest are dropped
    - **Property 2: Deduplication Idempotency** — Same idempotency key never produces more than one delivery regardless of call count
    - **Property 3: Template Interpolation Safety** — For any user-provided variable content, email output never contains unescaped HTML
    - _Requirements: 1.6, 5.1, 5.2, 3.2_

- [x] 9. Checkpoint — Notifications service complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Channel providers use the same factory pattern as PSP adapters: `static create(credentials)` for multi-tenant credential injection
- BullMQ handles retry/backoff automatically via job options
- Rate limiting is pre-queue (checked in NotificationService) to avoid wasting worker capacity
- The listener pattern means adding new notification triggers for future modules is just adding new `@OnEvent()` handlers
- Platform-level provider credentials serve as defaults; tenants can override via control plane config

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["2.6", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["7.1", "7.2"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3", "8.4"] }
  ]
}
```
