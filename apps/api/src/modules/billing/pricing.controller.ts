import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { TIER_PRICING, MODULE_PRICING, calculateMonthlyCost, validateModuleLimit } from './pricing.config';

/**
 * PricingController
 *
 * Public pricing information and cost calculation endpoints.
 * Used by the signup wizard and tenant portal to display costs.
 */
@Controller('pricing')
export class PricingController {
  /**
   * Get all pricing information (tiers + modules).
   * Public endpoint — no auth required.
   */
  @Get()
  getPricing() {
    return {
      tiers: TIER_PRICING,
      modules: MODULE_PRICING,
    };
  }

  /**
   * Calculate monthly cost for a specific configuration.
   * POST /pricing/calculate
   */
  @Post('calculate')
  calculateCost(@Body() body: { tier: string; enabledModules: string[] }) {
    const cost = calculateMonthlyCost(body.tier, body.enabledModules);
    const validation = validateModuleLimit(body.tier, body.enabledModules.length);

    return {
      ...cost,
      validation,
      formattedTotal: `$${cost.total}/mo`,
    };
  }

  /**
   * Get module pricing only.
   * GET /pricing/modules
   */
  @Get('modules')
  getModulePricing() {
    return { modules: MODULE_PRICING };
  }

  /**
   * Get tier pricing only.
   * GET /pricing/tiers
   */
  @Get('tiers')
  getTierPricing() {
    return { tiers: TIER_PRICING };
  }
}
