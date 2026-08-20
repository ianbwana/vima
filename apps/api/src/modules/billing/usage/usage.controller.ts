import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';
import { TenantId } from '@/modules/tenancy/decorators/tenant.decorator';
import { UsageService } from './usage.service';
import { RecordUsageDto } from './dto/record-usage.dto';

/**
 * REST controller for platform billing usage metering.
 *
 * POST /billing/usage — Record a billable usage event (platform admin only)
 * GET  /billing/usage — Query current period usage for a tenant
 */
@Controller('billing/usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  /**
   * POST /billing/usage
   * Records a billable event (job completed, app build triggered, SMS sent).
   * Restricted to platform admins or internal service calls.
   * Requirement 8.1
   */
  @Post()
  @UseGuards(PlatformAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async recordUsage(@Body() dto: RecordUsageDto) {
    return this.usageService.recordUsage(dto.tenantId, dto.metric, dto.quantity);
  }

  /**
   * GET /billing/usage
   * Returns accumulated usage records for the current billing period,
   * grouped by metric type.
   * Requirement 8.5
   */
  @Get()
  async getCurrentPeriodUsage(
    @TenantId() tenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    // Allow explicit tenantId query param for platform admins,
    // fall back to JWT tenantId for tenant users
    const resolvedTenantId = queryTenantId || tenantId;
    return this.usageService.getCurrentPeriodUsage(resolvedTenantId);
  }
}
