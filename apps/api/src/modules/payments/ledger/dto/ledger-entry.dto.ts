import { LedgerAccountType, LedgerDirection } from './create-transaction.dto';

/**
 * Represents a ledger entry as returned from queries.
 */
export class LedgerEntryDto {
  id: string;
  transactionId: string;
  accountId: string;
  amount: string;
  direction: LedgerDirection;
  createdAt: Date;
}

/**
 * Represents a ledger transaction with its entries.
 */
export class LedgerTransactionDto {
  id: string;
  type: string;
  referenceId?: string;
  description?: string;
  entries: LedgerEntryDto[];
  createdAt: Date;
}

/**
 * Represents a ledger account with its computed balance.
 */
export class LedgerAccountDto {
  id: string;
  userId: string | null;
  type: LedgerAccountType;
  currency: string;
  createdAt: Date;
}

/**
 * Account balance response.
 */
export class AccountBalanceDto {
  balance: string;
  currency: string;
}

/**
 * Paginated result wrapper for ledger entries.
 */
export class PaginatedLedgerEntriesDto {
  data: LedgerEntryDto[];
  total: number;
  page: number;
  limit: number;
}
