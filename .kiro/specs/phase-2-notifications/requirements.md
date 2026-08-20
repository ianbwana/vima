# Requirements: Notifications Service

## Overview

Cross-cutting notification infrastructure that delivers messages across push (FCM), SMS, WhatsApp, and email channels. Consumed by all vertical modules (rides, food, courier, etc.) through a unified event-driven interface. Replaces the placeholder SMS stub in the existing identity/auth module.

## Functional Requirements

### 1. Notification Dispatch Core

- 1.1 The system SHALL provide a `NotificationService.send()` method accepting: tenantId, userId, channel, templateKey, and templateData.
- 1.2 The system SHALL support four channels: `push`, `sms`, `whatsapp`, `email`.
- 1.3 The system SHALL queue all notification dispatch via BullMQ for async, non-blocking delivery.
- 1.4 The system SHALL retry failed deliveries up to 3 times with exponential backoff.
- 1.5 After retry exhaustion, the system SHALL log a structured failure record for ops alerting.
- 1.6 The system SHALL deduplicate notifications with the same idempotency key within a 1-hour window.

### 2. Channel Providers (Pluggable)

- 2.1 The system SHALL define a `ChannelProvider` interface with a `send(recipient, message)` method and `channel` identifier.
- 2.2 SMS SHALL be delivered via Twilio (primary) with Africa's Talking as an alternative.
- 2.3 Push notifications SHALL be delivered via Firebase Cloud Messaging (FCM) for both mobile and web.
- 2.4 Email SHALL be delivered via Resend (primary) with SES as an alternative.
- 2.5 WhatsApp SHALL be delivered via Twilio WhatsApp API (or Meta Cloud API).
- 2.6 Each tenant SHALL be able to configure which provider to use per channel per region.
- 2.7 The system SHALL support a fallback chain: if primary channel delivery fails, attempt the configured fallback channel.

### 3. Template System

- 3.1 The system SHALL maintain notification templates keyed by event type (e.g., `otp.requested`, `ride.driver_assigned`).
- 3.2 Templates SHALL support variable interpolation using `{{variableName}}` syntax.
- 3.3 Templates SHALL support per-channel content variants (push body vs email HTML vs SMS text).
- 3.4 Templates SHALL include tenant branding (logo, colors) for email channel.
- 3.5 The system SHALL support tenant-level template overrides (custom copy per tenant).

### 4. Device & Preference Management

- 4.1 The system SHALL store user device tokens (FCM registration tokens) per user per device.
- 4.2 The system SHALL support multiple devices per user for push notifications.
- 4.3 The system SHALL allow users to register/unregister device tokens via API.
- 4.4 The system SHALL remove stale tokens when FCM reports them as invalid.
- 4.5 Users SHALL be able to opt out of non-critical notification categories.

### 5. Rate Limiting & Quiet Hours

- 5.1 The system SHALL enforce per-user, per-channel rate limits (configurable per tenant).
- 5.2 Default rate limits: max 5 SMS per user per hour, max 20 push per user per hour.
- 5.3 The system SHALL respect quiet hours configuration per tenant (e.g., no push 22:00–07:00 local time).
- 5.4 Critical notifications (OTP, security alerts) SHALL bypass quiet hours and rate limits.
- 5.5 Rate-limited notifications SHALL be silently dropped (not queued for later).

### 6. Delivery Tracking

- 6.1 The system SHALL log all notification delivery attempts with status: `queued`, `sent`, `delivered`, `failed`.
- 6.2 The system SHALL record provider-level delivery metadata (message SID, FCM message ID).
- 6.3 Email delivery status SHALL track: `sent`, `delivered`, `opened`, `bounced`.
- 6.4 Delivery logs SHALL be queryable per user (for support/debugging).
- 6.5 Delivery logs SHALL be retained for 30 days then archived.

### 7. Event-Driven Integration

- 7.1 The system SHALL listen for domain events via `@nestjs/event-emitter` and map them to notification dispatches.
- 7.2 The event-to-notification mapping SHALL be configurable per tenant (enable/disable specific notification types).
- 7.3 Initial event mappings SHALL include: `otp.requested` → SMS/WhatsApp, `payment.succeeded` → push, `payout.completed` → push.
- 7.4 The system SHALL export a `NotificationService` that other modules can call directly for imperative sends.

### 8. OTP Integration

- 8.1 The system SHALL replace the current console.log OTP stub in AuthService with actual SMS delivery.
- 8.2 OTP messages SHALL use the `sms` channel with `whatsapp` as tenant-configurable fallback.
- 8.3 OTP delivery SHALL bypass rate limits and quiet hours (critical notification).

## Non-Functional Requirements

- 9.1 Notification dispatch SHALL NOT block the calling service (fully async via queue).
- 9.2 The module SHALL be tenant-isolated: one tenant's configuration never affects another.
- 9.3 Provider API keys/credentials SHALL be stored encrypted (same envelope encryption as PSP credentials).
- 9.4 The module SHALL gracefully degrade: if a channel provider is down, attempt fallback without throwing.

## Out of Scope (Phase 2)

- In-app notification center / inbox UI
- Notification scheduling (send-at future time)
- A/B testing of notification copy
- Cross-tenant analytics on notification delivery rates
