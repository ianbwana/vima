import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CatalogService } from '../../catalog/services/catalog.service';
import { OrderService } from '../../catalog/services/order.service';
import {
  CreateCatalogDto,
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
  CreateModifierGroupDto,
  CreateModifierDto,
} from '../../catalog/dto/catalog.dto';

/**
 * FoodMerchantController
 *
 * Merchant-facing endpoints for food delivery.
 * Handles menu management, order acceptance, and status updates.
 * Requires merchant role.
 */
@Controller('food/merchant')
export class FoodMerchantController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly orderService: OrderService,
  ) {}

  // --- Menu Management ---

  /**
   * List menu categories for the authenticated merchant.
   * GET /food/merchant/catalogs
   */
  @Get('catalogs')
  async listCatalogs(@Req() req: any) {
    const { tenantId, sub: userId } = req.user;
    const merchant = await this.catalogService.getMerchantByUserId(tenantId, userId);
    if (!merchant) return { catalogs: [] };
    const catalogs = await this.catalogService.listCatalogs(tenantId, merchant.id);
    return { catalogs };
  }

  /**
   * Create a menu category.
   * POST /food/merchant/catalogs
   */
  @Post('catalogs')
  async createCatalog(@Req() req: any, @Body() dto: CreateCatalogDto) {
    const { tenantId } = req.user;
    const catalog = await this.catalogService.createCatalog(tenantId, dto);
    return { catalog };
  }

  /**
   * Add a menu item.
   * POST /food/merchant/items
   */
  @Post('items')
  async createItem(@Req() req: any, @Body() dto: CreateCatalogItemDto) {
    const { tenantId } = req.user;
    const item = await this.catalogService.createItem(tenantId, dto);
    return { item };
  }

  /**
   * Update a menu item.
   * PATCH /food/merchant/items/:id
   */
  @Patch('items/:id')
  async updateItem(@Req() req: any, @Param('id') itemId: string, @Body() dto: UpdateCatalogItemDto) {
    const { tenantId } = req.user;
    const item = await this.catalogService.updateItem(tenantId, itemId, dto);
    return { item };
  }

  /**
   * Toggle item availability.
   * POST /food/merchant/items/:id/availability
   */
  @Post('items/:id/availability')
  async toggleAvailability(@Req() req: any, @Param('id') itemId: string, @Body() body: { available: boolean }) {
    const { tenantId } = req.user;
    await this.catalogService.toggleItemAvailability(tenantId, itemId, body.available);
    return { success: true };
  }

  /**
   * Create a modifier group for an item.
   * POST /food/merchant/modifier-groups
   */
  @Post('modifier-groups')
  async createModifierGroup(@Req() req: any, @Body() dto: CreateModifierGroupDto) {
    const { tenantId } = req.user;
    const group = await this.catalogService.createModifierGroup(tenantId, dto);
    return { group };
  }

  /**
   * Create a modifier.
   * POST /food/merchant/modifiers
   */
  @Post('modifiers')
  async createModifier(@Req() req: any, @Body() dto: CreateModifierDto) {
    const { tenantId } = req.user;
    const modifier = await this.catalogService.createModifier(tenantId, dto);
    return { modifier };
  }

  // --- Order Management ---

  /**
   * List incoming orders for the merchant.
   * GET /food/merchant/orders
   */
  @Get('orders')
  async listOrders(@Req() req: any, @Query('status') status?: string) {
    const { tenantId, sub: userId } = req.user;
    const merchant = await this.catalogService.getMerchantByUserId(tenantId, userId);
    if (!merchant) return { orders: [] };
    const orders = await this.orderService.listMerchantOrders(tenantId, merchant.id, status);
    return { orders };
  }

  /**
   * Accept an order.
   * POST /food/merchant/orders/:id/accept
   */
  @Post('orders/:id/accept')
  async acceptOrder(@Req() req: any, @Param('id') orderId: string) {
    const { tenantId, sub: userId } = req.user;
    const order = await this.orderService.acceptOrder(tenantId, orderId, userId);
    return { order };
  }

  /**
   * Mark order as ready for pickup.
   * POST /food/merchant/orders/:id/ready
   */
  @Post('orders/:id/ready')
  async markReady(@Req() req: any, @Param('id') orderId: string) {
    const { tenantId } = req.user;
    const order = await this.orderService.markReady(tenantId, orderId);
    return { order };
  }
}
