import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../billing/guards/platform-admin.guard';

@Controller('tenants')
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTenantDto) {
    const tenant = await this.tenancyService.createTenant(dto);
    return tenant;
  }

  @Post(':id/provision')
  @HttpCode(HttpStatus.ACCEPTED)
  async provision(@Param('id') id: string) {
    return this.tenancyService.provisionTenant(id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  async list() {
    return this.tenancyService.listTenants();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  async getById(@Param('id') id: string) {
    const tenant = await this.tenancyService.findById(id);
    if (!tenant) {
      return { error: 'Tenant not found' };
    }
    return tenant;
  }
}
