import { NotificationTemplate } from './index';

/**
 * OTP notification template.
 * Sent when a user requests phone-based authentication.
 *
 * Variables: {{otp}}, {{appName}}
 */
export const otpTemplate: NotificationTemplate = {
  key: 'otp.requested',
  description: 'One-time password for phone authentication',
  category: 'security',
  defaultTitle: 'Your verification code',
  channels: {
    sms: {
      body: '{{otp}} is your {{appName}} verification code. It expires in 5 minutes. Do not share this code.',
    },
    whatsapp: {
      body: '{{otp}} is your {{appName}} verification code. It expires in 5 minutes. Do not share this code.',
    },
    email: {
      title: 'Your verification code',
      body: 'Your verification code is {{otp}}. It expires in 5 minutes.',
      htmlBody: `<h1 style="font-size: 24px; margin: 0 0 16px 0; color: #18181b;">Your verification code</h1>
<p style="font-size: 16px; color: #3f3f46; margin: 0 0 24px 0;">Use the code below to verify your identity:</p>
<div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #18181b;">{{otp}}</span>
</div>
<p style="font-size: 14px; color: #71717a; margin: 0;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>`,
    },
  },
};
