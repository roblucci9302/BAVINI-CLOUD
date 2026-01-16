import { describe, it, expect } from 'vitest';
import { stripIndents } from './stripIndent';

describe('stripIndents', () => {
  describe('with string argument', () => {
    it('should strip leading whitespace from each line', () => {
      const input = `
        line 1
        line 2
        line 3
      `;
      expect(stripIndents(input)).toBe('line 1\nline 2\nline 3');
    });

    it('should handle single line', () => {
      expect(stripIndents('  hello  ')).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(stripIndents('')).toBe('');
    });

    it('should preserve empty lines between content', () => {
      const input = `
        line 1

        line 3
      `;
      expect(stripIndents(input)).toBe('line 1\n\nline 3');
    });

    it('should handle mixed indentation levels', () => {
      const input = `
        level 1
            level 2
        level 1 again
      `;
      expect(stripIndents(input)).toBe('level 1\nlevel 2\nlevel 1 again');
    });

    it('should trim trailing newlines', () => {
      const input = `hello\n`;
      expect(stripIndents(input)).toBe('hello');
    });
  });

  describe('with template literal', () => {
    it('should work as tagged template literal', () => {
      const result = stripIndents`
        line 1
        line 2
      `;
      expect(result).toBe('line 1\nline 2');
    });

    it('should handle interpolated values', () => {
      const value = 'world';
      const result = stripIndents`
        hello ${value}
        goodbye ${value}
      `;
      expect(result).toBe('hello world\ngoodbye world');
    });

    it('should handle multiple interpolations', () => {
      const a = 'foo';
      const b = 'bar';
      const c = 'baz';
      const result = stripIndents`
        ${a} and ${b}
        then ${c}
      `;
      expect(result).toBe('foo and bar\nthen baz');
    });

    it('should handle undefined interpolations', () => {
      const value = undefined;
      const result = stripIndents`
        hello ${value}
      `;
      expect(result).toBe('hello');
    });

    it('should handle numeric interpolations', () => {
      const num = 42;
      const result = stripIndents`
        answer: ${num}
      `;
      expect(result).toBe('answer: 42');
    });
  });

  describe('edge cases', () => {
    it('should handle tabs as whitespace', () => {
      const input = '\t\thello';
      expect(stripIndents(input)).toBe('hello');
    });

    it('should handle mixed tabs and spaces', () => {
      const input = '  \t  hello';
      expect(stripIndents(input)).toBe('hello');
    });
  });
});
