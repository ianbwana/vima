import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import {
  CreateMerchantDto,
  UpdateMerchantDto,
  CreateCatalogDto,
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
  CreateModifierGroupDto,
  CreateModifierDto,
} from '../dto/catalog.dto';

/**
 * CatalogService
 *
 * Shared catalog management for food delivery and groceries.
 * Handles merchants, catalogs (categories), items, and modifiers.
 * Used by both FoodModule and GroceriesModule.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly tenantDb: TenantDbService) {}

  // --- Merchants ---

  async createMerchant(tenantId: string, dto: CreateMerchantDto, userId?: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [merchant] = await db
      .insert(schema.merchants)
      .values({
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        coverUrl: dto.coverUrl,
        address: dto.address,
        locationLat: dto.locationLat ? String(dto.locationLat) : null,
        locationLng: dto.locationLng ? String(dto.locationLng) : null,
        zoneId: dto.zoneId,
        category: dto.category,
        commissionRate: dto.commissionRate ? String(dto.commissionRate) : '0.15',
        status: 'active',
        userId: userId || null,
      })
      .returning();
    return merchant;
  }

  async updateMerchant(tenantId: string, merchantId: string, dto: UpdateMerchantDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const updateData: Record<string, any> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.logoUrl !== undefined) updateData.logoUrl = dto.logoUrl;
    if (dto.coverUrl !== undefined) updateData.coverUrl = dto.coverUrl;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.locationLat !== undefined) updateData.locationLat = String(dto.locationLat);
    if (dto.locationLng !== undefined) updateData.locationLng = String(dto.locationLng);
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.commissionRate !== undefined) updateData.commissionRate = String(dto.commissionRate);

    const [updated] = await db
      .update(schema.merchants)
      .set(updateData)
      .where(eq(schema.merchants.id, merchantId))
      .returning();

    if (!updated) throw new NotFoundException('Merchant not found');
    return updated;
  }

  async getMerchant(tenantId: string, merchantId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [merchant] = await db
      .select()
      .from(schema.merchants)
      .where(eq(schema.merchants.id, merchantId))
      .limit(1);
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }

  async listMerchants(tenantId: string, category?: string, zoneId?: string) {
    const db = this.tenantDb.getConnection(tenantId);
    let query = db.select().from(schema.merchants).where(eq(schema.merchants.status, 'active'));
    const results = await query;

    // Filter in-memory for simplicity (drizzle dynamic where is verbose)
    let filtered = results;
    if (category) filtered = filtered.filter((m) => m.category === category);
    if (zoneId) filtered = filtered.filter((m) => m.zoneId === zoneId);

    return filtered;
  }

  async getMerchantByUserId(tenantId: string, userId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [merchant] = await db
      .select()
      .from(schema.merchants)
      .where(eq(schema.merchants.userId, userId))
      .limit(1);
    return merchant || null;
  }

  // --- Catalogs (Categories) ---

  async createCatalog(tenantId: string, dto: CreateCatalogDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const [catalog] = await db
      .insert(schema.catalogs)
      .values({
        merchantId: dto.merchantId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();
    return catalog;
  }

  async listCatalogs(tenantId: string, merchantId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db
      .select()
      .from(schema.catalogs)
      .where(eq(schema.catalogs.merchantId, merchantId))
      .orderBy(schema.catalogs.sortOrder);
  }

  // --- Catalog Items ---

  async createItem(tenantId: string, dto: CreateCatalogItemDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const [item] = await db
      .insert(schema.catalogItems)
      .values({
        catalogId: dto.catalogId,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        price: String(dto.price),
        currency: dto.currency ?? 'USD',
        sortOrder: dto.sortOrder ?? 0,
        unit: dto.unit ?? 'piece',
        weightBased: dto.weightBased ?? false,
        avgWeight: dto.avgWeight ? String(dto.avgWeight) : null,
        sku: dto.sku,
      })
      .returning();
    return item;
  }

  async updateItem(tenantId: string, itemId: string, dto: UpdateCatalogItemDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const updateData: Record<string, any> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
    if (dto.price !== undefined) updateData.price = String(dto.price);
    if (dto.available !== undefined) updateData.available = dto.available;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const [updated] = await db
      .update(schema.catalogItems)
      .set(updateData)
      .where(eq(schema.catalogItems.id, itemId))
      .returning();
    return updated;
  }

  async listItems(tenantId: string, catalogId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db
      .select()
      .from(schema.catalogItems)
      .where(and(eq(schema.catalogItems.catalogId, catalogId), eq(schema.catalogItems.available, true)))
      .orderBy(schema.catalogItems.sortOrder);
  }

  async toggleItemAvailability(tenantId: string, itemId: string, available: boolean) {
    const db = this.tenantDb.getConnection(tenantId);
    await db
      .update(schema.catalogItems)
      .set({ available })
      .where(eq(schema.catalogItems.id, itemId));
  }

  /**
   * Bulk import items from CSV data (used by grocery stores).
   */
  async bulkImportItems(
    tenantId: string,
    catalogId: string,
    items: Array<{
      name: string;
      price: number;
      sku?: string;
      category?: string;
      unit?: string;
      weightBased?: boolean;
      imageUrl?: string;
    }>,
  ): Promise<number> {
    const db = this.tenantDb.getConnection(tenantId);

    const values = items.map((item, idx) => ({
      catalogId,
      name: item.name,
      price: String(item.price),
      sku: item.sku,
      unit: (item.unit as any) ?? 'piece',
      weightBased: item.weightBased ?? false,
      imageUrl: item.imageUrl,
      sortOrder: idx,
    }));

    const inserted = await db.insert(schema.catalogItems).values(values).returning();
    this.logger.log(`Bulk imported ${inserted.length} items into catalog ${catalogId}`);
    return inserted.length;
  }

  // --- Modifiers ---

  async createModifierGroup(tenantId: string, dto: CreateModifierGroupDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const [group] = await db
      .insert(schema.modifierGroups)
      .values({
        catalogItemId: dto.catalogItemId,
        name: dto.name,
        required: dto.required ?? false,
        minSelect: dto.minSelect ?? 0,
        maxSelect: dto.maxSelect ?? 1,
      })
      .returning();
    return group;
  }

  async createModifier(tenantId: string, dto: CreateModifierDto) {
    const db = this.tenantDb.getConnection(tenantId);
    const [modifier] = await db
      .insert(schema.modifiers)
      .values({
        modifierGroupId: dto.modifierGroupId,
        name: dto.name,
        price: dto.price ? String(dto.price) : '0.00',
      })
      .returning();
    return modifier;
  }

  async getItemModifiers(tenantId: string, itemId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const groups = await db
      .select()
      .from(schema.modifierGroups)
      .where(eq(schema.modifierGroups.catalogItemId, itemId));

    const result = [];
    for (const group of groups) {
      const mods = await db
        .select()
        .from(schema.modifiers)
        .where(and(eq(schema.modifiers.modifierGroupId, group.id), eq(schema.modifiers.available, true)));
      result.push({ ...group, modifiers: mods });
    }

    return result;
  }

  /**
   * Get full merchant menu (catalogs + items + modifiers).
   */
  async getFullMenu(tenantId: string, merchantId: string) {
    const catalogs = await this.listCatalogs(tenantId, merchantId);
    const menu = [];

    for (const catalog of catalogs) {
      const items = await this.listItems(tenantId, catalog.id);
      const itemsWithModifiers = await Promise.all(
        items.map(async (item) => {
          const modifiers = await this.getItemModifiers(tenantId, item.id);
          return { ...item, modifierGroups: modifiers };
        }),
      );
      menu.push({ ...catalog, items: itemsWithModifiers });
    }

    return menu;
  }
}
