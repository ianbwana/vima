import { ResendEmailProvider } from './resend-email.provider';

describe('ResendEmailProvider', () => {
  let provider: ResendEmailProvider;
  const credentials = {
    apiKey: 're_test_api_key',
    fromEmail: 'Vima <noreply@vima.app>',
  };

  beforeEach(() => {
    provider = ResendEmailProvider.create(credentials);
    jest.restoreAllMocks();
  });

  it('should have correct channel and provider name', () => {
    expect(provider.channel).toBe('email');
    expect(provider.providerName).toBe('resend');
  });

  it('should send email with HTML body', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'email_abc123' }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await provider.send({
      recipient: 'user@example.com',
      title: 'Payment confirmed',
      body: 'Your payment of $10.00 was successful.',
      htmlBody: '<h1>Payment confirmed</h1><p>Your payment of $10.00 was successful.</p>',
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('email_abc123');

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.resend.com/emails');

    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.from).toBe('Vima <noreply@vima.app>');
    expect(payload.to).toEqual(['user@example.com']);
    expect(payload.subject).toBe('Payment confirmed');
    expect(payload.text).toBe('Your payment of $10.00 was successful.');
    expect(payload.html).toContain('<h1>Payment confirmed</h1>');
  });

  it('should send plain text email without HTML', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'email_xyz' }),
    } as any);

    await provider.send({
      recipient: 'user@example.com',
      title: 'OTP Code',
      body: 'Your code is 123456',
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.html).toBeUndefined();
    expect(payload.text).toBe('Your code is 123456');
  });

  it('should use "Notification" as default subject when no title', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'email_123' }),
    } as any);

    await provider.send({
      recipient: 'user@example.com',
      body: 'A message without title',
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(fetchCall[1].body);
    expect(payload.subject).toBe('Notification');
  });

  it('should handle API errors', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: jest.fn().mockResolvedValue({
        name: 'validation_error',
        message: 'Invalid email address',
      }),
    } as any);

    const result = await provider.send({
      recipient: 'invalid-email',
      body: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Invalid email address');
    expect(result.errorCode).toBe('validation_error');
  });

  it('should include Authorization Bearer header', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'e1' }),
    } as any);

    await provider.send({ recipient: 'a@b.com', body: 'hi' });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers.Authorization).toBe('Bearer re_test_api_key');
  });
});
