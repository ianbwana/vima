import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { CatalogService } from '../../catalog/services/catalog.service';
import { OrderService } from '../../catalog/services/order.service';
import { PlaceOrderDto } from '../../catalog/dto/order.dto';

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
  async listRestaurants(@Req() req: any, @Query('zone') zoneId?: string) {
    const { tenantId } = req.user;
    const merchants = await this.catalogService.listMerchants(tenantId, 'restaurant', zoneId);
    return { restaurants: merchants };
  }

  /**
   * Get restaurant menu with all categories, items, and modifiers.
   * GET /food/restaurants/:id/menu
   */
  @Get('restaurants/:id/menu')
  async getMenu(@Req() req: any, @Param('id') merchantId: string) {
    const { tenantId } = req.user;
    const menu = await this.catalogService.getFullMenu(tenantId, merchantId);
    return { menu };
  }

  /**
   * Place a food order.
   * POST /food/orders
   */
  @Post('orders')
  async placeOrder(@Req() req: any, @Body() dto: PlaceOrderDto) {
    const { tenantId, sub: userId } = req.user;
    const order = await this.orderService.placeOrder(tenantId, userId, dto);
    return { order };
  }

  /**
   * Get order details and tracking.
   * GET /food/orders/:id
   */
  @Get('orders/:id')
  async getOrder(@Req() req: any, @Param('id') orderId: string) {
    const { tenantId } = req.user;
    const order = await this.orderService.getOrder(tenantId, orderId);
    return { order };
  }

  /**
   * List customer's orders.
   * GET /food/orders
   */
  @Get('orders')
  async listOrders(@Req() req: any) {
    const { tenantId, sub: userId } = req.user;
    const orders = await this.orderService.listCustomerOrders(tenantId, userId);
    return { orders };
  }
}
