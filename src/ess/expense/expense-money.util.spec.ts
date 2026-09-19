import { csvEscape, normalizeMoneyAmount } from './expense-money.util';

describe('expense-money.util', () => {
  describe('csvEscape', () => {
    it('prefixes formula-like values', () => {
      expect(csvEscape('=1+1')).toBe("'=1+1");
      expect(csvEscape('+cmd')).toBe("'+cmd");
      expect(csvEscape('-1')).toBe("'-1");
      expect(csvEscape('@ref')).toBe("'@ref");
    });

    it('quotes cells with commas', () => {
      expect(csvEscape('a,b')).toBe('"a,b"');
    });

    it('escapes embedded quotes', () => {
      expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    });
  });

  describe('normalizeMoneyAmount', () => {
    it('formats to two decimals', () => {
      expect(normalizeMoneyAmount('10')).toBe('10.00');
      expect(normalizeMoneyAmount('10.5')).toBe('10.50');
    });

    it('rejects more than two decimals', () => {
      expect(() => normalizeMoneyAmount('10.555')).toThrow(/2 decimal/);
    });

    it('rejects non-numeric', () => {
      expect(() => normalizeMoneyAmount('abc')).toThrow(/Invalid/);
    });
  });
});
