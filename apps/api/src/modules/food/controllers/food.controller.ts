import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { CatalogService } from '../../catalog/services/catalog.service';
import { OrderService } from '../../catalog/services/order.service';
import { PlaceOrderDto } from '../../catalog/dto/order.dto';
import { TenantId } from '../../tenancy/decorators/tenant.decorator';

/**
 * FoodController
 *
 * Customer-facing endpoints for the food delivery module.
 * Handles browsing restaurants, viewing menus, placing orders, and tracking.
 * Gated behind @RequireModule('food') at module level.
 */
@Controller('food')
export class FoodController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly orderService: OrderService,
  ) {}

  /**
   * Browse restaurants.
   * GET /food/restaurants
   */
  @Get('restaurants')
  async listRestaurants(@TenantId() tenantId: string, @Query('zone') zoneId?: string) {
    const merchants = await this.catalogService.listMerchants(tenantId, 'restaurant', zoneId);
    return { restaurants: merchants };
  }

  /**
   * Get restaurant menu with all categories, items, and modifiers.
   * GET /food/restaurants/:id/menu
   */
  @Get('restaurants/:id/menu')
  async getMenu(@TenantId() tenantId: string, @Param('id') merchantId: string) {
    const menu = await this.catalogService.getFullMenu(tenantId, merchantId);
    return { menu };
  }

  /**
   * Place a food order.
   * POST /food/orders
   */
  @Post('orders')
  async placeOrder(@TenantId() tenantId: string, @Req() req: any, @Body() dto: PlaceOrderDto) {
    const userId = req.user?.sub;
    const order = await this.orderService.placeOrder(tenantId, userId, dto);
    return { order };
  }

  /**
   * Get order details and tracking.
   * GET /food/orders/:id
   */
  @Get('orders/:id')
  async getOrder(@TenantId() tenantId: string, @Param('id') orderId: string) {
    const order = await this.orderService.getOrder(tenantId, orderId);
    return { order };
  }

  /**
   * List customer's orders.
   * GET /food/orders
   */
  @Get('orders')
  async listOrders(@TenantId() tenantId: string, @Req() req: any) {
    const userId = req.user?.sub;
    const orders = await this.orderService.listCustomerOrders(tenantId, userId);
    return { orders };
  }
}
