/**
 * Subscription tier definitions.
 * Starter: Branded PWA on subdomain, shared provider app
 * Growth: Branded PWA, custom domain, shared provider app
 * Scale: Branded PWA + dedicated native apps, dedicated provider app, app factory
 */
export enum PlanTier {
  STARTER = 'starter',
  GROWTH = 'growth',
  SCALE = 'scale',
}

export interface TierCapabilities {
  customDomain: boolean;
  dedicatedCustomerApp: boolean;
  dedicatedProviderApp: boolean;
  appFactory: boolean;
  maxDrivers: number | null; // null = unlimited
  maxMerchants: number | null;
}

export const TIER_CAPABILITIES: Record<PlanTier, TierCapabilities> = {
  [PlanTier.STARTER]: {
    customDomain: false,
    dedicatedCustomerApp: false,
    dedicatedProviderApp: false,
    appFactory: false,
    maxDrivers: 50,
    maxMerchants: 10,
  },
  [PlanTier.GROWTH]: {
    customDomain: true,
    dedicatedCustomerApp: false,
    dedicatedProviderApp: false,
    appFactory: false,
    maxDrivers: 500,
    maxMerchants: 100,
  },
  [PlanTier.SCALE]: {
    customDomain: true,
    dedicatedCustomerApp: true,
    dedicatedProviderApp: true,
    appFactory: true,
    maxDrivers: null,
    maxMerchants: null,
  },
};
