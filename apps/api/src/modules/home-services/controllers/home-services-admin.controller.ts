import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import { TenantId } from '../../tenancy/decorators/tenant.decorator';
import * as schema from '../../../database/schemas/tenant.schema';
import { CreateServiceCategoryDto, CreatePriceCardDto } from '../dto/home-services.dto';

/**
 * HomeServicesAdminController
 *
 * Tenant admin endpoints for configuring home services:
 * - Service categories (hierarchical)
 * - Price cards per category
 * - Provider qualifications
 */
@Controller('home-services/admin')
export class HomeServicesAdminController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @Post('categories')
  async createCategory(@TenantId() tenantId: string, @Body() dto: CreateServiceCategoryDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const [category] = await db
      .insert(schema.serviceCategories)
      .values({
        name: dto.name,
        parentId: dto.parentId,
        iconUrl: dto.iconUrl,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();
    return { category };
  }

  @Get('categories')
  async listCategories(@TenantId() tenantId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const categories = await db.select().from(schema.serviceCategories).orderBy(schema.serviceCategories.sortOrder);
    return { categories };
  }

  @Delete('categories/:id')
  async deleteCategory(@TenantId() tenantId: string, @Param('id') id: string) {
    const db = this.tenantDb.getConnection(tenantId);
    await db.update(schema.serviceCategories).set({ active: false }).where(eq(schema.serviceCategories.id, id));
    return { success: true };
  }

  @Post('price-cards')
  async createPriceCard(@TenantId() tenantId: string, @Body() dto: CreatePriceCardDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const [card] = await db
      .insert(schema.servicePriceCards)
      .values({
        categoryId: dto.categoryId,
        name: dto.name,
        type: dto.type,
        price: dto.price ? String(dto.price) : null,
        minDurationHours: dto.minDurationHours ? String(dto.minDurationHours) : null,
        description: dto.description,
        currency: dto.currency ?? 'USD',
      })
      .returning();
    return { priceCard: card };
  }

  @Get('price-cards')
  async listPriceCards(@TenantId() tenantId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const cards = await db.select().from(schema.servicePriceCards);
    return { priceCards: cards };
  }

  @Delete('price-cards/:id')
  async deletePriceCard(@TenantId() tenantId: string, @Param('id') id: string) {
    const db = this.tenantDb.getConnection(tenantId);
    await db.delete(schema.servicePriceCards).where(eq(schema.servicePriceCards.id, id));
    return { success: true };
  }
}
