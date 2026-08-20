import { FcmProvider } from './fcm.provider';

describe('FcmProvider', () => {
  let provider: FcmProvider;

  // We need a valid RSA key for JWT signing in tests
  const crypto = require('crypto');
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });

  const serviceAccountJson = JSON.stringify({
    client_email: 'test@project.iam.gserviceaccount.com',
    private_key: privateKey,
    token_uri: 'https://oauth2.googleapis.com/token',
  });
  const serviceAccountKey = Buffer.from(serviceAccountJson).toString('base64');

  const credentials = {
    projectId: 'test-project',
    serviceAccountKey,
  };

  beforeEach(() => {
    provider = FcmProvider.create(credentials);
    jest.restoreAllMocks();
  });

  it('should have correct channel and provider name', () => {
    expect(provider.channel).toBe('push');
    expect(provider.providerName).toBe('fcm');
  });

  it('should send push notification successfully', async () => {
    // Mock token exchange
    const tokenResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'ya29.test_token',
        expires_in: 3600,
      }),
    };

    // Mock FCM send
    const fcmResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        name: 'projects/test-project/messages/msg-123',
      }),
    };

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tokenResponse as any)
      .mockResolvedValueOnce(fcmResponse as any);

    const result = await provider.send({
      recipient: 'fcm-device-token-abc',
      title: 'Payment confirmed',
      body: 'Your payment of $10 was successful.',
      data: { type: 'payment', id: 'pay-123' },
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('projects/test-project/messages/msg-123');

    // Verify FCM API call
    const fcmCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(fcmCall[0]).toBe(
      'https://fcm.googleapis.com/v1/projects/test-project/messages:send',
    );
    const fcmPayload = JSON.parse(fcmCall[1].body);
    expect(fcmPayload.message.token).toBe('fcm-device-token-abc');
    expect(fcmPayload.message.notification.title).toBe('Payment confirmed');
    expect(fcmPayload.message.notification.body).toBe('Your payment of $10 was successful.');
    expect(fcmPayload.message.data).toEqual({ type: 'payment', id: 'pay-123' });
  });

  it('should report invalid tokens for cleanup', async () => {
    const tokenResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'ya29.test_token',
        expires_in: 3600,
      }),
    };

    const fcmResponse = {
      ok: false,
      status: 404,
      json: jest.fn().mockResolvedValue({
        error: {
          status: 'NOT_FOUND',
          message: 'Requested entity was not found.',
          details: [{ errorCode: 'UNREGISTERED' }],
        },
      }),
    };

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(tokenResponse as any)
      .mockResolvedValueOnce(fcmResponse as any);

    const onTokenInvalid = jest.fn();
    provider.onTokenInvalid = onTokenInvalid;

    const result = await provider.send({
      recipient: 'stale-fcm-token',
      title: 'Test',
      body: 'Test body',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UNREGISTERED');
    expect(onTokenInvalid).toHaveBeenCalledWith('stale-fcm-token');
  });

  it('should handle network errors', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const result = await provider.send({
      recipient: 'token-123',
      title: 'Test',
      body: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NETWORK_ERROR');
  });

  it('should cache access token and reuse it', async () => {
    const tokenResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'ya29.cached_token',
        expires_in: 3600,
      }),
    };
    const fcmResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ name: 'projects/test/messages/1' }),
    };

    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(tokenResponse as any)
      .mockResolvedValueOnce(fcmResponse as any)
      .mockResolvedValueOnce(fcmResponse as any); // Second send reuses token

    // First send — fetches new token
    await provider.send({ recipient: 'token-1', body: 'msg1' });

    // Second send — should reuse cached token (no new token fetch)
    await provider.send({ recipient: 'token-2', body: 'msg2' });

    // Should have: 1 token fetch + 2 FCM sends = 3 total calls
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
