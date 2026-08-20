import { CourierService } from './courier.service';

describe('CourierService', () => {
  describe('estimateFee()', () => {
    let service: CourierService;

    beforeEach(() => {
      // Create service with null deps (only estimateFee is pure)
      service = new CourierService(null as any, null as any, null as any, null as any);
    });

    it('should estimate document fee correctly', () => {
      // 5km: base $3 + 5 * $0.80 = $7.00
      const result = service.estimateFee('document', 0, 0, 0.045, 0); // ~5km
      expect(result.fee).toBeGreaterThan(6);
      expect(result.fee).toBeLessThan(8);
      expect(result.currency).toBe('USD');
    });

    it('should estimate small package fee correctly', () => {
      // 10km: base $5 + 10 * $1.00 = $15.00
      const result = service.estimateFee('small', 0, 0, 0.09, 0); // ~10km
      expect(result.fee).toBeGreaterThan(13);
      expect(result.fee).toBeLessThan(17);
    });

    it('should estimate medium package fee correctly', () => {
      // 3km: base $8 + 3 * $1.50 = $12.50
      const result = service.estimateFee('medium', 0, 0, 0.027, 0); // ~3km
      expect(result.fee).toBeGreaterThan(11);
      expect(result.fee).toBeLessThan(14);
    });

    it('should estimate large package fee correctly', () => {
      // 1km: base $12 + 1 * $2.00 = $14.00
      const result = service.estimateFee('large', 0, 0, 0.009, 0); // ~1km
      expect(result.fee).toBeGreaterThan(13);
      expect(result.fee).toBeLessThan(15);
    });

    it('should throw for invalid package category', () => {
      expect(() => service.estimateFee('invalid', 0, 0, 1, 1)).toThrow('Invalid package category');
    });

    it('should return higher fee for longer distances', () => {
      const short = service.estimateFee('small', 0, 0, 0.009, 0); // ~1km
      const long = service.estimateFee('small', 0, 0, 0.09, 0); // ~10km
      expect(long.fee).toBeGreaterThan(short.fee);
    });

    it('should return higher fee for larger packages at same distance', () => {
      const doc = service.estimateFee('document', 0, 0, 0.045, 0);
      const large = service.estimateFee('large', 0, 0, 0.045, 0);
      expect(large.fee).toBeGreaterThan(doc.fee);
    });
  });
});
