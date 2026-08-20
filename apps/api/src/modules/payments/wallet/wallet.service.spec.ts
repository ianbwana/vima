import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { LedgerService } from '../ledger/ledger.service';
import { PspResolverService } from '../psp-connection/psp-resolver.service';
import { LedgerAccountType, LedgerDirection } from '../ledger/dto/create-transaction.dto';
import { TransferDto } from './dto/transfer.dto';

describe('WalletService', () => {
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

  describe('transfer', () => {
    const tenantId = 'tenant-1';

    const validTransfer: TransferDto = {
      senderId: 'user-sender-uuid',
      recipientId: 'user-recipient-uuid',
      amount: '50.00',
      currency: 'USD',
    };

    const senderAccount = {
      id: 'sender-account-id',
      userId: 'user-sender-uuid',
      type: LedgerAccountType.CUSTOMER_WALLET,
      currency: 'USD',
      createdAt: new Date(),
    };

    const recipientAccount = {
      id: 'recipient-account-id',
      userId: 'user-recipient-uuid',
      type: LedgerAccountType.CUSTOMER_WALLET,
      currency: 'USD',
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockLedgerService.getOrCreateAccount
        .mockResolvedValueOnce(senderAccount)
        .mockResolvedValueOnce(recipientAccount);

      mockLedgerService.getAccountBalance.mockResolvedValue({
        balance: '100.00',
        currency: 'USD',
      });

      mockLedgerService.createTransaction.mockResolvedValue({
        id: 'txn-uuid',
        type: 'p2p_transfer',
        entries: [
          {
            id: 'entry-1',
            transactionId: 'txn-uuid',
            accountId: senderAccount.id,
            amount: '50.00',
            direction: LedgerDirection.DEBIT,
            createdAt: new Date(),
          },
          {
            id: 'entry-2',
            transactionId: 'txn-uuid',
            accountId: recipientAccount.id,
            amount: '50.00',
            direction: LedgerDirection.CREDIT,
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
      });
    });

    it('should execute a successful P2P transfer', async () => {
      const result = await service.transfer(tenantId, validTransfer);

      expect(result).toBeDefined();
      expect(result.id).toBe('txn-uuid');
      expect(result.type).toBe('p2p_transfer');
      expect(result.entries).toHaveLength(2);
    });

    it('should get or create sender and recipient accounts', async () => {
      await service.transfer(tenantId, validTransfer);

      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledTimes(2);
      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        tenantId,
        validTransfer.senderId,
        LedgerAccountType.CUSTOMER_WALLET,
        validTransfer.currency,
      );
      expect(mockLedgerService.getOrCreateAccount).toHaveBeenCalledWith(
        tenantId,
        validTransfer.recipientId,
        LedgerAccountType.CUSTOMER_WALLET,
        validTransfer.currency,
      );
    });

    it('should check sender balance before creating transaction', async () => {
      await service.transfer(tenantId, validTransfer);

      expect(mockLedgerService.getAccountBalance).toHaveBeenCalledWith(
        tenantId,
        senderAccount.id,
      );
    });

    it('should create a balanced ledger transaction with debit and credit', async () => {
      await service.transfer(tenantId, validTransfer);

      expect(mockLedgerService.createTransaction).toHaveBeenCalledWith(tenantId, {
        type: 'p2p_transfer',
        description: expect.stringContaining(validTransfer.senderId),
        entries: [
          {
            accountId: senderAccount.id,
            amount: '50.00',
            direction: LedgerDirection.DEBIT,
          },
          {
            accountId: recipientAccount.id,
            amount: '50.00',
            direction: LedgerDirection.CREDIT,
          },
        ],
      });
    });

    it('should reject transfer with zero amount', async () => {
      const zeroTransfer: TransferDto = { ...validTransfer, amount: '0.00' };

      try {
        await service.transfer(tenantId, zeroTransfer);
        fail('Expected BadRequestException to be thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getResponse()).toMatchObject({
          error: 'INVALID_AMOUNT',
        });
      }
    });

    it('should reject transfer with negative amount', async () => {
      const negativeTransfer: TransferDto = { ...validTransfer, amount: '-10.00' };

      try {
        await service.transfer(tenantId, negativeTransfer);
        fail('Expected BadRequestException to be thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getResponse()).toMatchObject({
          error: 'INVALID_AMOUNT',
        });
      }
    });

    it('should not call ledger service when amount is invalid', async () => {
      const zeroTransfer: TransferDto = { ...validTransfer, amount: '0.00' };

      await expect(service.transfer(tenantId, zeroTransfer)).rejects.toThrow();
      expect(mockLedgerService.getOrCreateAccount).not.toHaveBeenCalled();
      expect(mockLedgerService.getAccountBalance).not.toHaveBeenCalled();
      expect(mockLedgerService.createTransaction).not.toHaveBeenCalled();
    });

    it('should reject transfer when sender has insufficient balance', async () => {
      mockLedgerService.getAccountBalance.mockResolvedValue({
        balance: '30.00',
        currency: 'USD',
      });

      try {
        await service.transfer(tenantId, validTransfer);
        fail('Expected BadRequestException to be thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getResponse()).toMatchObject({
          error: 'INSUFFICIENT_BALANCE',
        });
      }
    });

    it('should reject transfer when sender balance equals zero', async () => {
      mockLedgerService.getAccountBalance.mockResolvedValue({
        balance: '0.00',
        currency: 'USD',
      });

      try {
        await service.transfer(tenantId, validTransfer);
        fail('Expected BadRequestException to be thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getResponse()).toMatchObject({
          error: 'INSUFFICIENT_BALANCE',
        });
      }
    });

    it('should not create a transaction when balance is insufficient', async () => {
      mockLedgerService.getAccountBalance.mockResolvedValue({
        balance: '10.00',
        currency: 'USD',
      });

      await expect(service.transfer(tenantId, validTransfer)).rejects.toThrow();
      expect(mockLedgerService.createTransaction).not.toHaveBeenCalled();
    });

    it('should allow transfer when balance exactly matches amount', async () => {
      mockLedgerService.getAccountBalance.mockResolvedValue({
        balance: '50.00',
        currency: 'USD',
      });

      const result = await service.transfer(tenantId, validTransfer);
      expect(result).toBeDefined();
      expect(mockLedgerService.createTransaction).toHaveBeenCalled();
    });

    it('should handle decimal amounts correctly', async () => {
      const decimalTransfer: TransferDto = { ...validTransfer, amount: '25.99' };

      mockLedgerService.getAccountBalance.mockResolvedValue({
        balance: '100.00',
        currency: 'USD',
      });

      await service.transfer(tenantId, decimalTransfer);

      expect(mockLedgerService.createTransaction).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ amount: '25.99' }),
          ]),
        }),
      );
    });
  });
});
