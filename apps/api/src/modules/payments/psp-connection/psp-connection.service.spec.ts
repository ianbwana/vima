import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PspConnectionService } from './psp-connection.service';
import { ControlPlaneDbService } from '@/database/control-plane-db.service';
import { PspProvider } from './dto/connect-psp.dto';
import { encrypt, decrypt } from './crypto.util';

// Valid 32-byte key for testing
const TEST_ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2';

describe('PspConnectionService', () => {
  let service: PspConnectionService;
  let mockDb: any;
  let mockSelect: jest.Mock;
  let mockInsert: jest.Mock;
  let mockUpdate: jest.Mock;

  beforeEach(async () => {
    // Build a chainable mock for Drizzle query builder
    const createChainable = (resolvedValue: any) => {
      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.from = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockReturnValue(chain);
      chain.limit = jest.fn().mockResolvedValue(resolvedValue);
      chain.set = jest.fn().mockReturnValue(chain);
      chain.values = jest.fn().mockReturnValue(chain);
      chain.returning = jest.fn().mockResolvedValue(resolvedValue);
      return chain;
    };

    mockSelect = jest.fn();
    mockInsert = jest.fn();
    mockUpdate = jest.fn();

    mockDb = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PspConnectionService,
        {
          provide: ControlPlaneDbService,
          useValue: {
            get db() {
              return mockDb;
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(TEST_ENCRYPTION_KEY),
          },
        },
      ],
    }).compile();

    service = module.get<PspConnectionService>(PspConnectionService);
  });

  describe('connect', () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const input = {
      provider: PspProvider.STRIPE,
      credentials: { secretKey: 'sk_test_123', webhookSecret: 'whsec_abc' },
    };

    it('should create a new connection when none exists', async () => {
      const createdRecord = {
        id: 'conn-1',
        tenantId,
        provider: 'stripe',
        verified: false,
        lastVerifiedAt: null,
        createdAt: new Date('2024-01-01'),
      };

      // Mock select (no existing connection)
      const selectChain: any = {};
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.limit = jest.fn().mockResolvedValue([]);
      mockSelect.mockReturnValue(selectChain);

      // Mock insert
      const insertChain: any = {};
      insertChain.values = jest.fn().mockReturnValue(insertChain);
      insertChain.returning = jest.fn().mockResolvedValue([createdRecord]);
      mockInsert.mockReturnValue(insertChain);

      const result = await service.connect(tenantId, input);

      expect(result.id).toBe('conn-1');
      expect(result.tenantId).toBe(tenantId);
      expect(result.provider).toBe('stripe');
      expect(result.verified).toBe(false);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should update existing connection and reset verification', async () => {
      const existingRecord = {
        id: 'conn-existing',
        tenantId,
        provider: 'stripe',
        encryptedCredentials: 'old-encrypted-data',
        verified: true,
        lastVerifiedAt: new Date('2024-01-01'),
        createdAt: new Date('2023-12-01'),
      };

      const updatedRecord = {
        ...existingRecord,
        verified: false,
        lastVerifiedAt: null,
      };

      // Mock select (existing connection found)
      const selectChain: any = {};
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.limit = jest.fn().mockResolvedValue([existingRecord]);
      mockSelect.mockReturnValue(selectChain);

      // Mock update
      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.returning = jest.fn().mockResolvedValue([updatedRecord]);
      mockUpdate.mockReturnValue(updateChain);

      const result = await service.connect(tenantId, input);

      expect(result.verified).toBe(false);
      expect(result.lastVerifiedAt).toBeNull();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should encrypt credentials before storing', async () => {
      // Mock select (no existing)
      const selectChain: any = {};
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.limit = jest.fn().mockResolvedValue([]);
      mockSelect.mockReturnValue(selectChain);

      // Capture the values passed to insert
      let insertedValues: any;
      const insertChain: any = {};
      insertChain.values = jest.fn().mockImplementation((vals) => {
        insertedValues = vals;
        return insertChain;
      });
      insertChain.returning = jest.fn().mockResolvedValue([{
        id: 'new-id',
        tenantId,
        provider: 'stripe',
        verified: false,
        lastVerifiedAt: null,
        createdAt: new Date(),
      }]);
      mockInsert.mockReturnValue(insertChain);

      await service.connect(tenantId, input);

      // Verify that credentials were encrypted (not stored as plaintext)
      expect(insertedValues.encryptedCredentials).toBeDefined();
      expect(insertedValues.encryptedCredentials).not.toContain('sk_test_123');
      expect(insertedValues.encryptedCredentials).not.toContain('whsec_abc');

      // Verify the encrypted value can be decrypted back
      const decrypted = decrypt(insertedValues.encryptedCredentials, TEST_ENCRYPTION_KEY);
      expect(JSON.parse(decrypted)).toEqual(input.credentials);
    });
  });

  describe('decryptCredentials', () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const originalCredentials = { secretKey: 'sk_test_xyz', webhookSecret: 'whsec_secret' };

    it('should return decrypted credentials for an existing connection', async () => {
      const encrypted = encrypt(JSON.stringify(originalCredentials), TEST_ENCRYPTION_KEY);

      const selectChain: any = {};
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.limit = jest.fn().mockResolvedValue([{
        id: 'conn-1',
        tenantId,
        provider: 'stripe',
        encryptedCredentials: encrypted,
        verified: true,
        lastVerifiedAt: new Date(),
        createdAt: new Date(),
      }]);
      mockSelect.mockReturnValue(selectChain);

      const result = await service.decryptCredentials(tenantId, PspProvider.STRIPE);
      expect(result).toEqual(originalCredentials);
    });

    it('should throw NotFoundException if no connection exists', async () => {
      const selectChain: any = {};
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.limit = jest.fn().mockResolvedValue([]);
      mockSelect.mockReturnValue(selectChain);

      await expect(
        service.decryptCredentials(tenantId, PspProvider.STRIPE),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException on decryption failure', async () => {
      const selectChain: any = {};
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.limit = jest.fn().mockResolvedValue([{
        id: 'conn-1',
        tenantId,
        provider: 'stripe',
        encryptedCredentials: 'invalid:encrypted:data',
        verified: true,
        lastVerifiedAt: new Date(),
        createdAt: new Date(),
      }]);
      mockSelect.mockReturnValue(selectChain);

      await expect(
        service.decryptCredentials(tenantId, PspProvider.STRIPE),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('listConnections', () => {
    it('should return connections without credentials', async () => {
      const tenantId = 'tenant-123';
      const connections = [
        { id: 'c1', tenantId, provider: 'stripe', verified: true, lastVerifiedAt: new Date(), createdAt: new Date() },
        { id: 'c2', tenantId, provider: 'paystack', verified: false, lastVerifiedAt: null, createdAt: new Date() },
      ];

      const selectChain: any = {};
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockResolvedValue(connections);
      mockSelect.mockReturnValue(selectChain);

      const result = await service.listConnections(tenantId);
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('encryptedCredentials');
      expect(result[1]).not.toHaveProperty('encryptedCredentials');
    });
  });

  describe('markVerified', () => {
    it('should mark connection as verified with timestamp', async () => {
      const now = new Date();
      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.returning = jest.fn().mockResolvedValue([{
        id: 'conn-1',
        tenantId: 'tenant-1',
        provider: 'stripe',
        verified: true,
        lastVerifiedAt: now,
        createdAt: new Date(),
      }]);
      mockUpdate.mockReturnValue(updateChain);

      const result = await service.markVerified('conn-1');
      expect(result.verified).toBe(true);
      expect(result.lastVerifiedAt).toBe(now);
    });

    it('should throw NotFoundException if connection does not exist', async () => {
      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.returning = jest.fn().mockResolvedValue([]);
      mockUpdate.mockReturnValue(updateChain);

      await expect(service.markVerified('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
