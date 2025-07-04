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
  
      it('should handle large numbers', () => {
        expect(formatNumber(1234567.89)).toBe('1234567.89');
      });
    });
  
    describe('formatCurrency', () => {
      const formatCurrency = (amount: number, currency: string = 'USD'): string => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency,
        }).format(amount);
      };
  
      it('should format USD currency', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
      });
  
      it('should handle zero amount', () => {
        expect(formatCurrency(0)).toBe('$0.00');
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
        expect(formatEmissions(1234567)).toBe('1234.57 t CO₂e');
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
  });
  