import { TwilioSmsProvider } from './twilio-sms.provider';

describe('TwilioSmsProvider', () => {
  let provider: TwilioSmsProvider;
  const credentials = {
    accountSid: 'AC_test_sid',
    authToken: 'test_auth_token',
    fromNumber: '+15551234567',
  };

  beforeEach(() => {
    provider = TwilioSmsProvider.create(credentials);
    jest.restoreAllMocks();
  });

  it('should have correct channel and provider name', () => {
    expect(provider.channel).toBe('sms');
    expect(provider.providerName).toBe('twilio');
  });

  it('should send SMS successfully', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ sid: 'SM_test_message_sid' }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await provider.send({
      recipient: '+254700000000',
      body: 'Your OTP is 123456',
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('SM_test_message_sid');

    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: expect.stringContaining('Basic'),
        }),
      }),
    );

    // Verify body params
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = new URLSearchParams(fetchCall[1].body);
    expect(body.get('To')).toBe('+254700000000');
    expect(body.get('From')).toBe('+15551234567');
    expect(body.get('Body')).toBe('Your OTP is 123456');
  });

  it('should handle Twilio API errors gracefully', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({
        code: 21211,
        message: 'Invalid phone number',
      }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await provider.send({
      recipient: 'invalid-phone',
      body: 'Test message',
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Invalid phone number');
    expect(result.errorCode).toBe('21211');
  });

  it('should handle network errors', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network timeout'));

    const result = await provider.send({
      recipient: '+254700000000',
      body: 'Test message',
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Network timeout');
    expect(result.errorCode).toBe('NETWORK_ERROR');
  });

  it('should use correct Basic auth header', () => {
    const expectedAuth = Buffer.from(
      `${credentials.accountSid}:${credentials.authToken}`,
    ).toString('base64');

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ sid: 'SM_test' }),
    } as any);

    provider.send({ recipient: '+1', body: 'test' });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers.Authorization).toBe(`Basic ${expectedAuth}`);
  });
});
