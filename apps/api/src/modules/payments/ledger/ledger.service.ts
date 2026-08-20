import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, sql, desc, isNull, count } from 'drizzle-orm';
import { TenantDbService } from '@/database/tenant-db.service';
import * as schema from '@/database/schemas/tenant.schema';
import { CreateTransactionDto, LedgerAccountType, LedgerDirection } from './dto/create-transaction.dto';
import {
  LedgerTransactionDto,
  AccountBalanceDto,
  LedgerAccountDto,
  LedgerEntryDto,
  PaginatedLedgerEntriesDto,
} from './dto/ledger-entry.dto';
import { BalancingError } from './errors/balancing.error';

export interface PaginationInput {
  page: number;
  limit: number;
}

@Injectable()
export class LedgerService {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Creates a balanced double-entry ledger transaction.
   * Validates that the sum of all entries equals zero (credits - debits = 0).
   * All entries are inserted within a single database transaction for atomicity.
   */
  async createTransaction(
    tenantId: string,
    input: CreateTransactionDto,
  ): Promise<LedgerTransactionDto> {
    // 1. Validate balance: sum of credits - sum of debits must equal 0
    const netAmount = this.computeNetAmount(input.entries);
    if (netAmount !== '0') {
      throw new BalancingError(netAmount);
    }

    // 2. Get tenant DB connection
    const db = this.tenantDb.getConnection(tenantId);

    // 3. Execute within a single database transaction for atomicity
    return await db.transaction(async (tx) => {
      // 4. Insert the ledger transaction header
      const [transaction] = await tx
        .insert(schema.ledgerTransactions)
        .values({
          type: input.type,
          referenceId: input.referenceId ?? null,
          description: input.description ?? null,
        })
        .returning();

      // 5. Insert all ledger entries referencing the transaction
      const entryValues = input.entries.map((entry) => ({
        transactionId: transaction.id,
        accountId: entry.accountId,
        amount: entry.amount,
        direction: entry.direction as 'debit' | 'credit',
      }));

      const entries = await tx
        .insert(schema.ledgerEntries)
        .values(entryValues)
        .returning();

      // 6. Map to response DTO
      const entryDtos: LedgerEntryDto[] = entries.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        accountId: e.accountId,
        amount: e.amount,
        direction: e.direction as LedgerDirection,
        createdAt: e.createdAt,
      }));

      return {
        id: transaction.id,
        type: transaction.type,
        referenceId: transaction.referenceId ?? undefined,
        description: transaction.description ?? undefined,
        entries: entryDtos,
        createdAt: transaction.createdAt,
      };
    });
  }

  /**
   * Computes the current balance of a ledger account.
   * Balance = SUM(credits) - SUM(debits)
   */
  async getAccountBalance(tenantId: string, accountId: string): Promise<AccountBalanceDto> {
    const db = this.tenantDb.getConnection(tenantId);

    // Verify the account exists
    const [account] = await db
      .select()
      .from(schema.ledgerAccounts)
      .where(eq(schema.ledgerAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException(`Ledger account ${accountId} not found`);
    }

    // Compute balance: SUM(credits) - SUM(debits)
    const [result] = await db
      .select({
        balance: sql<string>`COALESCE(SUM(CASE WHEN ${schema.ledgerEntries.direction} = 'credit' THEN ${schema.ledgerEntries.amount}::numeric ELSE -${schema.ledgerEntries.amount}::numeric END), 0)`.as(
          'balance',
        ),
      })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, accountId));

    return {
      balance: parseFloat(result.balance).toFixed(2),
      currency: account.currency,
    };
  }

  /**
   * Returns paginated ledger entries for a given account.
   */
  async getAccountEntries(
    tenantId: string,
    accountId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedLedgerEntriesDto> {
    const db = this.tenantDb.getConnection(tenantId);
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, accountId));

    // Get paginated entries ordered by createdAt DESC
    const entries = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, accountId))
      .orderBy(desc(schema.ledgerEntries.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        accountId: entry.accountId,
        amount: entry.amount,
        direction: entry.direction as LedgerDirection,
        createdAt: entry.createdAt,
      })),
      total: countResult.total,
      page,
      limit,
    };
  }

  /**
   * Gets an existing account or creates one if it doesn't exist.
   * Used for lazily provisioning ledger accounts by type and user.
   */
  async getOrCreateAccount(
    tenantId: string,
    userId: string | null,
    type: LedgerAccountType,
    currency: string,
  ): Promise<LedgerAccountDto> {
    const db = this.tenantDb.getConnection(tenantId);

    // Build the where condition based on whether userId is null or not
    const conditions = userId
      ? and(
          eq(schema.ledgerAccounts.userId, userId),
          eq(schema.ledgerAccounts.type, type),
          eq(schema.ledgerAccounts.currency, currency),
        )
      : and(
          isNull(schema.ledgerAccounts.userId),
          eq(schema.ledgerAccounts.type, type),
          eq(schema.ledgerAccounts.currency, currency),
        );

    // Try to find existing account
    const [existing] = await db
      .select()
      .from(schema.ledgerAccounts)
      .where(conditions)
      .limit(1);

    if (existing) {
      return {
        id: existing.id,
        userId: existing.userId,
        type: existing.type as LedgerAccountType,
        currency: existing.currency,
        createdAt: existing.createdAt,
      };
    }

    // Create new account
    const [created] = await db
      .insert(schema.ledgerAccounts)
      .values({
        userId,
        type,
        currency,
      })
      .returning();

    return {
      id: created.id,
      userId: created.userId,
      type: created.type as LedgerAccountType,
      currency: created.currency,
      createdAt: created.createdAt,
    };
  }

  /**
   * Computes net amount: SUM(credit amounts) - SUM(debit amounts).
   * Returns '0' if balanced, otherwise returns the net imbalance as a string.
   *
   * Uses integer arithmetic in cents to avoid floating-point precision issues.
   */
  private computeNetAmount(entries: { amount: string; direction: LedgerDirection }[]): string {
    let netCents = 0;

    for (const entry of entries) {
      const cents = this.toCents(entry.amount);
      if (entry.direction === LedgerDirection.CREDIT) {
        netCents += cents;
      } else {
        netCents -= cents;
      }
    }

    if (netCents === 0) {
      return '0';
    }

    // Convert back to decimal string for error reporting
    const sign = netCents < 0 ? '-' : '';
    const absCents = Math.abs(netCents);
    const whole = Math.floor(absCents / 100);
    const frac = absCents % 100;
    return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
  }

  /**
   * Converts a decimal amount string (e.g., '100.50') to integer cents.
   */
  private toCents(amount: string): number {
    const parts = amount.split('.');
    const whole = parseInt(parts[0], 10) * 100;
    const frac = parts[1] ? parseInt(parts[1].padEnd(2, '0').slice(0, 2), 10) : 0;
    return whole + frac;
  }
}
