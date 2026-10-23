import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { CatalogService } from '../../catalog/services/catalog.service';
import { OrderService } from '../../catalog/services/order.service';
import { GroceryOrderService } from '../services/grocery-order.service';
import { PlaceOrderDto } from '../../catalog/dto/order.dto';
import { TenantId } from '../../tenancy/decorators/tenant.decorator';

/**
 * GroceriesController
 *
 * Customer and picker endpoints for the groceries module.
 * Extends food delivery patterns with substitution and weight-based flows.
 * Gated behind @RequireModule('groceries').
 */
@Controller('groceries')
export class GroceriesController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly orderService: OrderService,
    private readonly groceryOrderService: GroceryOrderService,
  ) {}

  /**
   * Browse grocery stores.
   * GET /groceries/stores
   */
  @Get('stores')
  async listStores(@TenantId() tenantId: string, @Query('zone') zoneId?: string) {
    const merchants = await this.catalogService.listMerchants(tenantId, 'grocery_store', zoneId);
    return { stores: merchants };
  }

  /**
   * Get store catalog.
   * GET /groceries/stores/:id/catalog
   */
  @Get('stores/:id/catalog')
  async getCatalog(@TenantId() tenantId: string, @Param('id') merchantId: string) {
    const menu = await this.catalogService.getFullMenu(tenantId, merchantId);
    return { catalog: menu };
  }

  /**
   * Place a grocery order.
   * POST /groceries/orders
   */
  @Post('orders')
  async placeOrder(@TenantId() tenantId: string, @Req() req: any, @Body() dto: PlaceOrderDto) {
    const userId = req.user?.sub;
    const order = await this.orderService.placeOrder(tenantId, userId, dto);
    return { order };
  }

  /**
   * Get order with substitution info.
   * GET /groceries/orders/:id
   */
  @Get('orders/:id')
  async getOrder(@TenantId() tenantId: string, @Param('id') orderId: string) {
    const order = await this.orderService.getOrder(tenantId, orderId);
    const substitutions = await this.groceryOrderService.getOrderSubstitutions(tenantId, orderId);
    return { order, substitutions };
  }

  /**
   * Respond to a substitution proposal.
   * POST /groceries/substitutions/:id/respond
   */
  @Post('substitutions/:id/respond')
  async respondToSubstitution(
    @TenantId() tenantId: string,
    @Param('id') substitutionId: string,
    @Body() body: { approved: boolean },
  ) {
    const result = await this.groceryOrderService.respondToSubstitution(
      tenantId,
      substitutionId,
      body.approved,
    );
    return { substitution: result };
  }

  /**
   * List customer's grocery orders.
   * GET /groceries/orders
   */
  @Get('orders')
  async listOrders(@TenantId() tenantId: string, @Req() req: any) {
    const userId = req.user?.sub;
    const orders = await this.orderService.listCustomerOrders(tenantId, userId);
    return { orders };
  }
}
