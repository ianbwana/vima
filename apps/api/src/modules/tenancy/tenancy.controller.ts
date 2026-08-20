import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

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
  async list() {
    return this.tenancyService.listTenants();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const tenant = await this.tenancyService.findById(id);
    if (!tenant) {
      return { error: 'Tenant not found' };
    }
    return tenant;
  }
}
