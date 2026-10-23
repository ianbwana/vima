import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { TenantId } from '@/modules/tenancy/decorators/tenant.decorator';
import { UserId } from '@/modules/identity/decorators/user-id.decorator';
import { PlatformAdminGuard } from '@/modules/billing/guards/platform-admin.guard';
import { Roles } from '@/modules/billing/guards/roles.decorator';
import { TenantDbService } from '@/database/tenant-db.service';
import * as tenantSchema from '@/database/schemas/tenant.schema';
import { desc, inArray } from 'drizzle-orm';
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/topup.dto';
import { TransferDto } from './dto/transfer.dto';
import { RefundDto } from './dto/refund.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly tenantDb: TenantDbService,
  ) {}

  /**
   * GET /wallet/transactions?limit=10
   * List recent ledger transactions (newest first) with their entries.
   * Returns the whole tenant ledger, so it is limited to tenant staff.
   */
  @Get('transactions')
  @UseGuards(PlatformAdminGuard)
  @Roles('owner', 'admin', 'finance')
  async listTransactions(
    @TenantId() tenantId: string,
    @Query('limit') limitRaw?: string,
  ) {
    const db = this.tenantDb.getConnection(tenantId);
    const limit = Math.min(100, Math.max(1, parseInt(limitRaw ?? '20', 10) || 20));

    const txns = await db
      .select()
      .from(tenantSchema.ledgerTransactions)
      .orderBy(desc(tenantSchema.ledgerTransactions.createdAt))
      .limit(limit);

    if (txns.length === 0) {
      return [];
    }

    const txnIds = txns.map((t) => t.id);
    const entries = await db
      .select({
        id: tenantSchema.ledgerEntries.id,
        transactionId: tenantSchema.ledgerEntries.transactionId,
        amount: tenantSchema.ledgerEntries.amount,
        direction: tenantSchema.ledgerEntries.direction,
      })
      .from(tenantSchema.ledgerEntries)
      .where(inArray(tenantSchema.ledgerEntries.transactionId, txnIds));

    const entriesByTxn = new Map<string, Array<{ id: string; amount: string; direction: string }>>();
    for (const e of entries) {
      const list = entriesByTxn.get(e.transactionId) ?? [];
      list.push({ id: e.id, amount: e.amount, direction: e.direction });
      entriesByTxn.set(e.transactionId, list);
    }

    return txns.map((t) => ({
      id: t.id,
      type: t.type,
      referenceId: t.referenceId ?? undefined,
      description: t.description ?? undefined,
      entries: entriesByTxn.get(t.id) ?? [],
      createdAt: t.createdAt,
    }));
  }

  /**
   * POST /wallet/topup
   * Initiate a wallet top-up by creating a payment intent via the tenant's PSP.
   */
  @Post('topup')
  @HttpCode(HttpStatus.CREATED)
  async topup(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body() dto: TopupDto,
  ) {
    return this.walletService.topup(tenantId, userId, dto);
  }

  /**
   * POST /wallet/transfer
   * Execute a P2P transfer between two users within the same tenant.
   */
  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @TenantId() tenantId: string,
    @Body() dto: TransferDto,
  ) {
    return this.walletService.transfer(tenantId, dto);
  }

  /**
   * GET /wallet/balance?currency=USD
   * Get the current wallet balance for the authenticated user.
   */
  @Get('balance')
  async getBalance(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Query('currency') currency: string,
  ) {
    return this.walletService.getBalance(tenantId, userId, currency);
  }

  /**
   * POST /wallet/refund
   * Issue a refund for a completed payment (admin operation).
   */
  @Post('refund')
  @HttpCode(HttpStatus.CREATED)
  async refund(
    @TenantId() tenantId: string,
    @Body() dto: RefundDto,
  ) {
    return this.walletService.refund(tenantId, dto);
  }
}
