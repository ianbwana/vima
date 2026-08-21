import { NotificationTemplate } from './index';

/**
 * Payment success notification template.
 * Sent when a customer's payment (top-up, order payment) completes.
 *
 * Variables: {{amount}}, {{currency}}, {{description}}
 */
export const paymentTemplate: NotificationTemplate = {
  key: 'payment.succeeded',
  description: 'Payment completed successfully',
  category: 'transactions',
  defaultTitle: 'Payment confirmed',
  channels: {
    push: {
      title: 'Payment confirmed',
      body: 'Your payment of {{currency}} {{amount}} was successful.',
    },
    sms: {
      body: 'Payment confirmed: {{currency}} {{amount}}. {{description}}',
    },
    email: {
      title: 'Payment confirmed',
      body: 'Your payment of {{currency}} {{amount}} was successful. {{description}}',
      htmlBody: `<h1 style="font-size: 24px; margin: 0 0 16px 0; color: #18181b;">Payment confirmed</h1>
<p style="font-size: 16px; color: #3f3f46; margin: 0 0 24px 0;">Your payment has been processed successfully.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; background-color: #f4f4f5; border-radius: 8px; margin: 0 0 24px 0;">
  <tr>
    <td style="padding: 20px;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Amount</p>
      <p style="margin: 0; font-size: 24px; font-weight: bold; color: #18181b;">{{currency}} {{amount}}</p>
    </td>
  </tr>
</table>
<p style="font-size: 14px; color: #71717a; margin: 0;">{{description}}</p>`,
    },
  },
};
