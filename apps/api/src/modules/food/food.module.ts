import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FoodController } from './controllers/food.controller';
import { FoodMerchantController } from './controllers/food-merchant.controller';

/**
 * FoodModule
 *
 * Food delivery vertical. Composes CatalogModule (shared catalog infrastructure)
 * with food-specific customer and merchant flows.
 *
 * Gated behind 'food' module entitlement.
 */
@Module({
  imports: [CatalogModule],
  controllers: [FoodController, FoodMerchantController],
  providers: [],
})
export class FoodModule {}
