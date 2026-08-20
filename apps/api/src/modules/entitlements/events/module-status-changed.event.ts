/**
 * Events emitted when tenant modules are enabled or disabled.
 *
 * These events are consumed by the BillingModule to add/remove
 * subscription items in Stripe when module entitlements change.
 *
 * Requirements: 7.2, 10.4
 */

export class ModuleEnabledEvent {
  static readonly event = 'module.enabled';

  constructor(
    public readonly tenantId: string,
    public readonly module: string,
  ) {}
}

export class ModuleDisabledEvent {
  static readonly event = 'module.disabled';

  constructor(
    public readonly tenantId: string,
    public readonly module: string,
  ) {}
}
