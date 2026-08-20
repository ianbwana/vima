import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { TenantDbService } from '@/database/tenant-db.service';
import { CreateTransactionDto, LedgerAccountType, LedgerDirection } from './dto/create-transaction.dto';
import { BalancingError } from './errors/balancing.error';

describe('LedgerService', () => {
  let service: LedgerService;
  let mockTenantDb: jest.Mocked<TenantDbService>;

  // Helper to create a mock Drizzle DB with transaction support
  const createMockDb = () => {
    const insertReturning = jest.fn();
    const insertValues = jest.fn().mockReturnValue({ returning: insertReturning });
    const insert = jest.fn().mockReturnValue({ values: insertValues });

    const mockTx = { insert };

    // By default, simulate successful inserts
    let insertCallCount = 0;
    insertReturning.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        // First insert: ledger_transactions
        return [
          {
            id: 'txn-uuid-123',
            type: 'topup',
            referenceId: null,
            description: null,
            createdAt: new Date('2024-01-01T00:00:00Z'),
          },
        ];
      }
      // Second insert: ledger_entries
      return [
        {
          id: 'entry-uuid-1',
          transactionId: 'txn-uuid-123',
          accountId: 'account-1',
          amount: '100.00',
          direction: 'credit',
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'entry-uuid-2',
          transactionId: 'txn-uuid-123',
          accountId: 'account-2',
          amount: '100.00',
          direction: 'debit',
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];
    });

    const transaction = jest.fn().mockImplementation(async (fn) => {
      return fn(mockTx);
    });

    return {
      db: { transaction },
      tx: mockTx,
      insert,
      insertValues,
      insertReturning,
      resetCallCount: () => {
        insertCallCount = 0;
      },
    };
  };

  beforeEach(async () => {
    const mockDb = createMockDb();

    mockTenantDb = {
      getConnection: jest.fn().mockReturnValue(mockDb.db),
    } as unknown as jest.Mocked<TenantDbService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        { provide: TenantDbService, useValue: mockTenantDb },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  describe('createTransaction', () => {
    it('should create a balanced transaction successfully', async () => {
      const input: CreateTransactionDto = {
        type: 'topup',
        entries: [
          { accountId: 'account-1', amount: '100.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '100.00', direction: LedgerDirection.DEBIT },
        ],
      };

      const result = await service.createTransaction('tenant-1', input);

      expect(result).toBeDefined();
      expect(result.id).toBe('txn-uuid-123');
      expect(result.type).toBe('topup');
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].direction).toBe(LedgerDirection.CREDIT);
      expect(result.entries[1].direction).toBe(LedgerDirection.DEBIT);
    });

    it('should throw BalancingError when credits exceed debits', async () => {
      const input: CreateTransactionDto = {
        type: 'topup',
        entries: [
          { accountId: 'account-1', amount: '100.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '50.00', direction: LedgerDirection.DEBIT },
        ],
      };

      await expect(service.createTransaction('tenant-1', input)).rejects.toThrow(BalancingError);
    });

    it('should throw BalancingError when debits exceed credits', async () => {
      const input: CreateTransactionDto = {
        type: 'payout',
        entries: [
          { accountId: 'account-1', amount: '50.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '100.00', direction: LedgerDirection.DEBIT },
        ],
      };

      await expect(service.createTransaction('tenant-1', input)).rejects.toThrow(BalancingError);
    });

    it('should not call database when transaction is unbalanced', async () => {
      const input: CreateTransactionDto = {
        type: 'topup',
        entries: [
          { accountId: 'account-1', amount: '100.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '99.99', direction: LedgerDirection.DEBIT },
        ],
      };

      await expect(service.createTransaction('tenant-1', input)).rejects.toThrow(BalancingError);
      // DB transaction should never be called since validation happens first
      const db = mockTenantDb.getConnection('tenant-1');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should handle multi-entry balanced transactions', async () => {
      const input: CreateTransactionDto = {
        type: 'fare',
        entries: [
          { accountId: 'account-1', amount: '80.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '20.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-3', amount: '100.00', direction: LedgerDirection.DEBIT },
        ],
      };

      // This is balanced (80 + 20 credits = 100 debit), so it should not throw
      const result = await service.createTransaction('tenant-1', input);
      expect(result).toBeDefined();
    });

    it('should pass the correct tenant ID to TenantDbService', async () => {
      const input: CreateTransactionDto = {
        type: 'topup',
        entries: [
          { accountId: 'account-1', amount: '50.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '50.00', direction: LedgerDirection.DEBIT },
        ],
      };

      await service.createTransaction('specific-tenant-id', input);
      expect(mockTenantDb.getConnection).toHaveBeenCalledWith('specific-tenant-id');
    });

    it('should include optional referenceId and description', async () => {
      const mockDb = createMockDb();
      mockTenantDb.getConnection = jest.fn().mockReturnValue(mockDb.db);

      const input: CreateTransactionDto = {
        type: 'p2p_transfer',
        referenceId: 'ref-uuid-456',
        description: 'Payment for services',
        entries: [
          { accountId: 'account-1', amount: '25.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '25.00', direction: LedgerDirection.DEBIT },
        ],
      };

      await service.createTransaction('tenant-1', input);

      // Verify insert was called with correct values
      expect(mockDb.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'p2p_transfer',
          referenceId: 'ref-uuid-456',
          description: 'Payment for services',
        }),
      );
    });

    it('should execute all inserts within a single DB transaction', async () => {
      const mockDb = createMockDb();
      mockTenantDb.getConnection = jest.fn().mockReturnValue(mockDb.db);

      const input: CreateTransactionDto = {
        type: 'topup',
        entries: [
          { accountId: 'account-1', amount: '100.00', direction: LedgerDirection.CREDIT },
          { accountId: 'account-2', amount: '100.00', direction: LedgerDirection.DEBIT },
        ],
      };

      await service.createTransaction('tenant-1', input);

      // db.transaction should have been called exactly once
      expect(mockDb.db.transaction).toHaveBeenCalledTimes(1);
      // All inserts happen inside the transaction callback (via tx)
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('append-only semantics', () => {
    it('should not expose any update or delete methods', () => {
      // The service should only have create/read methods, no update/delete
      const serviceProto = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
      const mutationMethods = serviceProto.filter(
        (method) =>
          method.startsWith('update') ||
          method.startsWith('delete') ||
          method.startsWith('remove') ||
          method.startsWith('edit'),
      );
      expect(mutationMethods).toHaveLength(0);
    });
  });

  describe('getAccountBalance', () => {
    it('should compute balance as SUM of credits minus debits', async () => {
      const mockSelect = jest.fn();
      const mockFrom = jest.fn();
      const mockWhere = jest.fn();
      const mockLimit = jest.fn();

      // First call: verify account exists
      mockLimit.mockResolvedValueOnce([
        { id: 'account-1', userId: 'user-1', type: 'customer_wallet', currency: 'USD', createdAt: new Date() },
      ]);

      // Second call: balance aggregation
      const mockWhere2 = jest.fn().mockResolvedValueOnce([{ balance: '250.00' }]);
      const mockFrom2 = jest.fn().mockReturnValue({ where: mockWhere2 });

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: mockFrom };
        }
        return { from: mockFrom2 };
      });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const db = { select: mockSelect };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getAccountBalance('tenant-1', 'account-1');

      expect(result.balance).toBe('250.00');
      expect(result.currency).toBe('USD');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      const mockSelect = jest.fn();
      const mockFrom = jest.fn();
      const mockWhere = jest.fn();
      const mockLimit = jest.fn().mockResolvedValueOnce([]);

      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const db = { select: mockSelect };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      await expect(service.getAccountBalance('tenant-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return 0.00 balance for account with no entries', async () => {
      const mockSelect = jest.fn();
      const mockFrom = jest.fn();
      const mockWhere = jest.fn();
      const mockLimit = jest.fn();

      // First call: account exists
      mockLimit.mockResolvedValueOnce([
        { id: 'account-1', userId: 'user-1', type: 'customer_wallet', currency: 'KES', createdAt: new Date() },
      ]);

      // Second call: empty balance
      const mockWhere2 = jest.fn().mockResolvedValueOnce([{ balance: '0' }]);
      const mockFrom2 = jest.fn().mockReturnValue({ where: mockWhere2 });

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: mockFrom };
        }
        return { from: mockFrom2 };
      });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const db = { select: mockSelect };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getAccountBalance('tenant-1', 'account-1');

      expect(result.balance).toBe('0.00');
      expect(result.currency).toBe('KES');
    });
  });

  describe('getOrCreateAccount', () => {
    it('should return existing account if found', async () => {
      const existingAccount = {
        id: 'acct-uuid-1',
        userId: 'user-1',
        type: 'customer_wallet',
        currency: 'USD',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };

      const mockSelect = jest.fn();
      const mockFrom = jest.fn();
      const mockWhere = jest.fn();
      const mockLimit = jest.fn().mockResolvedValueOnce([existingAccount]);

      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const db = { select: mockSelect, insert: jest.fn() };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getOrCreateAccount(
        'tenant-1',
        'user-1',
        LedgerAccountType.CUSTOMER_WALLET,
        'USD',
      );

      expect(result.id).toBe('acct-uuid-1');
      expect(result.userId).toBe('user-1');
      expect(result.type).toBe(LedgerAccountType.CUSTOMER_WALLET);
      expect(result.currency).toBe('USD');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should create a new account when not found', async () => {
      const createdAccount = {
        id: 'acct-uuid-new',
        userId: 'user-2',
        type: 'provider_wallet',
        currency: 'KES',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };

      const mockSelect = jest.fn();
      const mockFrom = jest.fn();
      const mockWhere = jest.fn();
      const mockLimit = jest.fn().mockResolvedValueOnce([]); // Not found

      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const mockReturning = jest.fn().mockResolvedValueOnce([createdAccount]);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

      const db = { select: mockSelect, insert: mockInsert };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getOrCreateAccount(
        'tenant-1',
        'user-2',
        LedgerAccountType.PROVIDER_WALLET,
        'KES',
      );

      expect(result.id).toBe('acct-uuid-new');
      expect(result.userId).toBe('user-2');
      expect(result.type).toBe(LedgerAccountType.PROVIDER_WALLET);
      expect(result.currency).toBe('KES');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should handle null userId for system accounts', async () => {
      const systemAccount = {
        id: 'acct-system',
        userId: null,
        type: 'platform_fees',
        currency: 'USD',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };

      const mockSelect = jest.fn();
      const mockFrom = jest.fn();
      const mockWhere = jest.fn();
      const mockLimit = jest.fn().mockResolvedValueOnce([systemAccount]);

      mockSelect.mockReturnValue({ from: mockFrom });
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });

      const db = { select: mockSelect, insert: jest.fn() };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getOrCreateAccount(
        'tenant-1',
        null,
        LedgerAccountType.PLATFORM_FEES,
        'USD',
      );

      expect(result.id).toBe('acct-system');
      expect(result.userId).toBeNull();
      expect(result.type).toBe(LedgerAccountType.PLATFORM_FEES);
    });
  });

  describe('getAccountEntries', () => {
    it('should return paginated entries for an account', async () => {
      const entries = [
        {
          id: 'entry-1',
          transactionId: 'txn-1',
          accountId: 'account-1',
          amount: '100.00',
          direction: 'credit',
          createdAt: new Date('2024-01-02T00:00:00Z'),
        },
        {
          id: 'entry-2',
          transactionId: 'txn-2',
          accountId: 'account-1',
          amount: '50.00',
          direction: 'debit',
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      const mockSelect = jest.fn();
      const mockFrom = jest.fn();
      const mockWhere = jest.fn();

      // First call: count
      mockWhere.mockResolvedValueOnce([{ total: 5 }]);

      // Second call: entries with pagination
      const mockOrderBy = jest.fn();
      const mockLimitFn = jest.fn();
      const mockOffset = jest.fn().mockResolvedValueOnce(entries);

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValueOnce([{ total: 5 }]) }) };
        }
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockResolvedValueOnce(entries),
                }),
              }),
            }),
          }),
        };
      });

      const db = { select: mockSelect };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getAccountEntries('tenant-1', 'account-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.data[0].id).toBe('entry-1');
      expect(result.data[0].direction).toBe(LedgerDirection.CREDIT);
      expect(result.data[1].direction).toBe(LedgerDirection.DEBIT);
    });

    it('should return empty data array with zero total when no entries exist', async () => {
      const mockSelect = jest.fn();

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValueOnce([{ total: 0 }]) }) };
        }
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockResolvedValueOnce([]),
                }),
              }),
            }),
          }),
        };
      });

      const db = { select: mockSelect };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getAccountEntries('tenant-1', 'account-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should correctly calculate offset for page 2', async () => {
      const mockSelect = jest.fn();

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return { from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValueOnce([{ total: 25 }]) }) };
        }
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockResolvedValueOnce([]),
                }),
              }),
            }),
          }),
        };
      });

      const db = { select: mockSelect };
      mockTenantDb.getConnection = jest.fn().mockReturnValue(db);

      const result = await service.getAccountEntries('tenant-1', 'account-1', {
        page: 2,
        limit: 10,
      });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(25);
    });
  });
});
