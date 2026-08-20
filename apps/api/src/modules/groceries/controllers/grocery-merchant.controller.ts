import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { CatalogService } from '../../catalog/services/catalog.service';
import { OrderService } from '../../catalog/services/order.service';
import { GroceryOrderService } from '../services/grocery-order.service';
import { CreateCatalogItemDto } from '../../catalog/dto/catalog.dto';

/**
 * GroceryMerchantController
 *
 * Merchant (store) endpoints for the groceries module.
 * Handles catalog management, CSV import, picking workflow, and substitutions.
 */
@Controller('groceries/merchant')
export class GroceryMerchantController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly orderService: OrderService,
    private readonly groceryOrderService: GroceryOrderService,
  ) {}

  /**
   * Bulk import catalog items from CSV-like array.
   * POST /groceries/merchant/import
   */
  @Post('import')
  async bulkImport(
    @Req() req: any,
    @Body() body: {
      catalogId: string;
      items: Array<{
        name: string;
        price: number;
        sku?: string;
        unit?: string;
        weightBased?: boolean;
        imageUrl?: string;
      }>;
    },
  ) {
    const { tenantId } = req.user;
    const count = await this.catalogService.bulkImportItems(tenantId, body.catalogId, body.items);
    return { success: true, importedCount: count };
  }

  /**
   * List orders for the store (picking queue).
   * GET /groceries/merchant/orders
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
   * Accept an order (start picking).
   * POST /groceries/merchant/orders/:id/accept
   */
  @Post('orders/:id/accept')
  async acceptOrder(@Req() req: any, @Param('id') orderId: string) {
    const { tenantId, sub: userId } = req.user;
    const order = await this.orderService.acceptOrder(tenantId, orderId, userId);
    return { order };
  }

  /**
   * Propose a substitution for an item.
   * POST /groceries/merchant/orders/:id/substitute
   */
  @Post('orders/:id/substitute')
  async proposeSubstitution(
    @Req() req: any,
    @Param('id') orderId: string,
    @Body() body: { originalItemId: string; proposedItemId: string },
  ) {
    const { tenantId, sub: userId } = req.user;
    const substitution = await this.groceryOrderService.proposeSubstitution(
      tenantId,
      orderId,
      body.originalItemId,
      body.proposedItemId,
      userId,
    );
    return { substitution };
  }

  /**
   * Update actual weight for a weight-based item.
   * POST /groceries/merchant/order-items/:id/weight
   */
  @Post('order-items/:id/weight')
  async updateWeight(
    @Req() req: any,
    @Param('id') orderItemId: string,
    @Body() body: { actualWeight: number },
  ) {
    const { tenantId } = req.user;
    const result = await this.groceryOrderService.updateItemWeight(
      tenantId,
      orderItemId,
      body.actualWeight,
    );
    return result;
  }

  /**
   * Mark order as packed and ready for pickup.
   * POST /groceries/merchant/orders/:id/ready
   */
  @Post('orders/:id/ready')
  async markReady(@Req() req: any, @Param('id') orderId: string) {
    const { tenantId } = req.user;
    const order = await this.orderService.markReady(tenantId, orderId);
    return { order };
  }
}
