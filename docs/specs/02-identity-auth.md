# Feature Spec: Identity & Authentication

**Module:** `identity`
**Phase:** 0 (Foundations)
**Priority:** Critical — required for all user interactions

---

## Overview

The identity module manages authentication and authorization across all platform surfaces. It supports per-tenant user pools stored in tenant databases, with multiple authentication methods depending on the persona.

---

## Functional Requirements

### Authentication Methods

| Persona | Method | Surface |
|---|---|---|
| Platform admin | Email + password + 2FA (TOTP) | Platform Admin portal |
| Tenant owner/admin | Email + password + 2FA | Tenant Portal |
| Tenant ops/finance/support | Email + password | Tenant Portal |
| Customer | Phone OTP (SMS/WhatsApp) | Customer PWA / mobile |
| Provider (driver, rider, tech) | Phone OTP (SMS/WhatsApp) | Provider app |
| Merchant | Email + password | Merchant Portal |

### Token Strategy

- [ ] JWT access tokens (short-lived: 15 minutes)
- [ ] Rotating refresh tokens (7 days, single-use)
- [ ] Refresh token stored hashed in DB
- [ ] Token includes: sub (user_id), tenantId, role, iat, exp
- [ ] Blacklist on logout (Redis set with TTL)

### OTP Flow (Customers & Providers)

- [ ] User submits phone number
- [ ] Server generates 6-digit OTP, stores hash with 5-minute TTL
- [ ] SMS sent via configurable provider (Twilio, Africa's Talking)
- [ ] User submits OTP → verified → tokens issued
- [ ] Rate limiting: max 3 OTP requests per phone per 10 minutes
- [ ] WhatsApp delivery as tenant-configurable alternative

### Password Flow (Portals)

- [ ] Registration with email verification
- [ ] Password hashed with bcrypt (cost 12)
- [ ] Login returns access + refresh tokens
- [ ] Password reset via email link (time-limited token)
- [ ] 2FA enrollment for owner/admin roles (TOTP with backup codes)

### Session Management

- [ ] Per-device sessions tracked
- [ ] Concurrent session limit configurable per tenant
- [ ] Force logout all sessions (admin action)
- [ ] Session activity timestamp for idle timeout

### User Storage

- [ ] Platform admins stored in control plane DB
- [ ] All tenant users stored in tenant DB: `users` table
- [ ] Control plane maintains a directory (`tenant_users`) for cross-tenant lookups
- [ ] Provider can be registered across modules (driver + courier) within same tenant

---

## Data Model

### Control Plane
```sql
platform_admins (id, email, password_hash, totp_secret, status, created_at)
tenant_users (id, tenant_id, email, phone, role, created_at) -- directory only
```

### Tenant DB
```sql
users (id, phone, email, name, avatar_url, status, created_at, updated_at)
user_auth (id, user_id, type [otp|password], credential_hash, verified_at)
user_sessions (id, user_id, device_id, refresh_token_hash, expires_at, last_active_at)
user_roles (id, user_id, role, granted_by, created_at)
otp_attempts (id, phone, otp_hash, expires_at, verified, created_at)
```

---

## Security Requirements

- [ ] OTP brute force protection (lock after 5 failed attempts for 30 minutes)
- [ ] JWT signature with RS256 (asymmetric) for cross-service verification
- [ ] Refresh token rotation: old token invalidated on use
- [ ] CORS configured per tenant domain
- [ ] Helmet headers on all responses
- [ ] No PII in JWT payload beyond user_id

---

## API Endpoints

```
POST /auth/otp/request        { phone, tenantId }
POST /auth/otp/verify         { phone, otp, tenantId }
POST /auth/login              { email, password, tenantId }
POST /auth/register           { email, password, name, tenantId }
POST /auth/refresh            { refreshToken }
POST /auth/logout             { refreshToken }
POST /auth/password/reset     { email, tenantId }
POST /auth/password/confirm   { token, newPassword }
GET  /auth/me                 → current user profile
```

---

## Exit Criteria

- OTP login working for customer persona on tenant subdomain
- Password login working for tenant admin
- JWT issued with correct tenant context
- Refresh token rotation functional
- Unauthorized requests properly rejected
