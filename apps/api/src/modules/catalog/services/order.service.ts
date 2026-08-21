import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and, desc } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import { PlaceOrderDto, OrderItemInput } from '../dto/order.dto';

/**
 * OrderService
 *
 * Shared order lifecycle management for food delivery and groceries.
 * Handles order creation, status transitions, and delivery coordination.
 *
 * Order lifecycle:
 * placed → accepted → preparing → ready → picked_up → delivered
 *                                                    → cancelled (any stage)
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Place a new order.
   * Validates items exist and are available, computes subtotal,
   * applies delivery fee, and creates the order.
   */
  async placeOrder(tenantId: string, customerId: string, dto: PlaceOrderDto) {
    const db = this.tenantDb.getConnection(tenantId);

    // Validate merchant exists
    const [merchant] = await db
      .select()
      .from(schema.merchants)
      .where(and(eq(schema.merchants.id, dto.merchantId), eq(schema.merchants.status, 'active')))
      .limit(1);

    if (!merchant) throw new NotFoundException('Merchant not found or inactive');

    // Validate and compute item totals
    let subtotal = 0;
    const orderItemValues: any[] = [];

    for (const item of dto.items) {
      const [catalogItem] = await db
        .select()
        .from(schema.catalogItems)
        .where(and(eq(schema.catalogItems.id, item.catalogItemId), eq(schema.catalogItems.available, true)))
        .limit(1);

      if (!catalogItem) {
        throw new BadRequestException(`Item ${item.catalogItemId} is not available`);
      }

      const unitPrice = parseFloat(catalogItem.price);
      let modifierTotal = 0;
      const modifierSnapshot: Array<{ name: string; price: string }> = [];

      // Resolve modifiers if any
      if (item.modifierIds && item.modifierIds.length > 0) {
        for (const modId of item.modifierIds) {
          const [mod] = await db
            .select()
            .from(schema.modifiers)
            .where(eq(schema.modifiers.id, modId))
            .limit(1);
          if (mod) {
            modifierTotal += parseFloat(mod.price);
            modifierSnapshot.push({ name: mod.name, price: mod.price });
          }
        }
      }

      const itemSubtotal = (unitPrice + modifierTotal) * item.quantity;
      subtotal += itemSubtotal;

      orderItemValues.push({
        catalogItemId: catalogItem.id,
        name: catalogItem.name,
        quantity: item.quantity,
        unitPrice: String(unitPrice + modifierTotal),
        modifiers: modifierSnapshot.length > 0 ? modifierSnapshot : null,
        subtotal: String(itemSubtotal),
        substitutionAllowed: item.substitutionAllowed ?? true,
      });
    }

    // Compute delivery fee
    const deliveryFee = dto.deliveryFee ?? 0;

    // Compute commission
    const commissionRate = parseFloat(merchant.commissionRate);
    const commissionAmount = Math.round(subtotal * commissionRate * 100) / 100;

    // Compute total
    const tip = dto.tip ?? 0;
    const total = subtotal + deliveryFee + tip;

    // Create order
    const [order] = await db
      .insert(schema.orders)
      .values({
        customerId,
        merchantId: dto.merchantId,
        status: 'placed',
        subtotal: String(subtotal),
        deliveryFee: String(deliveryFee),
        commissionAmount: String(commissionAmount),
        tip: String(tip),
        total: String(total),
        currency: dto.currency ?? 'USD',
        deliveryAddress: dto.deliveryAddress,
        deliveryLat: dto.deliveryLat ? String(dto.deliveryLat) : null,
        deliveryLng: dto.deliveryLng ? String(dto.deliveryLng) : null,
        notes: dto.notes,
      })
      .returning();

    // Create order items
    const itemsWithOrderId = orderItemValues.map((v) => ({ ...v, orderId: order.id }));
    await db.insert(schema.orderItems).values(itemsWithOrderId);

    // Emit order placed event
    this.eventEmitter.emit('order.placed', {
      tenantId,
      orderId: order.id,
      merchantId: dto.merchantId,
      customerId,
    });

    this.logger.log(`Order placed: ${order.id} total=${total} merchant=${dto.merchantId}`);
    return { ...order, items: orderItemValues };
  }

  /**
   * Merchant accepts the order (provides prep time estimate).
   */
  async acceptOrder(tenantId: string, orderId: string, merchantUserId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const [order] = await db
      .update(schema.orders)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();

    if (!order) throw new NotFoundException('Order not found');

    this.eventEmitter.emit('order.accepted', { tenantId, orderId, merchantId: order.merchantId });
    this.logger.log(`Order accepted: ${orderId}`);
    return order;
  }

  /**
   * Mark order as being prepared.
   */
  async markPreparing(tenantId: string, orderId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [order] = await db
      .update(schema.orders)
      .set({ status: 'preparing' })
      .where(eq(schema.orders.id, orderId))
      .returning();
    return order;
  }

  /**
   * Mark order as ready for pickup.
   */
  async markReady(tenantId: string, orderId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [order] = await db
      .update(schema.orders)
      .set({ status: 'ready', preparedAt: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();

    this.eventEmitter.emit('order.ready', { tenantId, orderId, merchantId: order?.merchantId });
    return order;
  }

  /**
   * Mark order as picked up by delivery provider.
   */
  async markPickedUp(tenantId: string, orderId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [order] = await db
      .update(schema.orders)
      .set({ status: 'picked_up', pickedUpAt: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();
    return order;
  }

  /**
   * Mark order as delivered.
   */
  async markDelivered(tenantId: string, orderId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [order] = await db
      .update(schema.orders)
      .set({ status: 'delivered', deliveredAt: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();

    this.eventEmitter.emit('order.delivered', { tenantId, orderId });
    this.logger.log(`Order delivered: ${orderId}`);
    return order;
  }

  /**
   * Cancel an order.
   */
  async cancelOrder(tenantId: string, orderId: string, reason?: string) {
    const db = this.tenantDb.getConnection(tenantId);
    const [order] = await db
      .update(schema.orders)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();

    this.eventEmitter.emit('order.cancelled', { tenantId, orderId });
    return order;
  }

  /**
   * Get order with items.
   */
  async getOrder(tenantId: string, orderId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);

    if (!order) throw new NotFoundException('Order not found');

    const items = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId));

    return { ...order, items };
  }

  /**
   * List orders for a merchant.
   */
  async listMerchantOrders(tenantId: string, merchantId: string, status?: string) {
    const db = this.tenantDb.getConnection(tenantId);

    let results = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.merchantId, merchantId))
      .orderBy(desc(schema.orders.placedAt));

    if (status) {
      results = results.filter((o) => o.status === status);
    }

    return results;
  }

  /**
   * List orders for a customer.
   */
  async listCustomerOrders(tenantId: string, customerId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.customerId, customerId))
      .orderBy(desc(schema.orders.placedAt));
  }
}
