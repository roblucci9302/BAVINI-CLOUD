/**
 * Unit tests for Node.js util module
 */

import { describe, it, expect, vi } from 'vitest';
import * as util from '../core-modules/util';

describe('util module', () => {
  describe('format', () => {
    it('should format strings', () => {
      expect(util.format('hello %s', 'world')).toBe('hello world');
    });

    it('should format numbers', () => {
      expect(util.format('count: %d', 42)).toBe('count: 42');
      expect(util.format('pi: %f', 3.14)).toBe('pi: 3.14');
    });

    it('should format integers', () => {
      expect(util.format('int: %i', 42.7)).toBe('int: 42');
    });

    it('should format JSON', () => {
      expect(util.format('obj: %j', { a: 1 })).toBe('obj: {"a":1}');
    });

    it('should handle percent sign', () => {
      expect(util.format('100%% done')).toBe('100% done');
    });

    it('should concatenate when first arg is not string', () => {
      expect(util.format(1, 2, 3)).toBe('1 2 3');
    });

    it('should handle extra args', () => {
      // Extra args are inspected (strings get quotes)
      expect(util.format('%s', 'a', 'b')).toContain('a');
      expect(util.format('%s', 'a', 'b')).toContain('b');
    });
  });

  describe('inspect', () => {
    it('should inspect null', () => {
      expect(util.inspect(null)).toBe('null');
    });

    it('should inspect undefined', () => {
      expect(util.inspect(undefined)).toBe('undefined');
    });

    it('should inspect strings', () => {
      expect(util.inspect('hello')).toBe("'hello'");
    });

    it('should inspect numbers', () => {
      expect(util.inspect(42)).toBe('42');
    });

    it('should inspect booleans', () => {
      expect(util.inspect(true)).toBe('true');
    });

    it('should inspect arrays', () => {
      const result = util.inspect([1, 2, 3]);
      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).toContain('3');
    });

    it('should inspect objects', () => {
      const result = util.inspect({ a: 1, b: 2 });
      expect(result).toContain('a');
      expect(result).toContain('1');
    });

    it('should handle circular references', () => {
      const obj: { self?: unknown } = {};
      obj.self = obj;
      expect(() => util.inspect(obj)).not.toThrow();
    });

    it('should respect depth option', () => {
      const deep = { a: { b: { c: { d: 1 } } } };
      const shallow = util.inspect(deep, { depth: 1 });
      expect(shallow).toContain('[Object]');
    });
  });

  describe('deprecate', () => {
    it('should return function', () => {
      const fn = () => 42;
      const deprecated = util.deprecate(fn, 'old function');
      expect(deprecated()).toBe(42);
    });
  });

  describe('promisify', () => {
    it('should promisify callback-style function', async () => {
      const callbackFn = (a: number, b: number, cb: (err: Error | null, result: number) => void) => {
        cb(null, a + b);
      };

      const promisified = util.promisify(callbackFn);
      const result = await promisified(1, 2);
      expect(result).toBe(3);
    });

    it('should handle errors', async () => {
      const callbackFn = (cb: (err: Error | null) => void) => {
        cb(new Error('test error'));
      };

      const promisified = util.promisify(callbackFn);
      await expect(promisified()).rejects.toThrow('test error');
    });
  });

  describe('inherits', () => {
    it('should set up inheritance', () => {
      function Parent() {}
      Parent.prototype.hello = () => 'hello';

      function Child() {}
      util.inherits(Child, Parent);

      const child = new (Child as new () => { hello: () => string })();
      expect(child.hello()).toBe('hello');
    });
  });

  describe('callbackify', () => {
    it('should callbackify async function', () => {
      const asyncFn = async () => 42;
      const callbackified = util.callbackify(asyncFn);

      callbackified((err, result) => {
        expect(err).toBeNull();
        expect(result).toBe(42);
      });
    });

    it('should handle errors', () => {
      const asyncFn = async () => {
        throw new Error('test error');
      };
      const callbackified = util.callbackify(asyncFn);

      callbackified((err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe('test error');
      });
    });
  });

  describe('type checking functions', () => {
    describe('isArray', () => {
      it('should detect arrays', () => {
        expect(util.isArray([])).toBe(true);
        expect(util.isArray([1, 2, 3])).toBe(true);
        expect(util.isArray({})).toBe(false);
      });
    });

    describe('isBoolean', () => {
      it('should detect booleans', () => {
        expect(util.isBoolean(true)).toBe(true);
        expect(util.isBoolean(false)).toBe(true);
        expect(util.isBoolean(0)).toBe(false);
      });
    });

    describe('isNull', () => {
      it('should detect null', () => {
        expect(util.isNull(null)).toBe(true);
        expect(util.isNull(undefined)).toBe(false);
      });
    });

    describe('isUndefined', () => {
      it('should detect undefined', () => {
        expect(util.isUndefined(undefined)).toBe(true);
        expect(util.isUndefined(null)).toBe(false);
      });
    });

    describe('isNullOrUndefined', () => {
      it('should detect null or undefined', () => {
        expect(util.isNullOrUndefined(null)).toBe(true);
        expect(util.isNullOrUndefined(undefined)).toBe(true);
        expect(util.isNullOrUndefined(0)).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should detect numbers', () => {
        expect(util.isNumber(42)).toBe(true);
        expect(util.isNumber(NaN)).toBe(true);
        expect(util.isNumber('42')).toBe(false);
      });
    });

    describe('isString', () => {
      it('should detect strings', () => {
        expect(util.isString('hello')).toBe(true);
        expect(util.isString('')).toBe(true);
        expect(util.isString(42)).toBe(false);
      });
    });

    describe('isSymbol', () => {
      it('should detect symbols', () => {
        expect(util.isSymbol(Symbol('test'))).toBe(true);
        expect(util.isSymbol('symbol')).toBe(false);
      });
    });

    describe('isObject', () => {
      it('should detect objects', () => {
        expect(util.isObject({})).toBe(true);
        expect(util.isObject([])).toBe(true);
        expect(util.isObject(null)).toBe(false);
      });
    });

    describe('isFunction', () => {
      it('should detect functions', () => {
        expect(util.isFunction(() => {})).toBe(true);
        expect(util.isFunction(function () {})).toBe(true);
        expect(util.isFunction({})).toBe(false);
      });
    });

    describe('isRegExp', () => {
      it('should detect regular expressions', () => {
        expect(util.isRegExp(/test/)).toBe(true);
        expect(util.isRegExp(new RegExp('test'))).toBe(true);
        expect(util.isRegExp('test')).toBe(false);
      });
    });

    describe('isDate', () => {
      it('should detect dates', () => {
        expect(util.isDate(new Date())).toBe(true);
        expect(util.isDate('2024-01-01')).toBe(false);
      });
    });

    describe('isError', () => {
      it('should detect errors', () => {
        expect(util.isError(new Error())).toBe(true);
        expect(util.isError(new TypeError())).toBe(true);
        expect(util.isError({ message: 'error' })).toBe(false);
      });
    });

    describe('isPrimitive', () => {
      it('should detect primitives', () => {
        expect(util.isPrimitive(42)).toBe(true);
        expect(util.isPrimitive('hello')).toBe(true);
        expect(util.isPrimitive(null)).toBe(true);
        expect(util.isPrimitive({})).toBe(false);
      });
    });
  });

  describe('TextEncoder/TextDecoder', () => {
    it('should provide TextEncoder', () => {
      expect(util.TextEncoder).toBe(globalThis.TextEncoder);
    });

    it('should provide TextDecoder', () => {
      expect(util.TextDecoder).toBe(globalThis.TextDecoder);
    });
  });
});
