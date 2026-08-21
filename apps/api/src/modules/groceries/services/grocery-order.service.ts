import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * GroceryOrderService
 *
 * Grocery-specific order flows that extend the base OrderService:
 * - Item substitutions during picking
 * - Weight-based item price adjustments
 * - Picking workflow (mark found/substitute/unavailable)
 */
@Injectable()
export class GroceryOrderService {
  private readonly logger = new Logger(GroceryOrderService.name);

  /** Timeout for customer to respond to substitution (ms) */
  private static readonly SUBSTITUTION_TIMEOUT_MS = 180_000; // 3 minutes

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Picker proposes a substitution for an unavailable item.
   * Customer is notified and has 3 minutes to approve/reject.
   */
  async proposeSubstitution(
    tenantId: string,
    orderId: string,
    originalItemId: string,
    proposedItemId: string,
    pickerId: string,
  ) {
    const db = this.tenantDb.getConnection(tenantId);

    const [substitution] = await db
      .insert(schema.orderSubstitutions)
      .values({
        orderId,
        originalItemId,
        proposedItemId,
        proposedBy: pickerId,
        status: 'pending',
      })
      .returning();

    // Emit event for push notification to customer
    this.eventEmitter.emit('order.substitution_proposed', {
      tenantId,
      orderId,
      substitutionId: substitution.id,
      originalItemId,
      proposedItemId,
    });

    // Schedule timeout
    setTimeout(async () => {
      await this.handleSubstitutionTimeout(tenantId, substitution.id);
    }, GroceryOrderService.SUBSTITUTION_TIMEOUT_MS);

    this.logger.log(`Substitution proposed: order=${orderId} original=${originalItemId} proposed=${proposedItemId}`);
    return substitution;
  }

  /**
   * Customer responds to a substitution proposal.
   */
  async respondToSubstitution(
    tenantId: string,
    substitutionId: string,
    approved: boolean,
  ) {
    const db = this.tenantDb.getConnection(tenantId);

    const status = approved ? 'approved' : 'rejected';
    const [updated] = await db
      .update(schema.orderSubstitutions)
      .set({ status, respondedAt: new Date() })
      .where(
        and(
          eq(schema.orderSubstitutions.id, substitutionId),
          eq(schema.orderSubstitutions.status, 'pending'),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundException('Substitution not found or already resolved');

    this.logger.log(`Substitution ${status}: id=${substitutionId}`);
    return updated;
  }

  /**
   * Update the actual weight of a weight-based item (measured during picking).
   * Adjusts the order item subtotal accordingly.
   */
  async updateItemWeight(
    tenantId: string,
    orderItemId: string,
    actualWeight: number,
  ) {
    const db = this.tenantDb.getConnection(tenantId);

    const [orderItem] = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.id, orderItemId))
      .limit(1);

    if (!orderItem) throw new NotFoundException('Order item not found');

    // Recalculate subtotal based on actual weight
    const unitPrice = parseFloat(orderItem.unitPrice);
    const newSubtotal = Math.round(unitPrice * actualWeight * 100) / 100;

    await db
      .update(schema.orderItems)
      .set({
        actualWeight: String(actualWeight),
        subtotal: String(newSubtotal),
      })
      .where(eq(schema.orderItems.id, orderItemId));

    this.logger.log(`Weight updated: item=${orderItemId} weight=${actualWeight} subtotal=${newSubtotal}`);
    return { actualWeight, subtotal: newSubtotal };
  }

  /**
   * Get all substitutions for an order.
   */
  async getOrderSubstitutions(tenantId: string, orderId: string) {
    const db = this.tenantDb.getConnection(tenantId);
    return db
      .select()
      .from(schema.orderSubstitutions)
      .where(eq(schema.orderSubstitutions.orderId, orderId));
  }

  /**
   * Handle substitution timeout — auto-remove the item if no response.
   */
  private async handleSubstitutionTimeout(tenantId: string, substitutionId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    // Only update if still pending
    await db
      .update(schema.orderSubstitutions)
      .set({ status: 'timed_out', respondedAt: new Date() })
      .where(
        and(
          eq(schema.orderSubstitutions.id, substitutionId),
          eq(schema.orderSubstitutions.status, 'pending'),
        ),
      );
  }
}
