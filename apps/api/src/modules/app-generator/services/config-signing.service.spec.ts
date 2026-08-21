import { ConfigSigningService } from './config-signing.service';
import { ConfigService } from '@nestjs/config';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';

describe('ConfigSigningService', () => {
  let service: ConfigSigningService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            const result: any = Promise.resolve([]);
            result.limit = jest.fn().mockResolvedValue([
              { id: 'tenant-1', slug: 'demo', enabledModules: ['rides', 'food'], tier: 'scale' },
            ]);
            return result;
          }),
        })),
      })),
    };

    const mockConfig = { get: jest.fn().mockReturnValue(undefined) } as any;
    const mockControlPlane = { db: mockDb } as any as ControlPlaneDbService;

    service = new ConfigSigningService(mockConfig as ConfigService, mockControlPlane);
  });

  describe('getPublicKey()', () => {
    it('should return a PEM-formatted public key', () => {
      const key = service.getPublicKey();
      expect(key).toContain('-----BEGIN RSA PUBLIC KEY-----');
      expect(key).toContain('-----END RSA PUBLIC KEY-----');
    });
  });

  describe('generateSignedConfig()', () => {
    it('should return a JWS with 3 dot-separated parts', async () => {
      const jws = await service.generateSignedConfig('tenant-1', 'customer', 'demo');
      const parts = jws.split('.');
      expect(parts).toHaveLength(3);
      expect(parts[0].length).toBeGreaterThan(0); // header
      expect(parts[1].length).toBeGreaterThan(0); // payload
      expect(parts[2].length).toBeGreaterThan(0); // signature
    });

    it('should produce a verifiable signature', async () => {
      const jws = await service.generateSignedConfig('tenant-1', 'customer', 'demo');
      const config = service.verifyJws(jws);
      expect(config).not.toBeNull();
      expect(config!.tenantId).toBe('tenant-1');
      expect(config!.surface).toBe('customer');
      expect(config!.environment).toBe('demo');
    });

    it('should reject tampered payload', async () => {
      const jws = await service.generateSignedConfig('tenant-1', 'customer', 'demo');
      const parts = jws.split('.');
      // Tamper with payload
      const tampered = `${parts[0]}.${Buffer.from('{"tampered":true}').toString('base64url')}.${parts[2]}`;
      const result = service.verifyJws(tampered);
      expect(result).toBeNull();
    });

    it('should include endpoints in the config', async () => {
      const jws = await service.generateSignedConfig('tenant-1', 'customer', 'production');
      const config = service.verifyJws(jws);
      expect(config!.endpoints).toBeDefined();
      expect(config!.endpoints.apiBaseUrl).toContain('platform.app');
    });

    it('should include issuedAt and expiresAt timestamps', async () => {
      const jws = await service.generateSignedConfig('tenant-1', 'customer', 'demo');
      const config = service.verifyJws(jws);
      expect(config!.issuedAt).toBeGreaterThan(0);
      expect(config!.expiresAt).toBeGreaterThan(config!.issuedAt);
      // TTL should be ~15 minutes
      expect(config!.expiresAt - config!.issuedAt).toBe(15 * 60 * 1000);
    });
  });

  describe('verifyJws()', () => {
    it('should return null for invalid JWS format', () => {
      expect(service.verifyJws('not.a.valid.jws')).toBeNull();
      expect(service.verifyJws('')).toBeNull();
      expect(service.verifyJws('abc')).toBeNull();
    });
  });

  describe('scope enforcement', () => {
    it('should derive job types for provider surface', async () => {
      // Mock tenant with rides + food modules
      mockDb.select.mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            const result: any = Promise.resolve([]);
            result.limit = jest.fn().mockResolvedValue([
              { id: 'tenant-1', slug: 'demo', enabledModules: ['rides', 'food', 'courier'], tier: 'scale' },
            ]);
            return result;
          }),
        })),
      }));

      const jws = await service.generateSignedConfig('tenant-1', 'provider', 'demo');
      const config = service.verifyJws(jws);
      expect(config!.modules).toContain('trips');      // from rides
      expect(config!.modules).toContain('deliveries'); // from food
      expect(config!.modules).toContain('parcels');    // from courier
    });
  });
});
