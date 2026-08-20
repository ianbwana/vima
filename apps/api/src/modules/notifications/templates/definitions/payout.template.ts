import { NotificationTemplate } from './index';

/**
 * Payout completed notification template.
 * Sent when a provider/merchant payout is processed to their bank.
 *
 * Variables: {{amount}}, {{currency}}, {{destination}}
 */
export const payoutTemplate: NotificationTemplate = {
  key: 'payout.completed',
  description: 'Payout sent to bank account',
  category: 'transactions',
  defaultTitle: 'Payout sent',
  channels: {
    push: {
      title: 'Payout sent',
      body: '{{currency}} {{amount}} has been sent to your account.',
    },
    sms: {
      body: 'Payout sent: {{currency}} {{amount}} to {{destination}}.',
    },
    email: {
      title: 'Payout sent to your account',
      body: 'Your payout of {{currency}} {{amount}} has been sent to {{destination}}.',
      htmlBody: `<h1 style="font-size: 24px; margin: 0 0 16px 0; color: #18181b;">Payout sent</h1>
<p style="font-size: 16px; color: #3f3f46; margin: 0 0 24px 0;">Your earnings have been transferred to your bank account.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; background-color: #ecfdf5; border-radius: 8px; margin: 0 0 24px 0;">
  <tr>
    <td style="padding: 20px;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #065f46;">Amount sent</p>
      <p style="margin: 0; font-size: 24px; font-weight: bold; color: #065f46;">{{currency}} {{amount}}</p>
    </td>
  </tr>
</table>
<p style="font-size: 14px; color: #71717a; margin: 0;">Destination: {{destination}}</p>
<p style="font-size: 14px; color: #71717a; margin: 8px 0 0 0;">Funds typically arrive within 1-3 business days depending on your bank.</p>`,
    },
  },
};
