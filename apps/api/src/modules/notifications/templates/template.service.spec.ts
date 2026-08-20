import { TemplateService } from './template.service';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(() => {
    service = new TemplateService();
  });

  describe('render()', () => {
    it('should render OTP template for SMS channel', () => {
      const result = service.render('otp.requested', 'sms', {
        otp: '123456',
        appName: 'TestApp',
      });

      expect(result).not.toBeNull();
      expect(result!.body).toContain('123456');
      expect(result!.body).toContain('TestApp');
      expect(result!.body).toContain('verification code');
    });

    it('should render OTP template for WhatsApp channel', () => {
      const result = service.render('otp.requested', 'whatsapp', {
        otp: '654321',
        appName: 'Vima',
      });

      expect(result).not.toBeNull();
      expect(result!.body).toContain('654321');
      expect(result!.body).toContain('Vima');
    });

    it('should render payment template for push channel', () => {
      const result = service.render('payment.succeeded', 'push', {
        amount: '50.00',
        currency: 'USD',
        description: 'Wallet top-up',
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Payment confirmed');
      expect(result!.body).toContain('USD');
      expect(result!.body).toContain('50.00');
    });

    it('should render payout template for email with HTML', () => {
      const result = service.render('payout.completed', 'email', {
        amount: '200.00',
        currency: 'KES',
        destination: 'Equity Bank ****1234',
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Payout sent to your account');
      expect(result!.body).toContain('KES');
      expect(result!.body).toContain('200.00');
      expect(result!.htmlBody).toContain('KES');
      expect(result!.htmlBody).toContain('200.00');
      expect(result!.htmlBody).toContain('Equity Bank ****1234');
    });

    it('should return null for unknown template key', () => {
      const result = service.render('unknown.template', 'sms', {});
      expect(result).toBeNull();
    });

    it('should return null for unsupported channel', () => {
      // OTP template does not have a 'push' channel variant
      const result = service.render('otp.requested', 'push', { otp: '123456' });
      expect(result).toBeNull();
    });

    it('should handle missing template variables gracefully', () => {
      // Render OTP without providing the otp variable
      const result = service.render('otp.requested', 'sms', { appName: 'Vima' });

      expect(result).not.toBeNull();
      // Missing variable should result in empty string (not literal {{otp}})
      expect(result!.body).not.toContain('{{otp}}');
      expect(result!.body).toContain('Vima');
    });

    it('should HTML-escape variables in email htmlBody', () => {
      const result = service.render('payout.completed', 'email', {
        amount: '100.00',
        currency: 'USD',
        destination: '<script>alert("xss")</script>',
      });

      expect(result).not.toBeNull();
      // HTML body should have escaped the malicious content
      expect(result!.htmlBody).not.toContain('<script>');
      expect(result!.htmlBody).toContain('&lt;script&gt;');
    });

    it('should NOT HTML-escape variables in plain text body', () => {
      const result = service.render('payout.completed', 'sms', {
        amount: '10.00',
        currency: 'USD',
        destination: 'Bank & Trust',
      });

      expect(result).not.toBeNull();
      // Plain text should not be escaped
      expect(result!.body).toContain('Bank & Trust');
      expect(result!.body).not.toContain('&amp;');
    });
  });

  describe('render() with branding', () => {
    it('should wrap email in branded layout', () => {
      const branding = {
        logoUrl: 'https://cdn.example.com/logo.png',
        primaryColor: '#FF6B3D',
        appName: 'RideApp',
      };

      const result = service.render(
        'payment.succeeded',
        'email',
        { amount: '25.00', currency: 'KES', description: 'Trip payment' },
        branding,
      );

      expect(result).not.toBeNull();
      expect(result!.htmlBody).toContain('https://cdn.example.com/logo.png');
      expect(result!.htmlBody).toContain('RideApp');
      expect(result!.htmlBody).toContain('<!DOCTYPE html>');
    });

    it('should use app name as text fallback when no logo URL', () => {
      const branding = {
        primaryColor: '#4ADE80',
        appName: 'GoDeliver',
      };

      const result = service.render(
        'payout.completed',
        'email',
        { amount: '50.00', currency: 'NGN', destination: 'GTBank' },
        branding,
      );

      expect(result).not.toBeNull();
      expect(result!.htmlBody).toContain('GoDeliver');
      expect(result!.htmlBody).toContain('#4ADE80');
    });
  });

  describe('hasTemplate()', () => {
    it('should return true for registered templates', () => {
      expect(service.hasTemplate('otp.requested')).toBe(true);
      expect(service.hasTemplate('payment.succeeded')).toBe(true);
      expect(service.hasTemplate('payout.completed')).toBe(true);
    });

    it('should return false for unknown templates', () => {
      expect(service.hasTemplate('unknown.event')).toBe(false);
    });
  });

  describe('getTemplateChannels()', () => {
    it('should return available channels for OTP template', () => {
      const channels = service.getTemplateChannels('otp.requested');
      expect(channels).toContain('sms');
      expect(channels).toContain('whatsapp');
      expect(channels).toContain('email');
    });

    it('should return empty array for unknown template', () => {
      expect(service.getTemplateChannels('nope')).toEqual([]);
    });
  });
});
