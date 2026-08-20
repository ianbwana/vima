/**
 * All available platform modules that tenants can subscribe to.
 */
export enum PlatformModule {
  RIDES = 'rides',
  FOOD = 'food',
  GROCERIES = 'groceries',
  COURIER = 'courier',
  HOME_SERVICES = 'home_services',
}

export const ALL_MODULES = Object.values(PlatformModule);
