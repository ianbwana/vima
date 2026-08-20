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
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/topup.dto';
import { TransferDto } from './dto/transfer.dto';
import { RefundDto } from './dto/refund.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

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
