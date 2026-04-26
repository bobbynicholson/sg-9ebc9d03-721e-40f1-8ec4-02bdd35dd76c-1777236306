import { formatCurrency, convertCurrency } from '@/lib/currencyUtils';

describe('Currency Utils', () => {
  describe('formatCurrency', () => {
    it('should format ZAR currency to a string', () => {
      const result = formatCurrency(1000, 'ZAR');
      expect(typeof result).toBe('string');
    });

    it('should format USD currency to a string', () => {
      const result = formatCurrency(1000, 'USD');
      expect(typeof result).toBe('string');
    });
  });

  describe('convertCurrency', () => {
    it('should convert ZAR to USD and return a number', () => {
      const result = convertCurrency(1000, 'ZAR', 'USD');
      expect(typeof result).toBe('number');
    });

    it('should convert USD to ZAR and return a number', () => {
      const result = convertCurrency(100, 'USD', 'ZAR');
      expect(typeof result).toBe('number');
    });
  });
});