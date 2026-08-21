import { calculateMonthlyCost, validateModuleLimit, MODULE_PRICING, TIER_PRICING } from './pricing.config';

describe('Pricing Configuration', () => {
  describe('calculateMonthlyCost()', () => {
    it('should return base fee only when no modules enabled', () => {
      const result = calculateMonthlyCost('starter', []);
      expect(result.baseFee).toBe(49);
      expect(result.moduleFees).toHaveLength(0);
      expect(result.total).toBe(49);
    });

    it('should add module fees to base fee', () => {
      const result = calculateMonthlyCost('starter', ['rides']);
      expect(result.baseFee).toBe(49);
      expect(result.moduleFees).toHaveLength(1);
      expect(result.moduleFees[0].fee).toBe(79); // rides = $79
      expect(result.total).toBe(49 + 79); // $128
    });

    it('should sum multiple module fees', () => {
      const result = calculateMonthlyCost('growth', ['rides', 'food', 'courier']);
      expect(result.baseFee).toBe(149);
      expect(result.moduleFees).toHaveLength(3);
      expect(result.total).toBe(149 + 79 + 99 + 69); // $396
    });

    it('should use correct base fee per tier', () => {
      expect(calculateMonthlyCost('starter', []).baseFee).toBe(49);
      expect(calculateMonthlyCost('growth', []).baseFee).toBe(149);
      expect(calculateMonthlyCost('scale', []).baseFee).toBe(399);
    });

    it('should handle all modules enabled', () => {
      const allModules = MODULE_PRICING.map((m) => m.key);
      const result = calculateMonthlyCost('scale', allModules);
      const totalModuleFees = MODULE_PRICING.reduce((sum, m) => sum + m.monthlyFee, 0);
      expect(result.total).toBe(399 + totalModuleFees);
      // 399 + 79 + 99 + 99 + 69 + 89 = $834
      expect(result.total).toBe(834);
    });

    it('should ignore unknown module keys', () => {
      const result = calculateMonthlyCost('starter', ['rides', 'nonexistent']);
      expect(result.moduleFees).toHaveLength(1); // only rides
      expect(result.total).toBe(49 + 79);
    });
  });

  describe('validateModuleLimit()', () => {
    it('should allow up to 3 modules on starter', () => {
      expect(validateModuleLimit('starter', 1).valid).toBe(true);
      expect(validateModuleLimit('starter', 3).valid).toBe(true);
      expect(validateModuleLimit('starter', 4).valid).toBe(false);
      expect(validateModuleLimit('starter', 4).maxModules).toBe(3);
    });

    it('should not limit growth tier', () => {
      expect(validateModuleLimit('growth', 5).valid).toBe(true);
      expect(validateModuleLimit('growth', 10).valid).toBe(true);
    });

    it('should not limit scale tier', () => {
      expect(validateModuleLimit('scale', 5).valid).toBe(true);
    });
  });

  describe('pricing constants', () => {
    it('should have 3 tiers defined', () => {
      expect(TIER_PRICING).toHaveLength(3);
    });

    it('should have 5 modules defined', () => {
      expect(MODULE_PRICING).toHaveLength(5);
    });

    it('should have all module fees > 0', () => {
      for (const mod of MODULE_PRICING) {
        expect(mod.monthlyFee).toBeGreaterThan(0);
      }
    });

    it('should have tiers ordered by price ascending', () => {
      expect(TIER_PRICING[0].baseFee).toBeLessThan(TIER_PRICING[1].baseFee);
      expect(TIER_PRICING[1].baseFee).toBeLessThan(TIER_PRICING[2].baseFee);
    });
  });
});
