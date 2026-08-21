/**
 * Platform Pricing Configuration
 *
 * Every feature costs. The total monthly subscription is:
 *   base platform fee (by tier) + sum of enabled module fees
 *
 * Module fees are per-module per-month. A tenant running only ride-hailing
 * pays less than one running rides + food + groceries.
 */

export interface ModulePricing {
  key: string;
  name: string;
  description: string;
  monthlyFee: number; // USD
  icon: string;
  includes: string[]; // what's included in this module
}

export interface TierPricing {
  tier: 'starter' | 'growth' | 'scale';
  name: string;
  baseFee: number; // USD/month (platform fee, no modules)
  description: string;
  includes: string[];
  maxModules?: number; // starter is limited
}

/**
 * Base platform fee per tier (monthly, USD).
 * This is the floor cost before any modules.
 */
export const TIER_PRICING: TierPricing[] = [
  {
    tier: 'starter',
    name: 'Starter',
    baseFee: 49,
    description: 'Branded PWA on subdomain',
    includes: ['Branded PWA', 'Subdomain hosting', 'Basic dashboard', 'Up to 3 modules'],
    maxModules: 3,
  },
  {
    tier: 'growth',
    name: 'Growth',
    baseFee: 149,
    description: 'Custom domain, all modules available',
    includes: ['Custom domain', 'All modules available', 'Priority support', 'Advanced analytics'],
  },
  {
    tier: 'scale',
    name: 'Scale',
    baseFee: 399,
    description: 'Native apps, white-label, dedicated support',
    includes: ['Native iOS & Android apps', 'White-label branding', 'App Factory', 'Provider app', 'Dedicated account manager'],
  },
];

/**
 * Per-module monthly pricing (USD).
 * Each enabled module adds this to the tenant's monthly bill.
 */
export const MODULE_PRICING: ModulePricing[] = [
  {
    key: 'rides',
    name: 'Ride Hailing',
    description: 'On-demand passenger transport with live tracking',
    monthlyFee: 79,
    icon: '🚗',
    includes: ['Fare calculation', 'Driver matching', 'Live GPS tracking', 'Surge pricing', 'Trip ratings'],
  },
  {
    key: 'food',
    name: 'Food Delivery',
    description: 'Restaurant ordering with delivery dispatch',
    monthlyFee: 99,
    icon: '🍔',
    includes: ['Menu management', 'Order flow', 'Delivery dispatch', 'Merchant portal', 'Commission management'],
  },
  {
    key: 'groceries',
    name: 'Groceries',
    description: 'Grocery store ordering with substitution flow',
    monthlyFee: 99,
    icon: '🛒',
    includes: ['Catalog (CSV import)', 'Picking workflow', 'Substitutions', 'Weight-based items', 'Delivery dispatch'],
  },
  {
    key: 'courier',
    name: 'Courier & Parcels',
    description: 'Package delivery with proof of delivery & COD',
    monthlyFee: 69,
    icon: '📦',
    includes: ['Package categories', 'Fee estimation', 'Proof of delivery', 'COD collection', 'Live tracking'],
  },
  {
    key: 'home_services',
    name: 'Home Services',
    description: 'Scheduled bookings with quote flows',
    monthlyFee: 89,
    icon: '🔧',
    includes: ['Service categories', 'Booking calendar', 'Quote system', 'Provider matching', 'Completion photos'],
  },
];

/**
 * Calculate total monthly cost for a tenant.
 */
export function calculateMonthlyCost(tier: string, enabledModules: string[]): {
  baseFee: number;
  moduleFees: Array<{ key: string; name: string; fee: number }>;
  total: number;
} {
  const tierConfig = TIER_PRICING.find((t) => t.tier === tier);
  const baseFee = tierConfig?.baseFee || 49;

  const moduleFees = enabledModules
    .map((key) => {
      const mod = MODULE_PRICING.find((m) => m.key === key);
      return mod ? { key: mod.key, name: mod.name, fee: mod.monthlyFee } : null;
    })
    .filter(Boolean) as Array<{ key: string; name: string; fee: number }>;

  const total = baseFee + moduleFees.reduce((sum, m) => sum + m.fee, 0);

  return { baseFee, moduleFees, total };
}

/**
 * Validate module count against tier limits.
 */
export function validateModuleLimit(tier: string, moduleCount: number): { valid: boolean; maxModules?: number } {
  const tierConfig = TIER_PRICING.find((t) => t.tier === tier);
  if (tierConfig?.maxModules && moduleCount > tierConfig.maxModules) {
    return { valid: false, maxModules: tierConfig.maxModules };
  }
  return { valid: true };
}
