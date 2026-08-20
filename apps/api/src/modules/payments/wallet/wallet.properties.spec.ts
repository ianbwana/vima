import * as fc from 'fast-check';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { LedgerService } from '../ledger/ledger.service';
import { PspResolverService } from '../psp-connection/psp-resolver.service';
import { LedgerAccountType, LedgerDirection } from '../ledger/dto/create-transaction.dto';
import { LedgerTransactionDto } from '../ledger/dto/ledger-entry.dto';
import { TransferDto } from './dto/transfer.dto';

/**
 * Property-Based Test: P2P Transfer Conservation
 *
 * Property 4: P2P Transfer Conservation — For any valid P2P transfer between
 * two wallets, the sender's balance decrease equals the recipient's balance
 * increase exactly (zero-sum within the tenant).
 *
 * **Validates: Requirements 2.2**
 *
 * The WalletService.transfer() debits the sender's customer_wallet and credits
 * the recipient's customer_wallet in a single ledger transaction. This property
 * verifies that the exact transfer amount is conserved — no money is created or
 * destroyed during the transfer.
 */
describe('P2P Transfer Conservation (Property 4)', () => {
  let service: WalletService;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockPspResolverService: jest.Mocked<PspResolverService>;

  beforeEach(async () => {
    mockLedgerService = {
      getOrCreateAccount: jest.fn(),
      getAccountBalance: jest.fn(),
      createTransaction: jest.fn(),
      getAccountEntries: jest.fn(),
    } as unknown as jest.Mocked<LedgerService>;

    mockPspResolverService = {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<PspResolverService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: LedgerService, useValue: mockLedgerService },
        { provide: PspResolverService, useValue: mockPspResolverService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  /**
   * Generator for valid positive decimal amount strings (e.g. "0.01" to "99999.99").
   * Matches the TransferDto regex: /^\d+(\.\d{1,2})?$/
   */
  const amountArb = fc
    .tuple(
      fc.integer({ min: 0, max: 99999 }), // whole part
      fc.integer({ min: 0, max: 99 }), // fractional part (cents)
    )
    .filter(([whole, frac]) => whole > 0 || frac > 0) // must be positive
    .map(([whole, frac]) => `${whole}.${frac.toString().padStart(2, '0')}`);

  /**
   * Generator for UUIDs (sender and recipient must differ).
   */
  const distinctUuidPairArb = fc
    .tuple(fc.uuid(), fc.uuid())
    .filter(([a, b]) => a !== b);

  it('should conserve value: sender debit equals recipient credit for any valid transfer', async () => {
    await fc.assert(
      fc.asyncProperty(
        amountArb,
        distinctUuidPairArb,
        fc.uuid(), // tenantId
        fc.constantFrom('USD', 'KES', 'NGN', 'GHS', 'ZAR'), // currency
        async (amount, [senderId, recipientId], tenantId, currency) => {
          // Reset mocks for each iteration
          mockLedgerService.getOrCreateAccount.mockReset();
          mockLedgerService.getAccountBalance.mockReset();
          mockLedgerService.createTransaction.mockReset();

          const senderAccountId = `sender-acct-${senderId}`;
          const recipientAccountId = `recipient-acct-${recipientId}`;

          // Mock account resolution
          mockLedgerService.getOrCreateAccount
            .mockResolvedValueOnce({
              id: senderAccountId,
              userId: senderId,
              type: LedgerAccountType.CUSTOMER_WALLET,
              currency,
              createdAt: new Date(),
            })
            .mockResolvedValueOnce({
              id: recipientAccountId,
              userId: recipientId,
              type: LedgerAccountType.CUSTOMER_WALLET,
              currency,
              createdAt: new Date(),
            });

          // Mock sender balance to always be sufficient (10x the transfer)
          const numericAmount = parseFloat(amount);
          const sufficientBalance = (numericAmount * 10).toFixed(2);
          mockLedgerService.getAccountBalance.mockResolvedValue({
            balance: sufficientBalance,
            currency,
          });

          // Capture the transaction input to verify conservation
          let capturedEntries: Array<{
            accountId: string;
            amount: string;
            direction: LedgerDirection;
          }> = [];

          mockLedgerService.createTransaction.mockImplementation(
            async (_tenantId, input): Promise<LedgerTransactionDto> => {
              capturedEntries = input.entries;
              return {
                id: 'txn-id',
                type: 'p2p_transfer',
                entries: input.entries.map((e, idx) => ({
                  id: `entry-${idx}`,
                  transactionId: 'txn-id',
                  accountId: e.accountId,
                  amount: e.amount,
                  direction: e.direction,
                  createdAt: new Date(),
                })),
                createdAt: new Date(),
              };
            },
          );

          // Execute the transfer
          const transferDto: TransferDto = {
            senderId,
            recipientId,
            amount,
            currency,
          };

          await service.transfer(tenantId, transferDto);

          // PROPERTY: The transaction must have exactly 2 entries
          expect(capturedEntries).toHaveLength(2);

          // Find the debit (sender) and credit (recipient) entries
          const debitEntry = capturedEntries.find(
            (e) => e.direction === LedgerDirection.DEBIT,
          );
          const creditEntry = capturedEntries.find(
            (e) => e.direction === LedgerDirection.CREDIT,
          );

          // PROPERTY: Both entries must exist
          expect(debitEntry).toBeDefined();
          expect(creditEntry).toBeDefined();

          // PROPERTY: Debit is from sender's account
          expect(debitEntry!.accountId).toBe(senderAccountId);

          // PROPERTY: Credit is to recipient's account
          expect(creditEntry!.accountId).toBe(recipientAccountId);

          // PROPERTY: Conservation — debit amount equals credit amount exactly
          expect(debitEntry!.amount).toBe(creditEntry!.amount);

          // PROPERTY: Both amounts equal the original transfer amount
          expect(debitEntry!.amount).toBe(amount);
          expect(creditEntry!.amount).toBe(amount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should produce a zero-sum transaction: total credits minus debits equals zero for any amount', async () => {
    await fc.assert(
      fc.asyncProperty(
        amountArb,
        distinctUuidPairArb,
        fc.uuid(), // tenantId
        async (amount, [senderId, recipientId], tenantId) => {
          // Reset mocks
          mockLedgerService.getOrCreateAccount.mockReset();
          mockLedgerService.getAccountBalance.mockReset();
          mockLedgerService.createTransaction.mockReset();

          const senderAccountId = `sender-${senderId}`;
          const recipientAccountId = `recipient-${recipientId}`;

          mockLedgerService.getOrCreateAccount
            .mockResolvedValueOnce({
              id: senderAccountId,
              userId: senderId,
              type: LedgerAccountType.CUSTOMER_WALLET,
              currency: 'USD',
              createdAt: new Date(),
            })
            .mockResolvedValueOnce({
              id: recipientAccountId,
              userId: recipientId,
              type: LedgerAccountType.CUSTOMER_WALLET,
              currency: 'USD',
              createdAt: new Date(),
            });

          const numericAmount = parseFloat(amount);
          mockLedgerService.getAccountBalance.mockResolvedValue({
            balance: (numericAmount * 5).toFixed(2),
            currency: 'USD',
          });

          let capturedEntries: Array<{
            accountId: string;
            amount: string;
            direction: LedgerDirection;
          }> = [];

          mockLedgerService.createTransaction.mockImplementation(
            async (_tenantId, input): Promise<LedgerTransactionDto> => {
              capturedEntries = input.entries;
              return {
                id: 'txn-id',
                type: 'p2p_transfer',
                entries: input.entries.map((e, idx) => ({
                  id: `entry-${idx}`,
                  transactionId: 'txn-id',
                  accountId: e.accountId,
                  amount: e.amount,
                  direction: e.direction,
                  createdAt: new Date(),
                })),
                createdAt: new Date(),
              };
            },
          );

          await service.transfer(tenantId, {
            senderId,
            recipientId,
            amount,
            currency: 'USD',
          });

          // PROPERTY: Zero-sum — credits minus debits = 0
          // Compute net: sum of credits - sum of debits
          let netCents = 0;
          for (const entry of capturedEntries) {
            const cents = Math.round(parseFloat(entry.amount) * 100);
            if (entry.direction === LedgerDirection.CREDIT) {
              netCents += cents;
            } else {
              netCents -= cents;
            }
          }

          expect(netCents).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property-Based Test: Insufficient Balance Rejection
 *
 * Property 5: Insufficient Balance Rejection — For any P2P transfer attempt where
 * the requested amount exceeds the sender's available balance, the system SHALL reject
 * the transfer and the sender's balance SHALL remain unchanged.
 *
 * **Validates: Requirements 2.3**
 */
describe('Insufficient Balance Rejection (Property 5)', () => {
  function createMockLedgerService() {
    return {
      getOrCreateAccount: jest.fn(),
      getAccountBalance: jest.fn(),
      createTransaction: jest.fn(),
      getAccountEntries: jest.fn(),
    } as unknown as jest.Mocked<LedgerService>;
  }

  function createMockPspResolver() {
    return {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<PspResolverService>;
  }

  it('should reject transfers when amount exceeds sender balance and not create any ledger entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate sender balance (0.01 to 9999.99)
        fc.integer({ min: 1, max: 999999 }).map((cents) => (cents / 100).toFixed(2)),
        // Extra cents to add on top of the balance so transfer always exceeds
        fc.integer({ min: 1, max: 999999 }),
        // Sender and recipient UUIDs (distinct)
        fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
        // Currency
        fc.constantFrom('USD', 'KES', 'NGN', 'GHS', 'ZAR'),
        // Tenant ID
        fc.uuid(),
        async (balanceStr, extraCents, [senderId, recipientId], currency, tenantId) => {
          const balance = parseFloat(balanceStr);
          // Transfer amount is balance + extra (always exceeds available balance)
          const transferAmount = (balance + extraCents / 100).toFixed(2);

          const ledgerService = createMockLedgerService();
          const pspResolver = createMockPspResolver();
          const walletService = new WalletService(ledgerService, pspResolver);

          const senderAccountId = `acc-${senderId}`;
          const recipientAccountId = `acc-${recipientId}`;

          // Mock getOrCreateAccount to return accounts with IDs
          ledgerService.getOrCreateAccount.mockImplementation(
            async (_tenantId, userId, _type, _currency) => ({
              id: userId === senderId ? senderAccountId : recipientAccountId,
              userId,
              type: LedgerAccountType.CUSTOMER_WALLET,
              currency,
              createdAt: new Date(),
            }),
          );

          // Mock getAccountBalance to return the generated balance for sender
          ledgerService.getAccountBalance.mockResolvedValue({
            balance: balanceStr,
            currency,
          });

          // Attempt the transfer — should throw BadRequestException
          let thrownError: any;
          try {
            await walletService.transfer(tenantId, {
              senderId,
              recipientId,
              amount: transferAmount,
              currency,
            });
          } catch (e) {
            thrownError = e;
          }

          // Property: Transfer is rejected with INSUFFICIENT_BALANCE
          expect(thrownError).toBeInstanceOf(BadRequestException);
          expect(thrownError.getResponse()).toMatchObject({
            error: 'INSUFFICIENT_BALANCE',
          });

          // Property: createTransaction was NEVER called (no entries created, balance unchanged)
          expect(ledgerService.createTransaction).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property-Based Test: Invalid Amount Rejection
 *
 * Property 6: Invalid Amount Rejection — For any transfer with an amount that is
 * zero or negative, the system SHALL reject it and no ledger entries SHALL be created.
 *
 * **Validates: Requirements 2.4**
 */
describe('Invalid Amount Rejection (Property 6)', () => {
  function createMockLedgerService() {
    return {
      getOrCreateAccount: jest.fn(),
      getAccountBalance: jest.fn(),
      createTransaction: jest.fn(),
      getAccountEntries: jest.fn(),
    } as unknown as jest.Mocked<LedgerService>;
  }

  function createMockPspResolver() {
    return {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<PspResolverService>;
  }

  it('should reject transfers with zero amount and not call any ledger methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Sender and recipient UUIDs (distinct)
        fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
        // Currency
        fc.constantFrom('USD', 'KES', 'NGN', 'GHS', 'ZAR'),
        // Tenant ID
        fc.uuid(),
        async ([senderId, recipientId], currency, tenantId) => {
          const ledgerService = createMockLedgerService();
          const pspResolver = createMockPspResolver();
          const walletService = new WalletService(ledgerService, pspResolver);

          // Attempt transfer with zero amount
          let thrownError: any;
          try {
            await walletService.transfer(tenantId, {
              senderId,
              recipientId,
              amount: '0',
              currency,
            });
          } catch (e) {
            thrownError = e;
          }

          // Property: Transfer is rejected with INVALID_AMOUNT
          expect(thrownError).toBeInstanceOf(BadRequestException);
          expect(thrownError.getResponse()).toMatchObject({
            error: 'INVALID_AMOUNT',
          });

          // Property: NO ledger service methods should have been called
          expect(ledgerService.getOrCreateAccount).not.toHaveBeenCalled();
          expect(ledgerService.getAccountBalance).not.toHaveBeenCalled();
          expect(ledgerService.createTransaction).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject transfers with negative amounts and not call any ledger methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate negative amounts (from -0.01 to -9999.99)
        fc.integer({ min: 1, max: 999999 }).map((cents) => `-${(cents / 100).toFixed(2)}`),
        // Sender and recipient UUIDs (distinct)
        fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
        // Currency
        fc.constantFrom('USD', 'KES', 'NGN', 'GHS', 'ZAR'),
        // Tenant ID
        fc.uuid(),
        async (negativeAmount, [senderId, recipientId], currency, tenantId) => {
          const ledgerService = createMockLedgerService();
          const pspResolver = createMockPspResolver();
          const walletService = new WalletService(ledgerService, pspResolver);

          // Attempt transfer with negative amount
          let thrownError: any;
          try {
            await walletService.transfer(tenantId, {
              senderId,
              recipientId,
              amount: negativeAmount,
              currency,
            });
          } catch (e) {
            thrownError = e;
          }

          // Property: Transfer is rejected with INVALID_AMOUNT
          expect(thrownError).toBeInstanceOf(BadRequestException);
          expect(thrownError.getResponse()).toMatchObject({
            error: 'INVALID_AMOUNT',
          });

          // Property: NO ledger service methods should have been called
          expect(ledgerService.getOrCreateAccount).not.toHaveBeenCalled();
          expect(ledgerService.getAccountBalance).not.toHaveBeenCalled();
          expect(ledgerService.createTransaction).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
