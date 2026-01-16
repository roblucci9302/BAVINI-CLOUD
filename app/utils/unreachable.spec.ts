import { describe, it, expect } from 'vitest';
import { unreachable } from './unreachable';

describe('unreachable', () => {
  it('should throw an error with the provided message', () => {
    expect(() => unreachable('test message')).toThrow('Unreachable: test message');
  });

  it('should throw an Error instance', () => {
    expect(() => unreachable('error')).toThrow(Error);
  });

  it('should include "Unreachable:" prefix in error message', () => {
    try {
      unreachable('custom message');
    } catch (error) {
      expect((error as Error).message).toBe('Unreachable: custom message');
    }
  });

  it('should handle empty message', () => {
    expect(() => unreachable('')).toThrow('Unreachable: ');
  });

  it('should handle special characters in message', () => {
    expect(() => unreachable('test: "special" <chars>')).toThrow('Unreachable: test: "special" <chars>');
  });
});
