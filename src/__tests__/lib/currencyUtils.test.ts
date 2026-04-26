import { formatCurrency, convertCurrency, getCurrencySymbol } from '@/lib/currencyUtils';

describe('Currency Utils', () => {
  describe('formatCurrency', () => {
    it('should format ZAR currency correctly', () => {
      expect(formatCurrency(1000, 'ZAR')).toBe('R1,000.00');
      expect(formatCurrency(1234.56, 'ZAR')).toBe('R1,234.56');
    });

    it('should format USD currency correctly', () => {
      expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
    });

    it('should format GBP currency correctly', () => {
      expect(formatCurrency(1000, 'GBP')).toBe('£1,000.00');
      expect(formatCurrency(1234.56, 'GBP')).toBe('£1,234.56');
    });

    it('should handle zero values', () => {
      expect(formatCurrency(0, 'ZAR')).toBe('R0.00');
    });

    it('should handle negative values', () => {
      expect(formatCurrency(-100, 'ZAR')).toBe('-R100.00');
    });
  });

  describe('getCurrencySymbol', () => {
    it('should return correct symbols', () => {
      expect(getCurrencySymbol('ZAR')).toBe('R');
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('GBP')).toBe('£');
      expect(getCurrencySymbol('EUR')).toBe('€');
    });

    it('should handle unknown currencies', () => {
      expect(getCurrencySymbol('XXX' as any)).toBe('XXX');
    });
  });

  describe('convertCurrency', () => {
    it('should convert ZAR to USD', () => {
      const result = convertCurrency(1000, 'ZAR', 'USD', 18.5);
      expect(result).toBeCloseTo(54.05, 2);
    });

    it('should convert USD to ZAR', () => {
      const result = convertCurrency(100, 'USD', 'ZAR', 18.5);
      expect(result).toBe(1850);
    });

    it('should return same amount for same currency', () => {
      expect(convertCurrency(100, 'ZAR', 'ZAR', 18.5)).toBe(100);
    });
  });
});