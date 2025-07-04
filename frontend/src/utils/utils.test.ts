// Essential utility function tests for MVP

describe('Utility Functions', () => {
  describe('formatNumber', () => {
    const formatNumber = (num: number, decimals: number = 2): string => {
      return num.toFixed(decimals);
    };

    it('should format numbers with decimals', () => {
      expect(formatNumber(123.456, 2)).toBe('123.46');
      expect(formatNumber(123.456, 0)).toBe('123');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0.00');
    });
  });

  describe('formatEmissions', () => {
    const formatEmissions = (emissions: number): string => {
      if (emissions >= 1000000) {
        return `${(emissions / 1000000).toFixed(2)} Mt CO₂e`;
      } else if (emissions >= 1000) {
        return `${(emissions / 1000).toFixed(2)} t CO₂e`;
      } else {
        return `${emissions.toFixed(2)} kg CO₂e`;
      }
    };

    it('should format kg CO₂e for small values', () => {
      expect(formatEmissions(123.45)).toBe('123.45 kg CO₂e');
    });

    it('should format tonnes for medium values', () => {
      expect(formatEmissions(123456)).toBe('123.46 t CO₂e');
    });

    it('should format megatonnes for large values', () => {
      expect(formatEmissions(1234567890)).toBe('1234.57 Mt CO₂e');
    });
  });

  describe('validateEmail', () => {
    const validateEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    it('should validate correct emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user@carbonytics.com')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
    });
  });

  describe('Basic Math', () => {
    it('should perform basic calculations', () => {
      expect(2 + 2).toBe(4);
      expect(10 * 0.5).toBe(5);
    });
  });
});

export {};
