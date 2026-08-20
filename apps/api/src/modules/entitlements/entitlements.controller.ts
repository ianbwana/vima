import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { TenantId } from '../tenancy/decorators/tenant.decorator';
import { UpdateModulesDto } from './dto/update-modules.dto';
import { TenancyService } from '../tenancy/tenancy.service';

@Controller('entitlements')
export class EntitlementsController {
  constructor(
    private readonly entitlementsService: EntitlementsService,
    private readonly tenancyService: TenancyService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getEntitlements(@TenantId() tenantId: string) {
    return this.entitlementsService.getEntitlements(tenantId);
  }

  @Post('modules')
  @UseGuards(JwtAuthGuard)
  async updateModules(@TenantId() tenantId: string, @Body() dto: UpdateModulesDto) {
    await this.tenancyService.updateEnabledModules(tenantId, dto.modules);
    this.entitlementsService.invalidateCache(tenantId);
    return this.entitlementsService.getEntitlements(tenantId);
  }
}
