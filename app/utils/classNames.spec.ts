import { describe, it, expect } from 'vitest';
import { classNames } from './classNames';

describe('classNames', () => {
  describe('with string arguments', () => {
    it('should return empty string for no arguments', () => {
      expect(classNames()).toBe('');
    });

    it('should return single class name', () => {
      expect(classNames('foo')).toBe('foo');
    });

    it('should join multiple class names with space', () => {
      expect(classNames('foo', 'bar')).toBe('foo bar');
    });

    it('should handle three or more class names', () => {
      expect(classNames('foo', 'bar', 'baz')).toBe('foo bar baz');
    });
  });

  describe('with object arguments', () => {
    it('should include class when value is true', () => {
      expect(classNames({ foo: true })).toBe('foo');
    });

    it('should exclude class when value is false', () => {
      expect(classNames({ foo: false })).toBe('');
    });

    it('should handle mixed true/false values', () => {
      expect(classNames({ foo: true, bar: false, baz: true })).toBe('foo baz');
    });

    it('should combine object with string', () => {
      expect(classNames('base', { active: true })).toBe('base active');
    });

    it('should handle empty object', () => {
      expect(classNames({})).toBe('');
    });
  });

  describe('with array arguments', () => {
    it('should flatten nested arrays', () => {
      expect(classNames(['foo', 'bar'])).toBe('foo bar');
    });

    it('should handle nested arrays with objects', () => {
      expect(classNames(['foo', { bar: true, baz: false }])).toBe('foo bar');
    });

    it('should handle deeply nested arrays', () => {
      expect(classNames([['foo'], [['bar']]])).toBe('foo bar');
    });
  });

  describe('with undefined/null values', () => {
    it('should ignore undefined values', () => {
      expect(classNames('foo', undefined, 'bar')).toBe('foo bar');
    });

    it('should handle all undefined values', () => {
      expect(classNames(undefined, undefined)).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle mixed argument types', () => {
      expect(classNames('base', { active: true, disabled: false }, ['extra', { hidden: true }])).toBe(
        'base active extra hidden',
      );
    });

    it('should handle empty string', () => {
      expect(classNames('')).toBe('');
    });

    it('should handle whitespace in class names', () => {
      expect(classNames('foo bar')).toBe('foo bar');
    });
  });
});
