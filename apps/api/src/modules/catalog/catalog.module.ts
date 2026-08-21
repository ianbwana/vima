import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { CatalogService } from './services/catalog.service';
import { OrderService } from './services/order.service';
import { OrderSettlementService } from './services/order-settlement.service';

/**
 * CatalogModule
 *
 * Shared catalog infrastructure for food delivery and groceries.
 * Provides merchant management, menu/catalog CRUD, order lifecycle,
 * and order settlement via the double-entry ledger.
 *
 * Consumed by FoodModule and GroceriesModule.
 */
@Module({
  imports: [PaymentsModule],
  providers: [CatalogService, OrderService, OrderSettlementService],
  exports: [CatalogService, OrderService, OrderSettlementService],
})
export class CatalogModule {}
