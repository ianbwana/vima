import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntitlementsService } from './entitlements.service';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../billing/guards/platform-admin.guard';
import { Roles } from '../billing/guards/roles.decorator';
import { TenantId } from '../tenancy/decorators/tenant.decorator';
import { UpdateModulesDto } from './dto/update-modules.dto';
import { TenancyService } from '../tenancy/tenancy.service';
import { ModuleEnabledEvent, ModuleDisabledEvent } from './events/module-status-changed.event';

@Controller('entitlements')
export class EntitlementsController {
  constructor(
    private readonly entitlementsService: EntitlementsService,
    private readonly tenancyService: TenancyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getEntitlements(@TenantId() tenantId: string) {
    return this.entitlementsService.getEntitlements(tenantId);
  }

  // Changing modules alters the tenant's bill, so only tenant owners/admins and
  // platform admins may do it. Cross-tenant access is blocked by JwtStrategy.
  @Post('modules')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @Roles('owner', 'admin', 'platform_admin')
  async updateModules(@TenantId() tenantId: string, @Body() dto: UpdateModulesDto) {
    // Get current entitlements to determine which modules changed
    const currentEntitlements = await this.entitlementsService.getEntitlements(tenantId);
    const currentModules = Object.entries(currentEntitlements)
      .filter(([key, value]) => key !== 'tier' && value === true)
      .map(([key]) => key);

    // Perform the update
    await this.tenancyService.updateEnabledModules(tenantId, dto.modules);
    this.entitlementsService.invalidateCache(tenantId);

    // Determine which modules were enabled/disabled
    const newlyEnabled = dto.modules.filter((m) => !currentModules.includes(m));
    const newlyDisabled = currentModules.filter((m) => !dto.modules.includes(m));

    // Emit events for module changes (consumed by BillingModule)
    for (const module of newlyEnabled) {
      this.eventEmitter.emit(
        ModuleEnabledEvent.event,
        new ModuleEnabledEvent(tenantId, module),
      );
    }
    for (const module of newlyDisabled) {
      this.eventEmitter.emit(
        ModuleDisabledEvent.event,
        new ModuleDisabledEvent(tenantId, module),
      );
    }

    return this.entitlementsService.getEntitlements(tenantId);
  }
}
