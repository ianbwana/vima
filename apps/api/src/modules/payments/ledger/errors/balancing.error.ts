import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when a ledger transaction's entries do not sum to zero.
 * The sum of credits minus debits must equal exactly zero for any valid transaction.
 */
export class BalancingError extends HttpException {
  constructor(netAmount: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'LEDGER_UNBALANCED',
        message: `Ledger transaction is unbalanced: net amount = ${netAmount}. Credits minus debits must equal zero.`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
