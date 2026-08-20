import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerAccountType, LedgerDirection } from '../ledger/dto/create-transaction.dto';
import { AccountBalanceDto, LedgerTransactionDto } from '../ledger/dto/ledger-entry.dto';
import { PspResolverService } from '../psp-connection/psp-resolver.service';
import { TopupDto, TopupResponseDto, CompleteTopupDto } from './dto/topup.dto';
import { TransferDto } from './dto/transfer.dto';
import { RefundDto, RefundResponseDto } from './dto/refund.dto';

/**
 * WalletService manages wallet top-ups and the completion flow.
 *
 * Top-up flow:
 * 1. Client calls topup() → creates a payment intent via the tenant's PSP adapter
 * 2. Client confirms payment on their end (using clientSecret / authorization URL)
 * 3. PSP sends webhook on payment success → webhook processor calls completeTopup()
 * 4. completeTopup() credits customer_wallet and debits psp_clearing in a single ledger transaction
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly ledgerService: LedgerService,
    private readonly pspResolverService: PspResolverService,
  ) {}

  /**
   * Initiates a wallet top-up by creating a payment intent via the tenant's configured PSP.
   *
   * @param tenantId - The tenant context
   * @param userId - The user requesting the top-up
   * @param input - Top-up details (amount, currency, customerId)
   * @returns Payment intent details (clientSecret for Stripe, authorization URL for Paystack)
   */
  async topup(
    tenantId: string,
    userId: string,
    input: TopupDto,
  ): Promise<TopupResponseDto> {
    this.logger.log(
      `Initiating top-up for user ${userId} in tenant ${tenantId}: ${input.amount} ${input.currency}`,
    );

    // Resolve the tenant's PSP adapter (decrypts credentials, returns configured adapter)
    const adapter = await this.pspResolverService.resolve(tenantId);

    // Create a payment intent via the PSP
    const paymentIntent = await adapter.createPaymentIntent({
      amount: input.amount,
      currency: input.currency,
      customerId: input.customerId,
      metadata: {
        ...input.metadata,
        tenantId,
        userId,
        type: 'wallet_topup',
      },
    });

    this.logger.log(
      `Payment intent created: ${paymentIntent.id} for user ${userId}`,
    );

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.clientSecret,
      status: 'requires_confirmation',
    };
  }

  /**
   * Completes a wallet top-up after payment success is confirmed via webhook.
   *
   * This method is called by the webhook processor when a `payment.succeeded` event
   * is received. It credits the customer's wallet account and debits the psp_clearing
   * account in a single balanced ledger transaction.
   *
   * @param input - Details from the webhook event (tenantId, userId, amount, currency, reference)
   */
  async completeTopup(input: CompleteTopupDto): Promise<void> {
    const { tenantId, userId, amount, currency, providerReference } = input;

    this.logger.log(
      `Completing top-up for user ${userId} in tenant ${tenantId}: ${amount} ${currency} (ref: ${providerReference})`,
    );

    // Ensure both accounts exist (lazy creation)
    const customerAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      userId,
      LedgerAccountType.CUSTOMER_WALLET,
      currency,
    );

    const clearingAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      null, // system account, not tied to a user
      LedgerAccountType.PSP_CLEARING,
      currency,
    );

    // Convert amount (minor units) to decimal string for ledger
    const amountStr = (amount / 100).toFixed(2);

    // Create a balanced double-entry transaction:
    // - Credit customer_wallet (increases their balance)
    // - Debit psp_clearing (money came from PSP)
    await this.ledgerService.createTransaction(tenantId, {
      type: 'topup',
      referenceId: providerReference,
      description: `Wallet top-up via PSP (ref: ${providerReference})`,
      entries: [
        {
          accountId: customerAccount.id,
          amount: amountStr,
          direction: LedgerDirection.CREDIT,
        },
        {
          accountId: clearingAccount.id,
          amount: amountStr,
          direction: LedgerDirection.DEBIT,
        },
      ],
    });

    this.logger.log(
      `Top-up completed: credited ${amountStr} ${currency} to wallet for user ${userId}`,
    );
  }

  /**
   * Executes a P2P transfer between two users within the same tenant.
   * Debits the sender's customer_wallet and credits the recipient's customer_wallet
   * in a single balanced ledger transaction.
   *
   * Validates:
   * - Amount must be positive (> 0)
   * - Sender must have sufficient balance
   */
  async transfer(tenantId: string, input: TransferDto): Promise<LedgerTransactionDto> {
    const { senderId, recipientId, amount, currency } = input;

    // 1. Validate amount is positive
    const numericAmount = parseFloat(amount);
    if (numericAmount <= 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_AMOUNT',
        message: 'Transfer amount must be greater than zero.',
      });
    }

    // 2. Get or create sender and recipient wallet accounts
    const senderAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      senderId,
      LedgerAccountType.CUSTOMER_WALLET,
      currency,
    );

    const recipientAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      recipientId,
      LedgerAccountType.CUSTOMER_WALLET,
      currency,
    );

    // 3. Check sender has sufficient balance
    const senderBalance = await this.ledgerService.getAccountBalance(tenantId, senderAccount.id);
    const availableBalance = parseFloat(senderBalance.balance);

    if (availableBalance < numericAmount) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance. Available: ${senderBalance.balance}, requested: ${amount}.`,
      });
    }

    // 4. Create the balanced ledger transaction (debit sender, credit recipient)
    const transaction = await this.ledgerService.createTransaction(tenantId, {
      type: 'p2p_transfer',
      description: `P2P transfer from ${senderId} to ${recipientId}`,
      entries: [
        {
          accountId: senderAccount.id,
          amount,
          direction: LedgerDirection.DEBIT,
        },
        {
          accountId: recipientAccount.id,
          amount,
          direction: LedgerDirection.CREDIT,
        },
      ],
    });

    this.logger.log(
      `P2P transfer completed: ${amount} ${currency} from ${senderId} to ${recipientId}`,
    );

    return transaction;
  }

  /**
   * Returns the computed balance for a customer's wallet account.
   *
   * @param tenantId - The tenant context
   * @param userId - The user whose balance to query
   * @param currency - The currency of the wallet account
   * @returns The account balance and currency
   */
  async getBalance(
    tenantId: string,
    userId: string,
    currency: string,
  ): Promise<AccountBalanceDto> {
    const account = await this.ledgerService.getOrCreateAccount(
      tenantId,
      userId,
      LedgerAccountType.CUSTOMER_WALLET,
      currency,
    );

    return this.ledgerService.getAccountBalance(tenantId, account.id);
  }

  /**
   * Processes a refund by debiting the customer's wallet and crediting psp_clearing,
   * then invoking the PSP adapter's refund method.
   *
   * Flow:
   * 1. Get customer's wallet account
   * 2. Get psp_clearing account
   * 3. Create a balanced ledger transaction: debit customer_wallet, credit psp_clearing
   * 4. Call PSP adapter's refund method with the original payment reference
   * 5. Return the transaction result
   *
   * @param tenantId - The tenant context
   * @param input - Refund details (userId, paymentId, amount, currency, reason)
   * @returns Refund response with transaction and PSP details
   */
  async refund(tenantId: string, input: RefundDto): Promise<RefundResponseDto> {
    const { userId, paymentId, amount, currency, reason } = input;

    this.logger.log(
      `Initiating refund for user ${userId} in tenant ${tenantId}: payment ${paymentId}`,
    );

    // 1. Get customer's wallet account
    const customerAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      userId,
      LedgerAccountType.CUSTOMER_WALLET,
      currency,
    );

    // 2. Get psp_clearing account
    const clearingAccount = await this.ledgerService.getOrCreateAccount(
      tenantId,
      null, // system account
      LedgerAccountType.PSP_CLEARING,
      currency,
    );

    // 3. Determine the refund amount string for the ledger
    // Amount is in minor units (cents); convert to decimal string
    const amountStr = amount ? (amount / 100).toFixed(2) : undefined;

    // If no amount specified, we still need an amount for the ledger.
    // The PSP will handle "full refund" semantics, but we need the PSP response
    // to know the actual refunded amount. For now, call PSP first to get the amount.
    // However, the design says: ledger first, then PSP. We'll require amount for ledger.
    if (!amountStr) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AMOUNT_REQUIRED',
        message: 'Refund amount is required for ledger recording.',
      });
    }

    // 3. Create a balanced ledger transaction: debit customer_wallet, credit psp_clearing
    const transaction = await this.ledgerService.createTransaction(tenantId, {
      type: 'refund',
      referenceId: paymentId,
      description: `Refund for payment ${paymentId}${reason ? `: ${reason}` : ''}`,
      entries: [
        {
          accountId: customerAccount.id,
          amount: amountStr,
          direction: LedgerDirection.DEBIT,
        },
        {
          accountId: clearingAccount.id,
          amount: amountStr,
          direction: LedgerDirection.CREDIT,
        },
      ],
    });

    // 4. Call PSP adapter's refund method
    const adapter = await this.pspResolverService.resolve(tenantId);
    const pspRefund = await adapter.refund({
      paymentId,
      amount,
      reason,
    });

    this.logger.log(
      `Refund completed: ${amountStr} ${currency} for user ${userId} (PSP refund: ${pspRefund.id})`,
    );

    // 5. Return the result
    return {
      transactionId: transaction.id,
      pspRefundId: pspRefund.id,
      status: pspRefund.status,
    };
  }
}
