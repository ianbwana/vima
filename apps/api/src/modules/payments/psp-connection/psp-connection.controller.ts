import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { TenantId } from '@/modules/tenancy/decorators/tenant.decorator';
import { PspConnectionService } from './psp-connection.service';
import { ConnectPspDto } from './dto/connect-psp.dto';

@Controller('psp-connections')
@UseGuards(JwtAuthGuard)
export class PspConnectionController {
  constructor(private readonly pspConnectionService: PspConnectionService) {}

  /**
   * POST /psp-connections
   * Connect PSP credentials for the authenticated tenant.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async connect(
    @TenantId() tenantId: string,
    @Body() dto: ConnectPspDto,
  ) {
    const connection = await this.pspConnectionService.connect(tenantId, dto);
    return {
      id: connection.id,
      provider: connection.provider,
      verified: connection.verified,
      lastVerifiedAt: connection.lastVerifiedAt,
      createdAt: connection.createdAt,
    };
  }

  /**
   * POST /psp-connections/:id/verify
   * Verify a PSP connection by performing a test transaction.
   */
  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @TenantId() tenantId: string,
    @Param('id') connectionId: string,
  ) {
    return this.pspConnectionService.verify(connectionId, tenantId);
  }

  /**
   * GET /psp-connections
   * List all PSP connections for the authenticated tenant.
   */
  @Get()
  async list(@TenantId() tenantId: string) {
    const connections = await this.pspConnectionService.listConnections(tenantId);
    return connections.map((conn) => ({
      id: conn.id,
      provider: conn.provider,
      verified: conn.verified,
      lastVerifiedAt: conn.lastVerifiedAt,
      createdAt: conn.createdAt,
    }));
  }
}
