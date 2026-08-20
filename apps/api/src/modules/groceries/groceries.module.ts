import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { GroceriesController } from './controllers/groceries.controller';
import { GroceryMerchantController } from './controllers/grocery-merchant.controller';
import { GroceryOrderService } from './services/grocery-order.service';

/**
 * GroceriesModule
 *
 * Groceries vertical. Extends CatalogModule with:
 * - CSV bulk import for large catalogs
 * - Item substitution workflow (picker → customer approval)
 * - Weight-based item pricing adjustments
 * - Picking workflow status
 *
 * Gated behind 'groceries' module entitlement.
 */
@Module({
  imports: [CatalogModule],
  controllers: [GroceriesController, GroceryMerchantController],
  providers: [GroceryOrderService],
})
export class GroceriesModule {}
