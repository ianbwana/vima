-- Migration: Add notification tables for push, SMS, WhatsApp, and email delivery
-- Adds device token storage, user preferences, and delivery logging.

-- Enums
CREATE TYPE notification_channel AS ENUM ('push', 'sms', 'whatsapp', 'email');
CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'rate_limited');
CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web');

-- User device tokens for push notifications (FCM)
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  device_id VARCHAR(255) NOT NULL,
  platform device_platform NOT NULL,
  fcm_token TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE UNIQUE INDEX idx_user_devices_device_id ON user_devices(user_id, device_id);

-- User notification preferences (opt-in/out per category per channel)
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  category VARCHAR(100) NOT NULL,
  channel notification_channel NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE UNIQUE INDEX idx_notification_preferences_unique ON notification_preferences(user_id, category, channel);

-- Notification delivery log
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  channel notification_channel NOT NULL,
  template_key VARCHAR(100) NOT NULL,
  status notification_status NOT NULL,
  provider_message_id VARCHAR(255),
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
